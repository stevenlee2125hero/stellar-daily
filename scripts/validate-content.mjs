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
}
for (const date of dates) {
  const stories = data.archives[date];
  const ids = new Set();
  for (const story of stories) {
    for (const field of ["id", "section", "title", "summary", "source", "url"]) if (!story[field]) throw new Error(`${date}: story missing ${field}`);
    if (story.stale || /数据源重试中|自动重试|暂未取得足够/i.test(`${story.kicker} ${story.title} ${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains fallback/error content`);
    if (/这项更新涉及|核心信息：公开报道呈现|为什么值得关注：这类进展|核验建议：优先检查/i.test(`${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains generic filler content`);
    if (!story.url.startsWith("https://") || story.url.includes("github.com/stevenlee2125hero/stellar-daily")) throw new Error(`${date}: ${story.id} does not link to a real source`);
    if ("image" in story) throw new Error(`${date}: ${story.id} still contains an image`);
    if (/&(?:amp;)?nbsp;|&lt;|&gt;|<\/?[a-z]|https?:\/\//i.test(`${story.summary} ${story.full || ""}`)) throw new Error(`${date}: ${story.id} contains markup or a raw URL in its body`);
    const titleWithoutSource = story.title.endsWith(` - ${story.source}`) ? story.title.slice(0, -(` - ${story.source}`).length) : story.title;
    if (titleWithoutSource.length > 20 && story.summary.includes(titleWithoutSource)) throw new Error(`${date}: ${story.id} repeats its title in the summary`);
    if (story.full?.trim().startsWith(story.summary.trim())) throw new Error(`${date}: ${story.id} repeats its summary at the start of the full text`);
    if (ids.has(story.id)) throw new Error(`${date}: duplicate id ${story.id}`);
    ids.add(story.id);
  }
  for (const [section, minimum] of Object.entries(required)) {
    const count = stories.filter(story => story.section === section).length;
    if (count < minimum) throw new Error(`${date}: ${section} has ${count}/${minimum}`);
  }
}
const latest = dates.at(-1);
if (JSON.stringify(data.today) !== JSON.stringify(data.archives[latest])) throw new Error("today does not match latest archive");
console.log(`Content valid: ${dates.length} continuous days (${dates[0]}..${latest}), ${data.today.length} current stories`);
