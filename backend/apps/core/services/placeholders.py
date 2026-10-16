"""Brand-coloured placeholder artwork for the demo seed data.

Images are rendered locally with Pillow so a fresh install has real media without
needing an internet connection or licensed photography.
"""
import random
from io import BytesIO

from django.core.files.base import ContentFile
from django.utils.text import slugify

DARK_BLUE = "#0B2545"
MID_BLUE = "#13315C"
RED = "#D7263D"
SHADOW = (4, 12, 24)
WHITE = (255, 255, 255)

PALETTES = [
    (DARK_BLUE, MID_BLUE, RED),
    (MID_BLUE, "#20518C", RED),
    ("#081C36", "#3A6EA5", "#B01B2E"),
]

SIGNATURE = "MANT BRIDGES LTD"


def _rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def _blend(start, end, ratio):
    ratio = max(0.0, min(1.0, ratio))
    return tuple(round(start[index] + (end[index] - start[index]) * ratio) for index in range(3))


def _font(size):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow older than 10.1 has no size argument.
        return ImageFont.load_default()


def _wrap(draw, text, font, max_width):
    lines = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if not current or draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _skyline(draw, width, height, bottom, accent, rng):
    """A row of lit blocks along the bottom edge, deterministic for a given seed."""
    baseline = height
    horizon = int(height * 0.52)
    window = max(4, int(width * 0.008))
    gap = max(6, int(width * 0.014))
    x = -20
    while x < width:
        block_width = rng.randint(int(width * 0.07), int(width * 0.16))
        block_top = rng.randint(horizon, height - int(height * 0.12))
        shade = _blend(bottom, SHADOW, rng.uniform(0.25, 0.6))
        draw.rectangle([x, block_top, x + block_width, baseline], fill=shade)
        for wx in range(x + gap, x + block_width - window - gap + 1, window + gap):
            for wy in range(block_top + gap, baseline - window - gap + 1, window + gap):
                if rng.random() > 0.45:
                    draw.rectangle(
                        [wx, wy, wx + window, wy + window],
                        fill=_blend(accent, WHITE, rng.uniform(0.05, 0.55)),
                    )
        x += block_width + rng.randint(6, 22)


def placeholder_image(label, size=(1200, 800), palette=PALETTES[0], tagline=""):
    """Return a labelled JPEG tile as a ContentFile, ready for an ImageField."""
    from PIL import Image, ImageDraw

    width, height = size
    top, bottom, accent = (_rgb(colour) for colour in palette)
    rng = random.Random(label)

    image = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=_blend(top, bottom, y / max(1, height - 1)))
    _skyline(draw, width, height, bottom, accent, rng)

    margin = int(width * 0.055)
    title_font = _font(max(20, int(height * 0.062)))
    small_font = _font(max(13, int(height * 0.028)))
    lines = _wrap(draw, label, title_font, int(width * 0.7))
    line_height = int(height * 0.082)
    block_top = int(height * 0.09)
    block_bottom = block_top + line_height * len(lines)

    draw.rectangle(
        [margin, block_top, margin + max(6, int(width * 0.006)), block_bottom],
        fill=accent,
    )
    text_left = margin + int(width * 0.022)
    y = block_top
    for line in lines:
        draw.text((text_left + 3, y + 3), line, font=title_font, fill=SHADOW)
        draw.text((text_left, y), line, font=title_font, fill=WHITE)
        y += line_height

    if tagline:
        draw.text((text_left, block_bottom + int(height * 0.02)), tagline,
                  font=small_font, fill=_blend(WHITE, bottom, 0.25))
    draw.text((width - margin - draw.textlength(SIGNATURE, font=small_font),
               height - int(height * 0.07)), SIGNATURE, font=small_font,
              fill=_blend(WHITE, bottom, 0.45))

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True)
    name = slugify(label)[:60] or "placeholder"
    return ContentFile(buffer.getvalue(), name=f"{name}.jpg")
