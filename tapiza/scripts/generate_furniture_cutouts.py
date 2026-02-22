from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class MaskStats:
    name: str
    coverage: float


def keep_largest_component(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape[:2]
    labels_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

    if labels_count <= 1:
        return mask

    best_label = 0
    best_score = 0.0

    for label in range(1, labels_count):
        x, y, w, h, area = stats[label]
        touches_border = x <= 0 or y <= 0 or (x + w) >= width or (y + h) >= height
        border_penalty = 0.4 if touches_border else 1.0
        score = float(area) * border_penalty

        if score > best_score:
            best_score = score
            best_label = label

    if best_label == 0:
        return mask

    largest = np.zeros_like(mask)
    largest[labels == best_label] = 255
    return largest


def generate_mask(image_bgr: np.ndarray) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    initial_mask = np.zeros((height, width), np.uint8)
    margin = max(2, int(min(height, width) * 0.04))
    rect = (margin, margin, width - (2 * margin), height - (2 * margin))
    cv2.grabCut(
        image_bgr,
        initial_mask,
        rect,
        bgd_model,
        fgd_model,
        6,
        cv2.GC_INIT_WITH_RECT,
    )

    rough_foreground = np.where(
        (initial_mask == cv2.GC_FGD) | (initial_mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)

    refine_mask = np.where(rough_foreground > 0, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    refine_mask[:margin, :] = cv2.GC_BGD
    refine_mask[-margin:, :] = cv2.GC_BGD
    refine_mask[:, :margin] = cv2.GC_BGD
    refine_mask[:, -margin:] = cv2.GC_BGD

    cv2.grabCut(
        image_bgr,
        refine_mask,
        None,
        bgd_model,
        fgd_model,
        3,
        cv2.GC_INIT_WITH_MASK,
    )

    foreground = np.where(
        (refine_mask == cv2.GC_FGD) | (refine_mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)

    foreground = keep_largest_component(foreground)

    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, close_kernel, iterations=2)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, open_kernel, iterations=1)
    foreground = cv2.medianBlur(foreground, 5)

    alpha = cv2.GaussianBlur(foreground, (0, 0), sigmaX=1.3, sigmaY=1.3)
    alpha[alpha < 6] = 0
    alpha[alpha > 248] = 255

    return alpha


def build_cutout(image_bgr: np.ndarray, alpha_mask: np.ndarray) -> np.ndarray:
    image_rgba = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2BGRA)
    image_rgba[:, :, 3] = alpha_mask
    return image_rgba


def process_image(source_path: Path, cutout_dir: Path) -> MaskStats:
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError(f"Unable to read image: {source_path}")

    mask = generate_mask(source)
    cutout = build_cutout(source, mask)

    cutout_path = cutout_dir / source_path.name

    cv2.imwrite(str(cutout_path), cutout)

    coverage = float(np.count_nonzero(mask > 0) / (mask.shape[0] * mask.shape[1]))
    return MaskStats(name=source_path.name, coverage=coverage)


def main() -> None:
    workspace_root = Path(__file__).resolve().parents[1]
    source_dir = workspace_root / "public" / "images" / "furniture"
    cutout_dir = workspace_root / "public" / "images" / "furniture-cutout"

    cutout_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(source_dir.glob("*.png"))
    if not images:
        raise RuntimeError(f"No input images found in {source_dir}")

    stats: list[MaskStats] = []
    for image_path in images:
        stats.append(process_image(image_path, cutout_dir))

    avg_coverage = sum(item.coverage for item in stats) / len(stats)
    min_coverage = min(stats, key=lambda item: item.coverage)
    max_coverage = max(stats, key=lambda item: item.coverage)

    print(f"Processed {len(stats)} images.")
    print(f"Average mask coverage: {avg_coverage:.3f}")
    print(f"Min coverage: {min_coverage.name} -> {min_coverage.coverage:.3f}")
    print(f"Max coverage: {max_coverage.name} -> {max_coverage.coverage:.3f}")


if __name__ == "__main__":
    main()
