"""Prepare faithful 2.5D layers from the repository's original leadership poster.

Run with Pillow, NumPy, OpenCV, SciPy and rembg installed. The optional IS-Net
model can be supplied through U2NET_HOME; it is never a browser dependency.
All coordinates below refer to the 2400 x 2000 master, not the print original.
"""
from pathlib import Path
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'cinema'
OUT.mkdir(parents=True, exist_ok=True)
print_master = Image.open(ROOT / 'assets/posters/poster-dpd-gmpi-sidoarjo.webp').convert('RGB')
master = print_master.resize((2400, 2000), Image.Resampling.LANCZOS)
box = (520, 455, 1880, 1585)
people = master.crop(box)
w, h = people.size

from rembg import remove, new_session
session = new_session('isnet-general-use')
cut = remove(people, session=session)
a = np.array(cut.getchannel('A'))
binary = ndimage.binary_fill_holes(a > 95)
binary = ndimage.binary_closing(binary, iterations=3)
labels, count = ndimage.label(binary)
sizes = np.bincount(labels.ravel())
keep = sizes > 1800
keep[0] = False
binary = keep[labels]
alpha = Image.fromarray((binary * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.65))
a = np.array(alpha).astype(np.float32) / 255

# Remove the glowing central crest and the lower baked-in typography.
# A generous silhouette preserves every face, hand, uniform patch and tattoo.
yy, xx = np.mgrid[0:h, 0:w]
X, Y = xx + box[0], yy + box[1]
crest_gap = (
    (X > 1060 + np.clip((Y - 710) * .30, 0, 85)) &
    (X < 1365 - np.clip((Y - 710) * .50, 0, 130)) &
    (Y < 815)
)
a[crest_gap] = 0
# The other leader's hair is removed from the rear layer below, never here.
# The lower body dissolves into smoke before the poster's original name captions.
fade = np.clip((1435 - Y) / 65, 0, 1)
a *= fade

# Right figure is in front. Split at the visible overlapping sleeve/shoulder.
boundary = np.interp(Y, [450, 735, 790, 842, 880, 965, 1080, 1180, 1250, 1450],
                         [1387, 1387, 1350, 1280, 1235, 1190, 1167, 1174, 1230, 1260])
right_mask = (X >= boundary).astype(np.float32)
right_mask[(X < 1387) & (Y < 754)] = 0
right_mask = np.array(Image.fromarray((right_mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.7))) / 255
# Sample the print master at 2x the layout crop for crisp 4K faces and patches.
sx, sy = print_master.width / 2400, print_master.height / 2000
hi_box = (round(box[0]*sx), round(box[1]*sy), round(box[2]*sx), round(box[3]*sy))
people_hi = print_master.crop(hi_box).resize((w*2,h*2), Image.Resampling.LANCZOS)
left = people_hi.convert('RGBA')
right = people_hi.convert('RGBA')
overlap = cv2.erode(right_mask, np.ones((1,25),np.uint8))
left_alpha = a * (1-overlap)
left_alpha[(X > 1300) & (Y < 805)] = 0
left.putalpha(Image.fromarray(np.uint8(np.clip(left_alpha, 0, 1) * 255)).resize((w*2,h*2), Image.Resampling.LANCZOS))
right.putalpha(Image.fromarray(np.uint8(np.clip(a * right_mask, 0, 1) * 255)).resize((w*2,h*2), Image.Resampling.LANCZOS))
left.save(OUT / 'figure-sayegi.webp', quality=95, method=6)
right.save(OUT / 'figure-hasmin.webp', quality=95, method=6)

# Official transparent DPD GMPI Sidoarjo shield (never the poster crop).
official = Image.open(ROOT / 'assets/logo-gmpi-sidoarjo.webp').convert('RGBA')
crest_h = 540
crest = official.resize((round(crest_h * official.width / official.height), crest_h), Image.Resampling.LANCZOS)
crest.save(OUT / 'crest.webp', quality=95, method=6)

print('Prepared original-photo depth layers in', OUT)
