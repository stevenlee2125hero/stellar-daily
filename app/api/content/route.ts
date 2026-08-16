import { env } from "cloudflare:workers";
import { getSessionUser } from "../../../lib/auth";

export async function GET(request: Request) {
  if (!(await getSessionUser(request))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ today: [], archives: {}, knowledge: null });
  await db.prepare("CREATE TABLE IF NOT EXISTS daily_content (content_date TEXT NOT NULL, story_id TEXT PRIMARY KEY, section TEXT NOT NULL, story_json TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  const rows = await db.prepare("SELECT content_date, story_json FROM daily_content WHERE content_date >= date('now', '-30 day') ORDER BY content_date DESC, created_at DESC").all<{content_date:string;story_json:string}>();
  const archives: Record<string, unknown[]> = {};
  for (const row of rows.results) (archives[row.content_date] ||= []).push(JSON.parse(row.story_json));
  const dates = Object.keys(archives).sort().reverse();
  const knowledge = await db.prepare("SELECT story_json FROM knowledge_content WHERE content_date = ?1").bind(dates[0] || "").first<{story_json:string}>().catch(() => null);
  return Response.json({ today: archives[dates[0]] || [], archives, knowledge: knowledge ? JSON.parse(knowledge.story_json) : null }, { headers: { "Cache-Control": "no-store" } });
}

