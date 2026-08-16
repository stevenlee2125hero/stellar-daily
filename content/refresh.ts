export type ContentStory = {
  id: string;
  section: string;
  kicker: string;
  title: string;
  summary: string;
  full?: string;
  source: string;
  url: string;
  time: string;
};

type D1Like = D1Database;

const sections = [
  ["AI", "人工智能 OR 大模型 OR Agent"],
  ["具身智能", "具身智能 OR 人形机器人 OR 机器人模型"],
  ["科技", "科技 OR 芯片 OR 云计算"],
  ["前沿科学", "科学 OR 量子计算 OR 生物科技"],
  ["新闻", "国际新闻 OR 中国新闻 OR 全球新闻"],
] as const;

function xml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

function tag(item: string, name: string) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? xml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : "";
}

function sourceName(item: string) {
  const match = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
  return match ? xml(match[1]) : "公开来源";
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
}

async function fetchStories(section: string, query: string): Promise<ContentStory[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const response = await fetch(url, { headers: { "User-Agent": "Stellar-AI-personal-news-reader/1.0" } });
  if (!response.ok) throw new Error(`RSS ${response.status}`);
  const body = await response.text();
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5);
  return items.map((match, index) => {
    const item = match[1];
    const title = tag(item, "title") || `${section} 最新动态`;
    const summary = tag(item, "description").replace(/\s+/g, " ").slice(0, 220) || "公开来源最新报道，已保留原始链接供核验。";
    const link = tag(item, "link");
    return { id: `daily-${section}-${index}-${crypto.randomUUID().slice(0, 8)}`, section, kicker: `${sourceName(item)} · 最新`, title, summary, full: `${summary}\n\n本文来自公开新闻聚合源，原始页面可能需要在来源网站查看完整上下文。`, source: sourceName(item), url: link, time: "5 分钟" };
  }).filter(story => story.url);
}

export async function refreshContent(db: D1Like) {
  const date = todayKey();
  await db.prepare("CREATE TABLE IF NOT EXISTS daily_content (content_date TEXT NOT NULL, story_id TEXT PRIMARY KEY, section TEXT NOT NULL, story_json TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS knowledge_content (content_date TEXT PRIMARY KEY, story_json TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  const batches = await Promise.all(sections.map(([section, query]) => fetchStories(section, query)));
  const stories = batches.flat();
  const statements = stories.map(story => db.prepare("INSERT OR REPLACE INTO daily_content(content_date,story_id,section,story_json,created_at) VALUES(?1,?2,?3,?4,?5)").bind(date, story.id, story.section, JSON.stringify(story), new Date().toISOString()));
  await db.batch(statements);
  const knowledge = stories.find(story => story.section === "AI") || stories[0];
  if (knowledge) await db.prepare("INSERT OR REPLACE INTO knowledge_content(content_date,story_json,created_at) VALUES(?1,?2,?3)").bind(date, JSON.stringify({ ...knowledge, id: `knowledge-${date}`, section: "大模型知识", kicker: "每日专题", title: `今日大模型知识：${knowledge.title}`, summary: `从今天的真实报道理解一个大模型相关概念：${knowledge.summary}`, full: `${knowledge.summary}\n\n建议结合原始来源和实际案例理解这个概念，不把单条新闻直接当成模型能力结论。` }), new Date().toISOString()).run();
  await db.prepare("DELETE FROM daily_content WHERE content_date < date(?1, '-30 day')").bind(date).run();
  await db.prepare("DELETE FROM knowledge_content WHERE content_date < date(?1, '-30 day')").bind(date).run();
  return { date, stories: stories.length };
}

