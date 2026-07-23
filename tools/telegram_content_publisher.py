#!/usr/bin/env python3
import argparse
import html
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "content" / "songcraft-channel" / "queue.json"
STATE_PATH = ROOT / "content" / "songcraft-channel" / "state" / "published.json"


def load_env(path: Path) -> dict[str, str]:
    env = dict(os.environ)
    if not path.exists():
        return env
    for raw_line in path.read_text("utf-8-sig", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def parse_dt(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text("utf-8"))


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8")


def api_form(token: str, method: str, fields: dict[str, str]):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=data)
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))


def send_photo(token: str, chat_id: str, caption: str, photo_path: Path):
    boundary = "----SongCraftBoundary" + uuid.uuid4().hex
    body = bytearray()
    fields = {
        "chat_id": chat_id,
        "caption": caption,
        "parse_mode": "HTML",
    }
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("ascii"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    body.extend(f"--{boundary}\r\n".encode("ascii"))
    filename = photo_path.name.encode("ascii", errors="ignore").decode("ascii") or "image.png"
    body.extend(f'Content-Disposition: form-data; name="photo"; filename="{filename}"\r\n'.encode("ascii"))
    content_type = mimetypes.guess_type(str(photo_path))[0] or "application/octet-stream"
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("ascii"))
    body.extend(photo_path.read_bytes())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("ascii"))

    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=80) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_caption(text: str) -> str:
    text = text.strip()
    if "????" in text:
        raise ValueError("Caption contains mojibake markers")
    if "--" in text or "—" in text:
        raise ValueError("Caption contains an AI-style dash")

    lowered = re.sub(r"<[^>]+>", "", text).lower()
    banned_phrases = (
        "в современном мире",
        "важно отметить",
        "таким образом",
        "погрузитесь",
        "уникальная возможность",
        "не просто продукт",
    )
    for phrase in banned_phrases:
        if phrase in lowered:
            raise ValueError(f"Caption contains a banned phrase: {phrase}")

    emoji_pattern = re.compile(
        "["
        "\U0001F300-\U0001FAFF"
        "\U00002600-\U000027BF"
        "]",
        flags=re.UNICODE,
    )
    if len(emoji_pattern.findall(text)) > 8:
        raise ValueError("Caption contains too many emoji")
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--now", default=None, help="Override current UTC datetime, ISO format")
    args = parser.parse_args()

    env = load_env(ROOT / ".env")
    token = env.get("TELEGRAM_CONTENT_BOT_TOKEN")
    chat_id = env.get("TELEGRAM_CONTENT_CHAT_ID", "@V3SongCraft")
    if not token:
        print("TELEGRAM_CONTENT_BOT_TOKEN is empty", file=sys.stderr)
        return 2

    queue = load_json(QUEUE_PATH, [])
    state = load_json(STATE_PATH, {"published": {}})
    published = state.setdefault("published", {})
    now = parse_dt(args.now) if args.now else datetime.now(timezone.utc)

    due_posts = [
        post for post in queue
        if post.get("id") not in published and parse_dt(post["publish_at"]) <= now
    ]
    if not due_posts:
        print("No due posts")
        return 0

    post = sorted(due_posts, key=lambda item: item["publish_at"])[0]
    caption = normalize_caption(post["caption_html"])
    image = post.get("image")

    if args.dry_run:
        print(json.dumps({
            "due": True,
            "id": post["id"],
            "title": post.get("title"),
            "image": image,
            "caption_preview": caption[:160],
        }, ensure_ascii=False, indent=2))
        return 0

    try:
        if image:
            result = send_photo(token, chat_id, caption, ROOT / image)
        else:
            result = api_form(token, "sendMessage", {
                "chat_id": chat_id,
                "text": caption,
                "parse_mode": "HTML",
            })
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1

    message = result.get("result", {})
    published[post["id"]] = {
        "message_id": message.get("message_id"),
        "published_at": datetime.now(timezone.utc).isoformat(),
        "title": post.get("title"),
    }
    save_json(STATE_PATH, state)
    print(json.dumps({
        "ok": result.get("ok"),
        "id": post["id"],
        "message_id": message.get("message_id"),
        "title": post.get("title"),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
