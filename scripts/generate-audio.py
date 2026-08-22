import argparse
import asyncio
import hashlib
import json
from pathlib import Path

import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"


async def generate(item, output_dir, semaphore):
    text = "。".join(part.strip() for part in (item.get("title", ""), item.get("summary", ""), item.get("full", "")) if part and part.strip())
    if not text:
        return
    filename = f"{hashlib.sha1(item['id'].encode('utf-8')).hexdigest()[:16]}.mp3"
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, rate="+0%", pitch="+4Hz").save(output_dir / filename)
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)
    item["audio"] = f"./audio/{filename}"


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    data_path = Path("public/data/content.json")
    data = json.loads(data_path.read_text(encoding="utf-8"))
    today = data.get("today", [])
    items = [*today]
    if data.get("knowledge"):
        items.append(data["knowledge"])
    if args.limit:
        items = items[: args.limit]
    output_dir = Path("public/audio")
    output_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(3)
    await asyncio.gather(*(generate(item, output_dir, semaphore) for item in items))
    audio_by_id = {item["id"]: item.get("audio") for item in items if item.get("audio")}
    for stories in data.get("archives", {}).values():
        for story in stories:
            if story.get("id") in audio_by_id:
                story["audio"] = audio_by_id[story["id"]]
    for knowledge in data.get("knowledgeArchives", {}).values():
        if knowledge.get("id") in audio_by_id:
            knowledge["audio"] = audio_by_id[knowledge["id"]]
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(audio_by_id)} audio files with {VOICE}")


if __name__ == "__main__":
    asyncio.run(main())
