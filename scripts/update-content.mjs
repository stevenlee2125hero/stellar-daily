import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const RETENTION_DAYS = 30;
const sections = [
  ["AI", ["https://techcrunch.com/category/artificial-intelligence/feed/"], 5],
  ["具身智能", ["https://spectrum.ieee.org/feeds/topic/robotics.rss"], 6],
  ["科技", ["https://techcrunch.com/feed/", "https://feeds.arstechnica.com/arstechnica/index"], 6],
  ["前沿科学", ["https://www.sciencedaily.com/rss/top/science.xml"], 6],
  ["新闻", ["https://www.theguardian.com/world/rss", "https://feeds.npr.org/1004/rss.xml", "https://www.aljazeera.com/xml/rss/all.xml"], 6],
];

function decodeNumericEntities(value) { return value.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))); }
function clean(value = "") { let decoded = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"); for (let pass = 0; pass < 3; pass++) decoded = decoded.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'"); return decodeNumericEntities(decoded).replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim(); }
function tag(item, name) { return clean(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || ""); }
function rawTag(item, name) { return (item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim(); }
function shiftDate(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function storyId(date, section, url, index) { return `daily-${date}-${section}-${createHash("sha1").update(`${url}-${index}`).digest("hex").slice(0, 10)}`; }
function beijingDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

function sourceFromUrl(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; } }
function publishedDate(item, fallbackDate) { const value = rawTag(item, "pubDate"), parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? fallbackDate : parsed.toISOString().slice(0, 10); }

async function fetchSection(section, feedUrls, minimum, archiveDate) {
  const sourceDate = shiftDate(archiveDate, -1), stories = [];
  for (const feedUrl of feedUrls) {
    try {
      const response = await fetch(feedUrl, { headers: { "User-Agent": "StellarAI-RSSReader/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text(), items = [...body.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 15);
      for (const [index, match] of items.entries()) {
        const item = match[1], originalUrl = rawTag(item, "link").replace(/&amp;/g, "&").replace(/^http:/, "https:"), sourceName = sourceFromUrl(originalUrl), title = tag(item, "title"), summary = tag(item, "description"), date = publishedDate(item, sourceDate);
        if (originalUrl.startsWith("https://") && title.length > 12 && summary.length > 45 && sourceName && !/^Read\b/i.test(summary)) stories.push({ id: storyId(archiveDate, section, originalUrl, index), section, kicker: `${sourceName} · ${date}`, title, summary, source: sourceName, url: originalUrl, time: "3 分钟" });
      }
    } catch (error) { console.warn(`RSS ${section} ${feedUrl} skipped: ${error.message}`); }
  }
  const unique = stories.filter((story, index, all) => all.findIndex(candidate => candidate.url === story.url) === index);
  if (unique.length < minimum) throw new Error(`refresh ${archiveDate} ${section} failed: only ${unique.length}/${minimum} real stories`);
  return unique.slice(0, minimum);
}

async function refreshDay(date) { return (await Promise.all(sections.map(([section, feedUrls, minimum]) => fetchSection(section, feedUrls, minimum, date)))).flat(); }

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
