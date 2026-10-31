"""Derive every site/branding logo variant from the official transparent master.

Master: assets/logo-gmpi-sidoarjo.webp (RGBA, 889x1091, supplied by DPD GMPI Sidoarjo).
Run: .venv/bin/python scripts/branding/prepare-logo.py
Only Pillow is required. The shield is always contained, never circular-cropped.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'assets/logo-gmpi-sidoarjo.webp'
logo = Image.open(MASTER).convert('RGBA')
W, H = logo.size


def contain(size, pad=0, bg=None):
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    box = size - pad * 2
    k = min(box / W, box / H)
    dw, dh = round(W * k), round(H * k)
    resized = logo.resize((dw, dh), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - dw) // 2, (size - dh) // 2))
    return canvas


# Backward-compatible path: same official art, true transparency preserved.
logo.save(ROOT / 'assets/logo-gmpi-sidoarjo-crop.webp', quality=95, method=6)

# Favicon / touch icon: transparent square, full shield.
contain(512, pad=24).save(ROOT / 'assets/favicon.png', optimize=True)

# JPG fallback cannot carry alpha; flatten onto the site's dark ink.
jpg = Image.new('RGB', (1000, 1000), (11, 11, 13))
jpg.paste(contain(1000, pad=40), (0, 0), contain(1000, pad=40))
jpg.save(ROOT / 'assets/logo-gmpi-sidoarjo.jpg', quality=94, optimize=True)

# Optional Admin upload helpers (square, transparent, under the 2 MB panel limit).
for rel in ('logo-gmpi-restorasi-1000.png', 'logos/logo-gmpi-v2-1000.png'):
    contain(1000, pad=40).save(ROOT / rel, optimize=True)

# Cinematic crest: 2x the 1080p draw height for crisp 4K export.
crest_h = 540
crest_w = round(crest_h * W / H)
logo.resize((crest_w, crest_h), Image.Resampling.LANCZOS).save(
    ROOT / 'assets/cinema/crest.webp', quality=95, method=6)

# Social share card: official shield on the right, identity text on the left.
og = Image.new('RGB', (1200, 630), (11, 11, 13))
d = ImageDraw.Draw(og)
d.rectangle((0, 0, 17, 630), fill=(197, 22, 29))
d.rectangle((22, 22, 1178, 608), outline=(198, 155, 59), width=2)
font_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font_reg = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f_kicker = ImageFont.truetype(font_bold, 30)
f_title = ImageFont.truetype(font_bold, 88)
f_motto = ImageFont.truetype(font_bold, 29)
d.text((76, 150), 'DPD SIDOARJO — JAWA TIMUR', font=f_kicker, fill=(214, 169, 76))
d.text((72, 205), 'GMPI DPD', font=f_title, fill=(255, 253, 247))
d.text((72, 305), 'SIDOARJO', font=f_title, fill=(255, 253, 247))
d.rectangle((76, 438, 456, 446), fill=(197, 22, 29))
d.text((76, 478), 'Setia Bersaudara Sampai Urat Nadi', font=f_motto, fill=(242, 239, 231))
panel = (690, 96, 1122, 534)
d.rounded_rectangle(panel, radius=10, fill=(16, 16, 18), outline=(58, 58, 62), width=2)
box_w, box_h = panel[2] - panel[0] - 36, panel[3] - panel[1] - 36
k = min(box_w / W, box_h / H)
dw, dh = round(W * k), round(H * k)
shield = logo.resize((dw, dh), Image.Resampling.LANCZOS)
og.paste(shield, (panel[0] + (panel[2] - panel[0] - dw) // 2,
                  panel[1] + (panel[3] - panel[1] - dh) // 2), shield)
og.save(ROOT / 'assets/og-share.jpg', quality=92, optimize=True)

print('Prepared official logo variants from', MASTER)
