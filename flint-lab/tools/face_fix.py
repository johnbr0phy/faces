#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.request import urlretrieve

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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
    nose_x: float
    nose_y: float
    bbox_x0: float
    bbox_y0: float
    bbox_x1: float
    bbox_y1: float
    w: int
    h: int

    @property
    def bbox_w(self) -> float:
        return self.bbox_x1 - self.bbox_x0

    @property
    def bbox_h(self) -> float:
        return self.bbox_y1 - self.bbox_y0


def object_position_crop_square(w: int, h: int) -> Tuple[float, float, float]:
    if w >= h:
        side = h
        x0 = (w - side) * 0.5
        y0 = 0.0
    else:
        side = w
        x0 = 0.0
        y0 = (h - side) * OBJECT_POS_Y
    return x0, y0, side


def detect_face_metrics(path: Path, face_cascade, facemark) -> FaceMetrics:
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
    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    h, w = img.shape[:2]

    return FaceMetrics(
        nose_x=float(nose[0]),
        nose_y=float(nose[1]),
        bbox_x0=float(x0),
        bbox_y0=float(y0),
        bbox_x1=float(x1),
        bbox_y1=float(y1),
        w=int(w),
        h=int(h),
    )


def build_bg_from_source(src: Image.Image) -> Image.Image:
    # Torso-derived background to avoid hard black voids without introducing ghost faces.
    torso_top = int(round(src.height * 0.56))
    torso = src.crop((0, torso_top, src.width, src.height))
    bg = torso.resize((OUT_W, OUT_H), Image.Resampling.BICUBIC)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=8))
    arr = np.array(bg, dtype=np.float32)
    arr = np.clip(arr * 0.90 + 12.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def compose_scaled(src: Image.Image, scale: float, tx: float, ty: float) -> Image.Image:
    canvas = build_bg_from_source(src)
    sw = max(1, int(round(src.width * scale)))
    sh = max(1, int(round(src.height * scale)))
    fg = src.resize((sw, sh), Image.Resampling.LANCZOS)
    canvas.paste(fg, (int(round(tx)), int(round(ty))))
    arr = np.array(canvas)
    crop_top = int(round((OUT_H - OUT_W) * OBJECT_POS_Y))
    y0 = int(round(crop_top + OUT_W * 0.76))
    x0 = int(round(OUT_W * 0.16))
    x1 = int(round(OUT_W * 0.84))
    region = arr[y0:, x0:x1, :]
    dark = (region[:, :, 0] < 20) & (region[:, :, 1] < 20) & (region[:, :, 2] < 20)
    if np.any(dark):
        blur = np.array(Image.fromarray(region).filter(ImageFilter.GaussianBlur(radius=4)), dtype=np.float32)
        lifted = np.clip(blur * 0.75 + 14.0, 0, 255).astype(np.uint8)
        region[dark] = np.maximum(region[dark], lifted[dark])
        arr[y0:, x0:x1, :] = region
    return Image.fromarray(arr, mode="RGB")


def circle_crop(img: Image.Image, size: int = 320) -> Tuple[np.ndarray, np.ndarray]:
    w, h = img.size
    x0, y0, side = object_position_crop_square(w, h)
    crop = img.crop((int(round(x0)), int(round(y0)), int(round(x0 + side)), int(round(y0 + side))))
    crop = crop.resize((size, size), Image.Resampling.LANCZOS)

    alpha = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(alpha)
    draw.ellipse((1, 1, size - 2, size - 2), fill=255)
    mask = np.array(alpha) > 0

    return np.array(crop), mask


def sweater_metric(img: Image.Image) -> Dict[str, float]:
    arr, mask = circle_crop(img, size=320)
    h, w, _ = arr.shape
    y0 = int(h * 0.80)
    x0 = int(w * 0.18)
    x1 = int(w * 0.82)

    roi = np.zeros_like(mask)
    roi[y0:, x0:x1] = True
    roi &= mask
    pix = arr[roi]

    black = (pix[:, 0] < 20) & (pix[:, 1] < 20) & (pix[:, 2] < 20)
    black_frac = float(black.mean())
    mean_rgb = pix.mean(axis=0)

    return {
        "bot_black_frac": round(black_frac, 4),
        "bot_non_black_frac": round(1.0 - black_frac, 4),
        "bot_mean_rgb": [round(float(mean_rgb[0]), 2), round(float(mean_rgb[1]), 2), round(float(mean_rgb[2]), 2)],
    }


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

    refs: Dict[str, Dict[str, FaceMetrics]] = {"john": {}, "before": {}, "after": {}}
    transforms: Dict[str, Dict[str, float]] = {}

    for d in DIRS:
        refs["john"][d] = detect_face_metrics(src_jb / f"black-{d}.jpg", face_cascade, facemark)
        refs["before"][d] = detect_face_metrics(src_flint / f"{d}.png", face_cascade, facemark)

    crop_y = (OUT_H - OUT_W) * OBJECT_POS_Y

    for d in DIRS:
        j = refs["john"][d]
        f = refs["before"][d]

        # Match John's head-to-shoulder framing ratio with a mild zoom-out.
        john_face_w_norm = j.bbox_w / j.w
        flint_face_w_norm = f.bbox_w / f.w
        scale = (john_face_w_norm / flint_face_w_norm) * 1.02
        scale = float(np.clip(scale, 0.82, 0.96))

        john_circle_x = j.nose_x / j.w
        john_circle_y = (j.nose_y - (j.h - j.w) * OBJECT_POS_Y) / j.w

        # Keep Flint close to John's gaze band, but slightly lower for sweater retention.
        target_circle_y = float(np.clip(john_circle_y + 0.035, 0.50, 0.64))
        target_x = john_circle_x * OUT_W
        target_y = crop_y + target_circle_y * OUT_W

        tx = target_x - scale * f.nose_x
        ty_from_nose = target_y - scale * f.nose_y

        # Ensure real sweater pixels remain in lower circle before fallback background fill.
        # Require source image to reach at least 74% down the visible square.
        ty_min_for_sweater = crop_y + 0.74 * OUT_W - scale * f.h
        ty = max(ty_from_nose, ty_min_for_sweater)

        src = Image.open(src_flint / f"{d}.png").convert("RGB")
        out = compose_scaled(src, scale, tx, ty)
        out.save(out_flint / f"{d}.png", optimize=True)

        projected_source_x = (tx + scale * f.nose_x) / OUT_W
        projected_source_y = (ty + scale * f.nose_y) / OUT_H
        projected_circle_x = (tx + scale * f.nose_x) / OUT_W
        projected_circle_y = (ty + scale * f.nose_y - crop_y) / OUT_W

        transforms[d] = {
            "scale": round(scale, 4),
            "translate_x": round(float(tx), 2),
            "translate_y": round(float(ty), 2),
            "target_circle_x": round(john_circle_x, 4),
            "target_circle_y": round(target_circle_y, 4),
            "projected_source_xy": [round(float(projected_source_x), 4), round(float(projected_source_y), 4)],
            "projected_circle_xy": [round(float(projected_circle_x), 4), round(float(projected_circle_y), 4)],
        }

    for d in DIRS:
        refs["after"][d] = detect_face_metrics(out_flint / f"{d}.png", face_cascade, facemark)

    # Metrics
    rows: List[Dict[str, object]] = []
    sweater_rows: List[Dict[str, object]] = []

    for d in DIRS:
        j = refs["john"][d]
        b = refs["before"][d]
        a = refs["after"][d]

        j_crop_y = (j.h - j.w) * OBJECT_POS_Y
        a_crop_y = (a.h - a.w) * OBJECT_POS_Y

        rows.append(
            {
                "dir": d,
                "john": {
                    "source_norm_xy": [round(j.nose_x / j.w, 4), round(j.nose_y / j.h, 4)],
                    "circle_norm_xy": [round(j.nose_x / j.w, 4), round((j.nose_y - j_crop_y) / j.w, 4)],
                },
                "flint_before": {
                    "source_norm_xy": [round(b.nose_x / b.w, 4), round(b.nose_y / b.h, 4)],
                    "circle_norm_xy": [round(b.nose_x / b.w, 4), round(b.nose_y / b.w, 4)],
                },
                "flint_after": {
                    "source_norm_xy": transforms[d]["projected_source_xy"],
                    "circle_norm_xy": transforms[d]["projected_circle_xy"],
                    "detected_source_norm_xy": [round(a.nose_x / a.w, 4), round(a.nose_y / a.h, 4)],
                    "detected_circle_norm_xy": [round(a.nose_x / a.w, 4), round((a.nose_y - a_crop_y) / a.w, 4)],
                },
                "transform": transforms[d],
            }
        )

        john_img = Image.open(src_jb / f"black-{d}.jpg").convert("RGB")
        before_img = Image.open(src_flint / f"{d}.png").convert("RGB")
        after_img = Image.open(out_flint / f"{d}.png").convert("RGB")

        sweater_rows.append(
            {
                "dir": d,
                "john": sweater_metric(john_img),
                "flint_before": sweater_metric(before_img),
                "flint_after": sweater_metric(after_img),
            }
        )

    (artifacts / "nose-metrics.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    (artifacts / "sweater-metrics.json").write_text(json.dumps(sweater_rows, indent=2), encoding="utf-8")

    # Verification collage
    tile = 140
    gutter = 16
    label_h = 30
    row_h = tile + label_h
    left_w = 190
    width = left_w + len(DIRS) * (tile + gutter) + gutter
    height = gutter + 3 * row_h + 4 * gutter

    board = Image.new("RGB", (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(board)
    rowspec = [
        ("John ref", src_jb, lambda d: f"black-{d}.jpg"),
        ("Flint fixed", out_flint, lambda d: f"{d}.png"),
        ("Flint before", src_flint, lambda d: f"{d}.png"),
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
