const site = process.argv[2] || "https://stevenlee2125hero.github.io/stellar-daily/";
const required = { AI: 5, 具身智能: 6, 科技: 6, 前沿科学: 6, 新闻: 6 };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
let lastError;
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const response = await fetch(new URL(`data/content.json?v=${Date.now()}`, site), { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`content HTTP ${response.status}`);
    const data = await response.json(), dates = Object.keys(data.archives || {}).sort(), latest = dates.at(-1), all = dates.flatMap(date => data.archives[date]);
    if (latest !== today) throw new Error(`online latest ${latest}, expected ${today}`);
    if (JSON.stringify(data.today) !== JSON.stringify(data.archives[latest])) throw new Error("today does not match latest archive");
    const urls = new Set(), titles = new Set();
    for (const story of all) {
      const title = story.title.trim().toLocaleLowerCase();
      if (urls.has(story.url)) throw new Error(`duplicate archive URL ${story.url}`);
      if (titles.has(title)) throw new Error(`duplicate archive title ${story.title}`);
      urls.add(story.url); titles.add(title);
    }
    for (const [section, minimum] of Object.entries(required)) {
      const count = data.today.filter(story => story.section === section).length;
      if (count < minimum) throw new Error(`${section} has ${count}/${minimum}`);
    }
    const audioStatuses = await Promise.all(data.today.map(story => fetch(new URL(story.audio, site), { method: "HEAD", signal: AbortSignal.timeout(15000) }).then(result => result.status)));
    if (audioStatuses.some(status => status !== 200)) throw new Error(`${audioStatuses.filter(status => status !== 200).length} audio files unavailable`);
    console.log(`Deployment verified: ${latest}, ${data.today.length} stories, ${audioStatuses.length} audio files, ${all.length} archive URLs unique`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Verification ${attempt}/12 failed: ${error.message}`);
    if (attempt < 12) await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
throw lastError;
