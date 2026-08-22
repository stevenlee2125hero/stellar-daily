import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const RETENTION_DAYS = 30;
const sections = [
  ["AI", "(artificial intelligence OR foundation model OR AI agent) -sports -celebrity", 5],
  ["具身智能", "(embodied AI OR humanoid robot OR robotics foundation model)", 6],
  ["科技", "(semiconductor OR cloud computing OR technology investment)", 6],
  ["前沿科学", "(quantum OR gene editing OR climate science OR astronomy OR materials science)", 6],
  ["新闻", "(world news OR global affairs OR geopolitics)", 6],
];

function clean(value = "") { let decoded = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"); for (let pass = 0; pass < 3; pass++) decoded = decoded.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'"); return decoded.replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim(); }
function tag(item, name) { return clean(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || ""); }
function rawTag(item, name) { return (item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim(); }
function source(item) { return clean(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "公开来源"); }
function shiftDate(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function storyId(date, section, url, index) { return `daily-${date}-${section}-${createHash("sha1").update(`${url}-${index}`).digest("hex").slice(0, 10)}`; }
function beijingDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

function analysis(section, sourceName) {
  const topic = section === "AI" ? "模型能力、智能体应用与产业采用" : section === "具身智能" ? "机器人感知、决策、控制与真实环境落地" : section === "科技" ? "技术产品、基础设施与产业竞争" : section === "前沿科学" ? "研究方法、实验结果及其可复现性" : "事件背景、各方立场及其潜在影响";
  const summary = `这项更新涉及${topic}。报道来自${sourceName}，需结合原始材料判断进展的成熟度与实际影响。`;
  return { summary, full: `核心信息：公开报道呈现了该领域的新动向，判断价值时应区分已经发生的事实、相关方的判断，以及仍待验证的预期。\n\n为什么值得关注：这类进展可能影响后续的产品路线、研究投入、行业竞争或公共决策。\n\n核验建议：优先检查原始来源中的时间、数据、研究方法和适用范围，并持续关注独立验证与后续更新。` };
}

async function fetchSection(section, query, minimum, archiveDate) {
  const sourceDate = shiftDate(archiveDate, -1), searches = [`${query} after:${sourceDate} before:${archiveDate}`, `${query} when:7d`];
  let lastError = "no usable stories";
  for (const search of searches) try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(search)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Stellar-AI-Daily/3.0" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`RSS ${response.status}`);
    const body = await response.text(), items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12);
    const stories = items.map((match, index) => {
      const item = match[1], originalUrl = rawTag(item, "link"), sourceName = source(item), rawTitle = tag(item, "title");
      const title = rawTitle.endsWith(` - ${sourceName}`) ? rawTitle.slice(0, -(` - ${sourceName}`).length) : rawTitle;
      const { summary, full } = analysis(section, sourceName);
      return { id: storyId(archiveDate, section, originalUrl, index), section, kicker: `${sourceName} · ${sourceDate}`, title, summary, full, source: sourceName, url: originalUrl, time: "8 分钟" };
    }).filter(story => story.url.startsWith("https://") && story.title && story.source !== "公开来源");
    if (stories.length >= minimum) return stories.slice(0, minimum);
    lastError = `only ${stories.length}/${minimum} usable stories`;
  } catch (error) { lastError = error.message; }
  throw new Error(`refresh ${archiveDate} ${section} failed: ${lastError}`);
}

async function refreshDay(date) { return (await Promise.all(sections.map(([section, query, minimum]) => fetchSection(section, query, minimum, date)))).flat(); }

const todayDate = beijingDate(), file = "public/data/content.json";
let previous = { today: [], archives: {}, knowledge: null, knowledgeArchives: {}, metadata: {} };
try { previous = JSON.parse(await readFile(file, "utf8")); } catch { /* First run starts a new archive. */ }
const existingDates = Object.keys(previous.archives || {}).filter(date => date <= todayDate).sort();
const retentionStart = shiftDate(todayDate, 1 - RETENTION_DAYS), minimumStart = shiftDate(todayDate, -1);
const archiveStart = existingDates.length && existingDates[0] < minimumStart ? existingDates[0] : minimumStart;
const dayCount = Math.round((new Date(`${todayDate}T00:00:00Z`).getTime() - new Date(`${archiveStart}T00:00:00Z`).getTime()) / 86400000) + 1;
const dates = Array.from({ length: dayCount }, (_, index) => shiftDate(archiveStart, index)).filter(date => date >= retentionStart);
const archives = { ...(previous.archives || {}) }, knowledgeArchives = { ...(previous.knowledgeArchives || {}) }, refreshResults = [];
for (const date of dates) {
  if (date < minimumStart && Array.isArray(archives[date]) && archives[date].length) continue;
  const stories = await refreshDay(date);
  archives[date] = stories; knowledgeArchives[date] = stories.find(story => story.section === "AI") || stories[0] || null;
  refreshResults.push({ date, sections: sections.length, stories: stories.length });
}
for (const key of Object.keys(archives)) if (!dates.includes(key)) delete archives[key];
for (const key of Object.keys(knowledgeArchives)) if (!dates.includes(key)) delete knowledgeArchives[key];
const today = archives[todayDate], knowledge = knowledgeArchives[todayDate];
await mkdir("public/data", { recursive: true });
await writeFile(file, JSON.stringify({ today, archives, knowledge, knowledgeArchives, metadata: { updatedAt: new Date().toISOString(), timeZone: "Asia/Shanghai", retentionDays: RETENTION_DAYS, sourceWindow: "previous-calendar-day-with-seven-day-recovery", refreshResults } }, null, 2) + "\n");
console.log(`Updated ${todayDate}: ${today.length} stories; archive days=${Object.keys(archives).length}`);
