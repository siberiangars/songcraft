from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "content" / "songcraft-channel" / "images"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS = Path.home() / "Downloads"

W, H = 1080, 1350
FONT_BLACK = Path("C:/Windows/Fonts/arialbd.ttf")
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")


def pick_source(fragment: str) -> Path:
    matches = [p for p in DOWNLOADS.glob("ChatGPT Image*.png") if fragment in p.name]
    if not matches:
        raise FileNotFoundError(fragment)
    return matches[0]


SOURCES = {
    "neon": pick_source("17_07_25"),
    "hug": pick_source("13_31_12"),
    "gift": pick_source("13_29_22"),
    "blue": pick_source("13_28_14"),
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BLACK if bold else FONT_REGULAR), size)


def cover_crop(img: Image.Image, focus: tuple[float, float]) -> Image.Image:
    iw, ih = img.size
    scale = max(W / iw, H / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    fx, fy = focus
    left = max(0, min(int((nw - W) * fx), nw - W))
    top = max(0, min(int((nh - H) * fy), nh - H))
    return img.crop((left, top, left + W, top + H))


def gradient_overlay(base: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = overlay.load()
    for y in range(H):
        for x in range(W):
            left = int(205 * (1 - x / W))
            bottom = int(85 * (y / H))
            top = int(70 * (1 - y / H))
            px[x, y] = (5, 0, 8, min(235, left + bottom + top))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def text_size(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=face)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if text_size(draw, candidate, face)[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_multiline(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    max_width: int,
    line_gap: int = 10,
) -> int:
    lines: list[str] = []
    for part in text.split("\n"):
        lines.extend(wrap_text(draw, part, face, max_width) if part.strip() else [""])
    for line in lines:
        if line:
            draw.text((x, y), line, font=face, fill=fill)
        y += face.size + line_gap
    return y


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def glow_text(
    draw: ImageDraw.ImageDraw,
    pos: tuple[int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    glow: tuple[int, int, int],
) -> None:
    x, y = pos
    for offset, alpha in [(6, 35), (3, 55), (1, 80)]:
        for dx, dy in [(offset, 0), (-offset, 0), (0, offset), (0, -offset), (offset, offset), (-offset, -offset)]:
            draw.text((x + dx, y + dy), text, font=face, fill=(*glow, alpha))
    draw.text(pos, text, font=face, fill=fill)


def make_card(
    src_key: str,
    filename: str,
    title_lines: list[str],
    subtitle: str,
    chips: list[tuple[str, str]],
    footer: str,
    focus: tuple[float, float],
    palette: str,
) -> None:
    src = Image.open(SOURCES[src_key]).convert("RGB")
    bg = cover_crop(src, focus).filter(ImageFilter.GaussianBlur(1.0))
    bg = ImageEnhance.Contrast(bg).enhance(1.1)
    img = gradient_overlay(bg)
    draw = ImageDraw.Draw(img)

    accent = (255, 45, 154, 255) if palette == "pink" else (255, 199, 58, 255)
    rounded_rect(draw, (44, 54, 1036, 1296), 42, (10, 8, 18, 96), outline=(255, 255, 255, 42), width=2)

    draw.text((72, 86), "SONGCRAFT", font=font(30, bold=True), fill=accent)
    draw.text((72, 124), "ПЕСНЯ В ПОДАРОК", font=font(28, bold=True), fill=(255, 255, 255, 230))

    y = 190
    for line in title_lines:
        size = 92 if len(line) < 13 else 78
        glow_text(draw, (72, y), line, font(size, bold=True), (255, 255, 255, 255), accent[:3])
        y += size + 10

    y += 18
    y = draw_multiline(draw, 76, y, subtitle, font(38, bold=True), (255, 235, 210, 248), 790, 10)
    y = max(y + 34, 728)

    chip_h = 124
    for title, body in chips:
        rounded_rect(draw, (72, y, 1008, y + chip_h), 28, (20, 16, 30, 218), outline=(255, 214, 108, 80), width=2)
        rounded_rect(draw, (100, y + 25, 172, y + 97), 22, (255, 45, 154, 42), outline=accent, width=2)
        draw.ellipse((124, y + 49, 148, y + 73), fill=accent)
        draw.text((198, y + 20), title, font=font(35, bold=True), fill=(255, 255, 255, 255))
        draw_multiline(draw, 198, y + 64, body, font(28), (226, 220, 232, 238), 730, 5)
        y += chip_h + 18

    rounded_rect(draw, (72, 1186, 1008, 1266), 26, (255, 220, 84, 238), outline=(255, 255, 255, 55), width=1)
    footer_font = font(34, bold=True)
    footer_width, _ = text_size(draw, footer, footer_font)
    draw.text((72 + (936 - footer_width) / 2, 1208), footer, font=footer_font, fill=(20, 14, 22, 255))

    img.convert("RGB").save(OUT_DIR / filename, quality=95)


CARDS = [
    (
        "hug",
        "week-01-gift-emotion.png",
        ["ПОДАРИ", "ЭМОЦИИ"],
        "Персональная песня цепляет сильнее обычного поздравления.",
        [
            ("Лично про человека", "имя, детали, воспоминания и ваши слова"),
            ("3 версии на выбор", "можно выбрать трек, который попал точнее"),
            ("Готово быстро", "подарок можно сделать даже в последний момент"),
        ],
        "ПОПРОБОВАТЬ В БОТЕ",
        (0.45, 0.45),
        "gold",
    ),
    (
        "gift",
        "week-02-strong-request.png",
        ["СИЛЬНЫЙ", "ТРЕК"],
        "Нужны не длинные тексты, а живые детали.",
        [
            ("Кому и повод", "мама, любимый человек, друг, свадьба, день рождения"),
            ("3–5 деталей", "привычки, фразы, характер, общие моменты"),
            ("Главная эмоция", "что человек должен почувствовать после припева"),
        ],
        "НАПИШИ СВОИМИ СЛОВАМИ",
        (0.42, 0.38),
        "gold",
    ),
    (
        "blue",
        "week-03-self-rap.png",
        ["СВОЙ", "РЕПЧИК"],
        "Трек про тебя: характер, вайб, фразы и история в одном звучании.",
        [
            ("Для себя", "заявить о себе, пошутить, удивить друзей"),
            ("Любой вайб", "клубный, тёмный, дерзкий или смешной"),
            ("Можно переслать", "как аудио-подарок или личный гимн"),
        ],
        "СДЕЛАТЬ СВОЙ ТРЕК",
        (0.55, 0.45),
        "pink",
    ),
    (
        "neon",
        "week-04-photo-clip.png",
        ["ТРЕК", "+ ФОТО"],
        "Из выбранной песни можно собрать мини-клип из ваших снимков.",
        [
            ("Сначала песня", "получаете 3 версии и выбираете лучшую"),
            ("Потом фото", "загружаете кадры, которые хочется сохранить"),
            ("На выходе клип", "слайд-шоу под трек, готовое к подарку"),
        ],
        "ДОБАВИТЬ КЛИП К ПОДАРКУ",
        (0.57, 0.5),
        "pink",
    ),
    (
        "hug",
        "week-05-who-gift.png",
        ["КОМУ", "ПОДАРИТЬ?"],
        "Персональный трек работает почти для любого повода.",
        [
            ("Маме или папе", "тёплые слова, которые сложно сказать напрямую"),
            ("Любимому человеку", "история пары, признание, годовщина"),
            ("Другу или себе", "смешной вайб, репчик или важная поддержка"),
        ],
        "ВЫБЕРИ ПОВОД В БОТЕ",
        (0.5, 0.45),
        "gold",
    ),
    (
        "gift",
        "week-06-live-reactions.png",
        ["ЖИВЫЕ", "РЕАКЦИИ"],
        "Главный тест песни — мурашки, улыбка и фраза: “это реально про меня?”",
        [
            ("Берём историю", "несколько фактов о человеке"),
            ("Делаем трек", "с личными деталями и эмоцией"),
            ("Показываем реакцию", "снимаем настоящий момент, без постановки"),
        ],
        "СКОРО В КАНАЛЕ",
        (0.48, 0.4),
        "gold",
    ),
]


if __name__ == "__main__":
    for card in CARDS:
        make_card(*card)
        print(card[1])
