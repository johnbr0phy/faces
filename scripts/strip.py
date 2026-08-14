# Lay a motion cycle out as a strip, so it can be read the way a flipbook is
import sys, glob
from PIL import Image

pat, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(pat))
ims = [Image.open(f).convert("RGB") for f in files]
# crop to the figure band: top 72% of the sheet, dropping the footer
w, h = ims[0].size
box = (0, 0, w, int(h * 0.74))
ims = [im.crop(box) for im in ims]
cw, ch = ims[0].size
sc = 0.5
cw, ch = int(cw * sc), int(ch * sc)
ims = [im.resize((cw, ch), Image.LANCZOS) for im in ims]
cols = min(6, len(ims))
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cw * cols, ch * rows), (223, 218, 207))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * cw, (i // cols) * ch))
sheet.save(out)
print(out, sheet.size, len(ims), "frames")
