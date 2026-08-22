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
const translationCache = new Map();
async function translate(text) {
  if (!text || /[\u4e00-\u9fff]/.test(text)) return text;
  if (!translationCache.has(text)) translationCache.set(text, (async () => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`translation returned ${response.status}`);
    const data = await response.json();
    return data[0].map(part => part[0]).join("").replace(/\s+/g, " ").trim();
  })());
  return translationCache.get(text);
}

const knowledgeCurriculum = [
  { title: "Harness：让大模型稳定完成工作的工程外壳", what: "Harness 是围绕大模型搭建的提示词、工具、记忆、权限、重试与评测系统。", principle: "可把模型想成发动机，Harness 是方向盘、仪表盘、刹车和道路规则。请求先被编排器拆解，再调用模型与工具，最后经过校验、重试和审计。", solves: "它把一次性的模型能力变成可重复、可观测、可控制的产品能力，是 Agent 从演示走向生产的关键。", suited: "适合客服、研究、编程和运营自动化；不适合规则完全确定、普通程序即可可靠完成的任务。", example: "编程助手会先读取仓库规则，再检索代码、修改文件、运行测试，并在失败后根据日志重试；这些环节共同构成 Harness。", relation: "模型负责推理，RAG 提供外部知识，MCP 统一工具连接，Agent 负责目标驱动的循环，Harness 把它们组织并约束起来。", pm: "重点关注任务成功率、工具调用成功率、平均重试次数、人工接管率、成本和端到端延迟。常见坑是只看模型回答质量，不测完整任务链路。", papers: "推荐阅读：ReAct（https://arxiv.org/abs/2210.03629），理解推理与行动循环；Toolformer（https://arxiv.org/abs/2302.04761），理解模型如何学习调用工具；OpenAI Agents SDK 文档（https://openai.github.io/openai-agents-python/），观察生产级编排设计。" },
  { title: "RAG：让大模型基于可核验资料回答", what: "RAG 是先检索外部资料，再把相关内容交给大模型生成答案的方法。", principle: "系统把文档切分并转成向量；提问到来后检索相近片段，经重排挑出证据，再连同问题送入模型，并保留引用。", solves: "它缓解知识过期、专业资料缺失和答案不可追溯的问题，但不能自动保证检索结果正确。", suited: "适合企业知识库、客服、研究助手和法规查询；不适合没有可靠资料、必须精确计算或实时强一致写操作的任务。", example: "售后助手先从产品手册和工单中检索对应型号与故障码，再基于命中的原文回答并给出页码。", relation: "Embedding 用于召回，Reranker 提升排序，LLM 负责理解与表达，Agent 可决定何时多轮检索或调用其他工具。", pm: "需要同时看召回率、答案忠实度、引用准确率、无答案识别率、延迟和单次成本。常见坑是切片过碎、权限过滤遗漏以及把模型措辞流畅误当成事实正确。", papers: "推荐阅读：RAG 原始论文（https://arxiv.org/abs/2005.11401），理解检索与生成结合；DPR（https://arxiv.org/abs/2004.04906），理解稠密检索；Lost in the Middle（https://arxiv.org/abs/2307.03172），理解长上下文中的信息位置问题。" },
  { title: "Transformer：大模型理解上下文的基础架构", what: "Transformer 是用注意力机制并行处理序列关系的神经网络架构。", principle: "每个词通过 Query、Key、Value 计算与其他词的相关程度，多头注意力从不同角度聚合信息，前馈网络再完成特征变换。", solves: "它显著提升并行训练能力和长距离依赖建模效果，成为现代语言模型与多模态模型的基础。", suited: "适合语言、视觉、语音及多模态序列建模；对极低算力、严格实时或简单规则问题未必经济。", example: "翻译产品会让当前词同时关注原句中的主语、时态和指代，再生成符合目标语言语序的表达。", relation: "Embedding 把输入变成向量，Transformer 处理上下文，预训练形成基础模型，RAG 和 Agent 则在模型外扩展知识与行动能力。", pm: "应理解上下文窗口、Token 成本、延迟、注意力并不等于可解释性，以及长上下文不代表所有信息都能被同等利用。", papers: "推荐阅读：Attention Is All You Need（https://arxiv.org/abs/1706.03762），Transformer 原始论文；BERT（https://arxiv.org/abs/1810.04805），理解双向预训练；GPT-3（https://arxiv.org/abs/2005.14165），理解规模化与上下文学习。" },
  { title: "Agent：让模型围绕目标持续行动", what: "Agent 是能观察环境、制定步骤、调用工具、检查结果并继续行动的大模型系统。", principle: "典型循环是观察、推理、行动、获得反馈、更新计划，直到完成目标或触发停止条件。", solves: "它适合跨多个系统和步骤的开放任务，但会放大模型错误、权限和成本风险。", suited: "适合研究、编码、数据分析和工作流自动化；不适合不可逆高风险操作或可由确定流程直接完成的任务。", example: "旅行助手比较航班、检查日历、生成方案并等待用户确认后再预订，其中确认边界是关键产品设计。", relation: "Harness 提供运行框架，MCP 连接工具，RAG 提供资料，模型负责决策，评测系统判断整个任务是否成功。", pm: "重点看任务成功率、步骤数、失败恢复率、人工确认点、权限最小化和预算上限。常见坑是给 Agent 过宽权限或没有明确停止条件。", papers: "推荐阅读：ReAct（https://arxiv.org/abs/2210.03629），理解推理与行动；Reflexion（https://arxiv.org/abs/2303.11366），理解反馈式改进；Voyager（https://arxiv.org/abs/2305.16291），理解长期技能积累。" },
  { title: "MCP：用统一协议连接模型与工具", what: "MCP 是让 AI 应用以统一方式发现并调用数据、资源和工具的开放协议。", principle: "Host 管理用户体验与权限，Client 与具体 Server 建立连接，Server 暴露工具、资源和提示模板，双方通过标准消息交换能力与结果。", solves: "它减少每个 AI 产品为不同系统重复开发专用连接器的成本，并让权限边界更清晰。", suited: "适合连接数据库、文档、开发工具和企业系统；不适合把所有内部接口无差别暴露给模型。", example: "开发助手通过不同 MCP Server 读取设计稿、查询工单和运行测试，而应用统一管理授权与审计。", relation: "MCP 解决连接标准，Agent 决定何时调用，Harness 管理调用流程，API 则仍是 Server 背后的具体实现方式。", pm: "重点掌握工具描述质量、最小权限、确认机制、幂等性、超时、错误回传和审计。常见坑是工具命名含糊或把敏感写操作设计成默认自动执行。", papers: "推荐阅读：MCP 规范（https://modelcontextprotocol.io/specification），理解协议本身；MCP GitHub（https://github.com/modelcontextprotocol），查看 SDK 与参考实现；Anthropic MCP 介绍（https://www.anthropic.com/news/model-context-protocol），理解其设计动机。" },
];
function knowledgeForDate(date) {
  const index = Math.abs(Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86400000)) % knowledgeCurriculum.length, item = knowledgeCurriculum[index];
  return { id: `knowledge-${date}`, section: "大模型知识", kicker: `基础到进阶 · ${date}`, title: item.title, summary: item.what, full: `核心原理与关键流程\n${item.principle}\n\n解决什么问题、为什么重要\n${item.solves}\n\n适用与不适用场景\n${item.suited}\n\n具体产品案例\n${item.example}\n\n与相近技术的关系\n${item.relation}\n\n产品经理需要掌握\n${item.pm}\n\n推荐原始论文与技术报告\n${item.papers}`, source: "原始论文与官方技术资料", url: item.papers.match(/https:\/\/[^）]+/)?.[0] || "https://arxiv.org/", time: "8 分钟" };
}

async function fetchSection(section, feedUrls, minimum, archiveDate) {
  const sourceDate = shiftDate(archiveDate, -1), stories = [];
  for (const feedUrl of feedUrls) {
    try {
      const response = await fetch(feedUrl, { headers: { "User-Agent": "StellarAI-RSSReader/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text(), items = [...body.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 15);
      for (const [index, match] of items.entries()) {
        const item = match[1], originalUrl = rawTag(item, "link").replace(/&amp;/g, "&").replace(/^http:/, "https:"), sourceName = sourceFromUrl(originalUrl), rawTitle = tag(item, "title"), rawSummary = tag(item, "description"), date = publishedDate(item, sourceDate);
        if (originalUrl.startsWith("https://") && rawTitle.length > 12 && rawSummary.length > 45 && sourceName && !/^Read\b/i.test(rawSummary)) { const [title, summary] = await Promise.all([translate(rawTitle), translate(rawSummary)]); stories.push({ id: storyId(archiveDate, section, originalUrl, index), section, kicker: `${sourceName} · ${date}`, title, summary, source: sourceName, url: originalUrl, time: "3 分钟" }); }
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
  archives[date] = stories; knowledgeArchives[date] = knowledgeForDate(date);
  refreshResults.push({ date, sections: sections.length, stories: stories.length });
}
for (const key of Object.keys(archives)) if (!dates.includes(key)) delete archives[key];
for (const key of Object.keys(knowledgeArchives)) if (!dates.includes(key)) delete knowledgeArchives[key];
const today = archives[todayDate], knowledge = knowledgeArchives[todayDate];
await mkdir("public/data", { recursive: true });
await writeFile(file, JSON.stringify({ today, archives, knowledge, knowledgeArchives, metadata: { updatedAt: new Date().toISOString(), timeZone: "Asia/Shanghai", retentionDays: RETENTION_DAYS, sourceWindow: "previous-calendar-day-with-seven-day-recovery", refreshResults } }, null, 2) + "\n");
console.log(`Updated ${todayDate}: ${today.length} stories; archive days=${Object.keys(archives).length}`);
