const site = process.argv[2] || "https://stevenlee2125hero.github.io/stellar-daily/";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
try {
  const response = await fetch(new URL(`data/content.json?v=${Date.now()}`, site), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) process.exit(1);
  const data = await response.json(), latest = Object.keys(data.archives || {}).sort().at(-1);
  console.log(`Online latest=${latest || "none"}; expected=${today}`);
  process.exit(latest === today && Array.isArray(data.today) && data.today.length > 0 ? 0 : 1);
} catch (error) {
  console.error(`Freshness check failed: ${error.message}`);
  process.exit(1);
}
