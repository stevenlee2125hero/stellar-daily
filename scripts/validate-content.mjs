import { readFile } from "node:fs/promises";

const file = process.argv[2] || "public/data/content.json";
const data = JSON.parse(await readFile(file, "utf8"));
const required = { AI: 5, 具身智能: 6, 科技: 6, 前沿科学: 6, 新闻: 6 };
const dates = Object.keys(data.archives || {}).sort();
if (!dates.length) throw new Error("No archive data");
if (dates.length < 2) throw new Error(`Archive needs at least 2 days, found ${dates.length}`);
for (let index = 1; index < dates.length; index++) {
  const expected = new Date(`${dates[index - 1]}T00:00:00Z`); expected.setUTCDate(expected.getUTCDate() + 1);
  if (dates[index] !== expected.toISOString().slice(0, 10)) throw new Error(`Archive gap: ${dates[index - 1]} -> ${dates[index]}`);
  if (index === dates.length - 1) {
    const comparisonDates = dates.slice(0, index);
    const previousUrls = new Set(comparisonDates.flatMap(date => data.archives[date].map(story => story.url)));
    const previousTitles = new Set(comparisonDates.flatMap(date => data.archives[date].map(story => story.title.trim().toLocaleLowerCase())));
    const repeated = data.archives[dates[index]].filter(story => previousUrls.has(story.url));
    const repeatedTitles = data.archives[dates[index]].filter(story => previousTitles.has(story.title.trim().toLocaleLowerCase()));
    if (repeated.length) throw new Error(`${dates[index]} repeats ${repeated.length} source URLs from its archive history`);
    if (repeatedTitles.length) throw new Error(`${dates[index]} repeats ${repeatedTitles.length} titles from its archive history`);
  }
}
const archiveUrls = new Set(), archiveTitles = new Set();
for (const date of dates) {
  const stories = data.archives[date];
  const ids = new Set(), urls = new Set();
  for (const story of stories) {
    for (const field of ["id", "section", "title", "summary", "source", "url"]) if (!story[field]) throw new Error(`${date}: story missing ${field}`);
    if (!/[\u4e00-\u9fff]/.test(story.title) || !/[\u4e00-\u9fff]/.test(story.summary)) throw new Error(`${date}: ${story.id} is not translated into Chinese`);
    if (story.summary.length < 220 || story.summary.length > 450) throw new Error(`${date}: ${story.id} summary length ${story.summary.length} is outside 220..450`);
    if (/[…]|\.\.\.$/.test(story.summary)) throw new Error(`${date}: ${story.id} summary ends with an omission marker`);
    if (story.stale || /数据源重试中|自动重试|暂未取得足够/i.test(`${story.kicker} ${story.title} ${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains fallback/error content`);
    if (/这项更新涉及|核心信息：公开报道呈现|为什么值得关注：这类进展|核验建议：优先检查/i.test(`${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains generic filler content`);
    if (/(?:,|，)?\s*en(?=[\u4e00-\u9fff]|$|[\s，。！？；：、（）])|(?:,|，)?\s*zh-CN(?=[\u4e00-\u9fff]|$|[\s，。！？；：、（）])|跳转到内容|桌面徽标|移动徽标|切换大型菜单|提交站点搜索|fetch-start|34\|\|h|最新\s*\*\s*美国|CBS 新闻24\/7|FacebookTwitterPinterest/i.test(`${story.title} ${story.summary}`)) throw new Error(`${date}: ${story.id} contains translation debris or website boilerplate`);
    if (!story.url.startsWith("https://") || story.url.includes("github.com/stevenlee2125hero/stellar-daily")) throw new Error(`${date}: ${story.id} does not link to a real source`);
    if ("image" in story) throw new Error(`${date}: ${story.id} still contains an image`);
    if (/&(?:amp;)?nbsp;|&lt;|&gt;|<\/?[a-z]|https?:\/\//i.test(`${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains markup or a raw URL in its body`);
    const titleWithoutSource = story.title.endsWith(` - ${story.source}`) ? story.title.slice(0, -(` - ${story.source}`).length) : story.title;
    if (titleWithoutSource.length > 20 && story.summary.includes(titleWithoutSource)) throw new Error(`${date}: ${story.id} repeats its title in the summary`);
    if (story.full?.trim().startsWith(story.summary.trim())) throw new Error(`${date}: ${story.id} repeats its summary at the start of the full text`);
    if (ids.has(story.id)) throw new Error(`${date}: duplicate id ${story.id}`);
    if (urls.has(story.url)) throw new Error(`${date}: duplicate source URL ${story.url}`);
    const normalizedTitle = story.title.trim().toLocaleLowerCase();
    if (archiveUrls.has(story.url)) throw new Error(`${date}: source URL already exists in an earlier archive day: ${story.url}`);
    if (archiveTitles.has(normalizedTitle)) throw new Error(`${date}: title already exists in an earlier archive day: ${story.title}`);
    ids.add(story.id);
    urls.add(story.url);
    archiveUrls.add(story.url);
    archiveTitles.add(normalizedTitle);
  }
  for (const [section, minimum] of Object.entries(required)) {
    const count = stories.filter(story => story.section === section).length;
    if (count < minimum) throw new Error(`${date}: ${section} has ${count}/${minimum}`);
  }
}
const latest = dates.at(-1);
if (JSON.stringify(data.today) !== JSON.stringify(data.archives[latest])) throw new Error("today does not match latest archive");
for (const date of dates) {
  const knowledge = data.knowledgeArchives?.[date];
  if (!knowledge?.title || !knowledge?.summary || !knowledge?.full || !knowledge?.url) throw new Error(`${date}: incomplete core knowledge lesson`);
  if (knowledge.full.length < 900) throw new Error(`${date}: core knowledge lesson is too short (${knowledge.full.length})`);
  for (const heading of ["今日为什么值得学", "一句话说明", "核心原理与关键流程", "解决什么问题、为什么重要", "适用与不适用场景", "具体产品案例", "与相近技术的区别和组合关系", "产品经理需要掌握的设计要点、指标与常见坑", "推荐原始论文与技术报告"]) if (!knowledge.full.includes(heading)) throw new Error(`${date}: core knowledge lesson missing ${heading}`);
}
console.log(`Content valid: ${dates.length} continuous days (${dates[0]}..${latest}), ${data.today.length} current stories`);
