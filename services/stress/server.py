import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from silero_stress import load_accentor


HOST = "0.0.0.0"
PORT = 8080
WORD_RE = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
VOWELS = "аеёиоуыэюя"
ACUTE = "\u0301"


def load_dictionary():
    with (Path(__file__).parent / "pronunciations.json").open(encoding="utf-8") as source:
        return {key.lower(): value for key, value in json.load(source).items()}


def normalize_stressed(value):
    value = str(value).strip()
    if not value:
        return None
    value = re.sub(rf"([А-Яа-яЁё]){ACUTE}", r"+\1", value)
    if "+" not in value:
        chars = list(value)
        for index, char in enumerate(chars):
            if index > 0 and char in "АЕЁИОУЫЭЮЯ":
                chars[index] = "+" + char.lower()
                value = "".join(chars)
                break
    if not re.search(r"\+[А-Яа-яЁё]", value):
        return None
    return value


def stress_position(value):
    clean = value.replace("+", "")
    plus = value.find("+")
    return clean, plus


def match_case(stressed, original):
    if not original:
        return stressed
    if original.isupper():
        return stressed.upper()
    if original[0].isupper():
        return stressed[0].upper() + stressed[1:]
    return stressed.lower()


def inflected_override(token, stressed):
    clean, position = stress_position(stressed)
    token_lower = token.lower()
    clean_lower = clean.lower()
    if position < 0 or position >= len(token_lower):
        return None

    prefix_length = max(position + 1, len(clean_lower) - 2)
    prefix = clean_lower[:prefix_length]
    if len(prefix) < 3 or not token_lower.startswith(prefix):
        return None
    if token_lower[position] not in VOWELS:
        return None

    marked = token[:position] + "+" + token[position:]
    return marked


def apply_overrides(text, request_overrides):
    exact = dict(PRONUNCIATIONS)
    flexible = list(PRONUNCIATIONS.values())
    for raw in request_overrides:
        stressed = normalize_stressed(raw)
        if not stressed:
            continue
        clean, _ = stress_position(stressed)
        exact[clean.lower()] = stressed
        flexible.append(stressed)

    applied = 0

    def replace(match):
        nonlocal applied
        token = match.group(0)
        direct = exact.get(token.lower())
        if direct:
            applied += 1
            return match_case(direct, token)
        if token[:1].isupper():
            for stressed in flexible:
                inflected = inflected_override(token, stressed)
                if inflected:
                    applied += 1
                    return inflected
        return token

    return WORD_RE.sub(replace, text), applied


PRONUNCIATIONS = load_dictionary()
ACCENTOR = load_accentor()
ACCENTOR.to(device="cpu")


class Handler(BaseHTTPRequestHandler):
    server_version = "SongCraftStress/1.0"

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} {format_string % args}", flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"ok": False})
            return
        self.send_json(200, {"ok": True, "engine": "silero-stress-1.4"})

    def do_POST(self):
        if self.path != "/accent":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100_000:
                raise ValueError("invalid content length")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(payload.get("text", ""))
            overrides = payload.get("overrides", [])
            if not isinstance(overrides, list):
                raise ValueError("overrides must be a list")
            prepared, applied = apply_overrides(text, overrides[:24])
            accented = ACCENTOR(
                prepared,
                put_stress=True,
                put_yo=True,
                put_stress_homo=True,
                put_yo_homo=True,
                stress_single_vowel=False,
            )
            self.send_json(200, {
                "text": accented,
                "engine": "silero-stress-1.4",
                "overridesApplied": applied,
            })
        except Exception as error:
            self.send_json(400, {"error": str(error)[:500]})


if __name__ == "__main__":
    print(f"SongCraft stress service listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
