#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple
from urllib.request import urlretrieve

import cv2
import numpy as np
from PIL import Image, ImageDraw

DIRS = [
    "center",
    "up",
    "up-right",
    "right",
    "down-right",
    "down",
    "down-left",
    "left",
    "up-left",
    "funny",
]

OUT_W = 768
OUT_H = 1152
OBJECT_POS_Y = 0.22
MODEL_URLS = {
    "haarcascade_frontalface_default.xml": "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml",
    "lbfmodel.yaml": "https://raw.githubusercontent.com/kurnianggoro/GSOC2017/master/data/lbfmodel.yaml",
}


@dataclass
class FaceMetrics:
    x: float
    y: float
    w: int
    h: int


def object_position_crop_square(w: int, h: int) -> Tuple[float, float, float]:
    """Return x0, y0, side in source pixels for square cover crop with center x and y=22%."""
    if w >= h:
        side = h
        x0 = (w - side) * 0.5
        y0 = 0.0
    else:
        side = w
        x0 = 0.0
        y0 = (h - side) * OBJECT_POS_Y
    return x0, y0, side


def detect_nose(path: Path, face_cascade, facemark) -> FaceMetrics:
    img = cv2.imread(str(path))
    if img is None:
        raise RuntimeError(f"Could not load image: {path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(80, 80))
    if len(faces) == 0:
        faces = face_cascade.detectMultiScale(gray, 1.05, 3, minSize=(60, 60))
    if len(faces) == 0:
        raise RuntimeError(f"No face detected in {path}")

    faces = sorted(faces, key=lambda r: r[2] * r[3], reverse=True)
    rect = np.array([faces[0]], dtype=np.int32)
    ok, landmarks = facemark.fit(img, rect)
    if not ok:
        raise RuntimeError(f"Landmark detection failed for {path}")

    pts = landmarks[0].reshape(68, 2)
    nose = pts[30]
    h, w = img.shape[:2]
    return FaceMetrics(float(nose[0]), float(nose[1]), int(w), int(h))


def paste_with_offset(canvas: Image.Image, src: Image.Image, dx: int, dy: int) -> None:
    """Paste src onto canvas at dx,dy with clipping and alpha."""
    c_w, c_h = canvas.size
    s_w, s_h = src.size

    dst_x0 = max(dx, 0)
    dst_y0 = max(dy, 0)
    dst_x1 = min(dx + s_w, c_w)
    dst_y1 = min(dy + s_h, c_h)

    if dst_x0 >= dst_x1 or dst_y0 >= dst_y1:
        return

    src_x0 = dst_x0 - dx
    src_y0 = dst_y0 - dy
    src_x1 = src_x0 + (dst_x1 - dst_x0)
    src_y1 = src_y0 + (dst_y1 - dst_y0)

    patch = src.crop((src_x0, src_y0, src_x1, src_y1))
    canvas.alpha_composite(patch, (dst_x0, dst_y0))


def render_circle_preview(path: Path, out_size: int = 140) -> Image.Image:
    src = Image.open(path).convert("RGB")
    w, h = src.size
    x0, y0, side = object_position_crop_square(w, h)
    crop = src.crop((int(round(x0)), int(round(y0)), int(round(x0 + side)), int(round(y0 + side))))
    crop = crop.resize((out_size, out_size), Image.Resampling.LANCZOS)

    alpha = Image.new("L", (out_size, out_size), 0)
    draw = ImageDraw.Draw(alpha)
    draw.ellipse((1, 1, out_size - 2, out_size - 2), fill=255)

    out = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    out.paste(crop.convert("RGBA"), (0, 0), alpha)
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src_flint = root / "flint-site" / "face-pre-nose-align"
    out_flint = root / "flint-site" / "face"
    src_jb = root / "jb-face-ref" / "head-tracker"
    artifacts = root / "artifacts"
    models_dir = root / "tools" / "models"
    artifacts.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)

    for filename, url in MODEL_URLS.items():
        model_path = models_dir / filename
        if not model_path.exists():
            urlretrieve(url, model_path)

    face_cascade = cv2.CascadeClassifier(str(models_dir / "haarcascade_frontalface_default.xml"))
    facemark = cv2.face.createFacemarkLBF()
    facemark.loadModel(str(models_dir / "lbfmodel.yaml"))

    # 1) Gather landmark references.
    ref: Dict[str, Dict[str, FaceMetrics]] = {"john": {}, "before": {}, "after": {}}
    transforms: Dict[str, Dict[str, float]] = {}

    for d in DIRS:
        ref["john"][d] = detect_nose(src_jb / f"black-{d}.jpg", face_cascade, facemark)
        ref["before"][d] = detect_nose(src_flint / f"{d}.png", face_cascade, facemark)

    # 2) Reframe each Flint image to portrait canvas by matching John's visible nose position per direction.
    crop_y = (OUT_H - OUT_W) * OBJECT_POS_Y
    for d in DIRS:
        j = ref["john"][d]
        f = ref["before"][d]

        jx_vis = j.x / j.w
        jy_vis = (j.y - (j.h - j.w) * OBJECT_POS_Y) / j.w

        target_x = jx_vis * OUT_W
        target_y = crop_y + jy_vis * OUT_W

        dx = target_x - f.x
        dy = target_y - f.y

        src = Image.open(src_flint / f"{d}.png").convert("RGBA")
        canvas = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 255))
        paste_with_offset(canvas, src, int(round(dx)), int(round(dy)))
        canvas.convert("RGB").save(out_flint / f"{d}.png", optimize=True)

        transforms[d] = {
            "translate_x": float(round(dx, 2)),
            "translate_y": float(round(dy, 2)),
            "target_x": float(round(target_x, 2)),
            "target_y": float(round(target_y, 2)),
        }

    # 3) Measure after-state.
    for d in DIRS:
        ref["after"][d] = detect_nose(out_flint / f"{d}.png", face_cascade, facemark)

    # 4) Build metrics table.
    rows = []
    for d in DIRS:
        b = ref["before"][d]
        a = ref["after"][d]
        j = ref["john"][d]

        j_crop_y = (j.h - j.w) * OBJECT_POS_Y
        a_crop_y = (a.h - a.w) * OBJECT_POS_Y

        row = {
            "dir": d,
            "john": {
                "source_xy": [round(j.x, 2), round(j.y, 2)],
                "source_norm_xy": [round(j.x / j.w, 4), round(j.y / j.h, 4)],
                "circle_norm_xy": [round(j.x / j.w, 4), round((j.y - j_crop_y) / j.w, 4)],
            },
            "flint_before": {
                "source_xy": [round(b.x, 2), round(b.y, 2)],
                "source_norm_xy": [round(b.x / b.w, 4), round(b.y / b.h, 4)],
                "circle_norm_xy": [round(b.x / b.w, 4), round(b.y / b.w, 4)],
            },
            "flint_after": {
                "source_xy": [round(a.x, 2), round(a.y, 2)],
                "source_norm_xy": [round(a.x / a.w, 4), round(a.y / a.h, 4)],
                "circle_norm_xy": [round(a.x / a.w, 4), round((a.y - a_crop_y) / a.w, 4)],
            },
            "transform": transforms[d],
        }
        rows.append(row)

    (artifacts / "nose-metrics.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")

    # 5) Build visual verification collage.
    tile = 140
    gutter = 16
    label_h = 30
    row_h = tile + label_h
    left_w = 170
    width = left_w + len(DIRS) * (tile + gutter) + gutter
    height = gutter + 3 * row_h + 4 * gutter

    board = Image.new("RGB", (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(board)
    rowspec = [
        ("John ref", src_jb, lambda d: f"black-{d}.jpg"),
        ("Flint before", src_flint, lambda d: f"{d}.png"),
        ("Flint fixed", out_flint, lambda d: f"{d}.png"),
    ]

    for ridx, (rlabel, root_dir, fn) in enumerate(rowspec):
        y0 = gutter + ridx * (row_h + gutter)
        draw.text((20, y0 + tile // 2 - 8), rlabel, fill=(20, 20, 20))

        for cidx, d in enumerate(DIRS):
            x0 = left_w + gutter + cidx * (tile + gutter)
            preview = render_circle_preview(root_dir / fn(d), out_size=tile)
            board.paste(preview, (x0, y0), preview)
            draw.ellipse((x0, y0, x0 + tile - 1, y0 + tile - 1), outline=(130, 130, 130), width=1)
            draw.text((x0 + 6, y0 + tile + 8), d, fill=(35, 35, 35))

    board.save(artifacts / "face-circle-check.png", optimize=True)


if __name__ == "__main__":
    main()
