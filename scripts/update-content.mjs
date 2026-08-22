import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const RETENTION_DAYS = 30;
const sections = [
  ["AI", "(artificial intelligence OR foundation model OR AI agent) -sports -celebrity", 5],
  ["具身智能", "(embodied AI OR humanoid robot OR robotics foundation model)", 6],
  ["科技", "(semiconductor OR cloud computing OR technology investment)", 6],
  ["前沿科学", "(site:nature.com OR site:science.org OR site:cell.com OR site:arxiv.org) (quantum OR gene editing OR climate OR astronomy OR materials)", 6],
  ["新闻", "(world news OR global affairs OR geopolitics)", 6],
];
const fallback = Object.fromEntries(sections.map(([section]) => [section, { title: `${section}每日内容自动重试中`, source: "Stellar AI", url: "https://github.com/stevenlee2125hero/stellar-daily" }]));

function clean(value = "") { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim(); }
function tag(item, name) { return clean(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || ""); }
function source(item) { return clean(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "公开来源"); }
function shiftDate(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function storyId(date, section, url, index) { return `daily-${date}-${section}-${createHash("sha1").update(`${url}-${index}`).digest("hex").slice(0, 10)}`; }
function beijingDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

async function fetchSection(section, query, minimum, archiveDate, previousStories = []) {
  const sourceDate = shiftDate(archiveDate, -1);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} after:${sourceDate} before:${archiveDate}`)}&hl=zh-CN&gl=US&ceid=US:zh-Hans`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Stellar-AI-GitHub-Actions/2.0" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`RSS ${response.status}`);
    const body = await response.text();
    const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, section === "AI" ? 5 : 8);
    const stories = items.map((match, index) => {
      const item = match[1], originalUrl = tag(item, "link") || fallback[section].url;
      const title = tag(item, "title") || fallback[section].title, src = source(item);
      const rawSummary = tag(item, "description");
      const summary = rawSummary && !rawSummary.includes(title) ? rawSummary : `来自${src}的报道关注“${title}”，本文已整理核心信息并保留原始来源供核验。`;
      return { id: storyId(archiveDate, section, originalUrl, index), section, kicker: `${src} · ${sourceDate}`, title, summary, full: `${summary}\n\n背景：这项内容放在全球行业与研究趋势中观察，重点关注事实、方法、数据和限制。\n\n为什么重要：它可能影响产品路线、研究方向、产业投入或公共政策。\n\n值得继续关注：请以原始来源、后续数据和独立验证为准。`, source: src, url: originalUrl, time: "8 分钟" };
    }).filter(story => story.url);
    if (stories.length >= minimum) return { stories, fallback: false };
    throw new Error(`only ${stories.length}/${minimum} usable stories`);
  } catch (error) {
    console.warn(`refresh ${archiveDate} ${section} failed: ${error.message}`);
    const reusable = previousStories.filter(story => story.section === section).slice(0, minimum);
    const seeds = reusable.length ? reusable : Array.from({ length: minimum }, () => fallback[section]);
    return { fallback: true, stories: seeds.map((story, index) => ({ id: storyId(archiveDate, section, story.url || fallback[section].url, index), section, kicker: `数据源重试中 · ${sourceDate}`, title: story.title || fallback[section].title, summary: "自动抓取暂未取得足够新条目。本条沿用最近一次可用内容，后续定时任务会自动重试。", full: "自动抓取暂未取得足够新条目，因此保留最近一次可用内容，避免当天归档中断。\n\n系统会在下一次 GitHub Actions 任务中自动重试；原始来源链接保留供核验。", source: story.source || fallback[section].source, url: story.url || fallback[section].url, time: story.time || "5 分钟", stale: true })) };
  }
}

async function refreshDay(date, previousStories) {
  const batches = await Promise.all(sections.map(([section, query, minimum]) => fetchSection(section, query, minimum, date, previousStories)));
  return { stories: batches.flatMap(batch => batch.stories), fallbackSections: batches.filter(batch => batch.fallback).length };
}

const todayDate = beijingDate(), file = "public/data/content.json";
let previous = { today: [], archives: {}, knowledge: null, knowledgeArchives: {}, metadata: {} };
try { previous = JSON.parse(await readFile(file, "utf8")); } catch { /* First run starts a new archive. */ }
const existingDates = Object.keys(previous.archives || {}).filter(date => date <= todayDate).sort();
const retentionStart = shiftDate(todayDate, 1 - RETENTION_DAYS);
const archiveStart = existingDates.length && existingDates[0] > retentionStart ? existingDates[0] : retentionStart;
const dayCount = Math.round((new Date(`${todayDate}T00:00:00Z`).getTime() - new Date(`${archiveStart}T00:00:00Z`).getTime()) / 86400000) + 1;
const dates = Array.from({ length: dayCount }, (_, index) => shiftDate(archiveStart, index));
const archives = { ...(previous.archives || {}) }, knowledgeArchives = { ...(previous.knowledgeArchives || {}) };
let previousStories = [];
const refreshResults = [];
for (const date of dates) {
  if (date !== todayDate && Array.isArray(archives[date]) && archives[date].length) { previousStories = archives[date]; continue; }
  const result = await refreshDay(date, previousStories);
  archives[date] = result.stories;
  knowledgeArchives[date] = result.stories.find(story => story.section === "AI") || result.stories[0] || null;
  previousStories = result.stories;
  refreshResults.push({ date, fallbackSections: result.fallbackSections });
}
for (const key of Object.keys(archives)) if (!dates.includes(key)) delete archives[key];
for (const key of Object.keys(knowledgeArchives)) if (!dates.includes(key)) delete knowledgeArchives[key];
const today = archives[todayDate], knowledge = knowledgeArchives[todayDate];
await mkdir("public/data", { recursive: true });
await writeFile(file, JSON.stringify({ today, archives, knowledge, knowledgeArchives, metadata: { updatedAt: new Date().toISOString(), timeZone: "Asia/Shanghai", retentionDays: RETENTION_DAYS, sourceWindow: "previous-calendar-day", refreshResults } }, null, 2) + "\n");
console.log(`Updated ${todayDate}: ${today.length} stories; archive days=${Object.keys(archives).length}`);
