import re
from collections import defaultdict

import cv2
import numpy as np


def _box(x0, y0, x1, y1):
    return {"x0": int(x0), "y0": int(y0), "x1": int(x1), "y1": int(y1)}


def _intersection_over_smaller(a, b):
    x0, y0, x1, y1 = max(a["x0"], b["x0"]), max(a["y0"], b["y0"]), min(a["x1"], b["x1"]), min(a["y1"], b["y1"])
    inter = max(0, x1-x0) * max(0, y1-y0)
    area = min((a["x1"]-a["x0"]) * (a["y1"]-a["y0"]), (b["x1"]-b["x0"]) * (b["y1"]-b["y0"]))
    return inter / max(1, area)


def detect_visual_regions(image, words: list[dict]) -> list[dict]:
    """Find figure panels using connected saturated areas and image texture.

    Keep the color and texture proposals separate: combining either mask across
    an entire page can turn page background and body text into one giant region.
    """
    rgb = np.asarray(image.convert("RGB"))
    h, w = rgb.shape[:2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat = hsv[:, :, 1]
    # Color is a strong panel cue in textbook maps and photos. A modest close
    # joins small gaps inside a panel without bridging across body paragraphs.
    # Use color edges without vertically joining separate panels, captions, or
    # text rows into a single oversized contour.
    color_mask = cv2.inRange(sat, 42, 255)
    color_mask = cv2.morphologyEx(
        color_mask, cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (7, 1)))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    local_mean = cv2.blur(gray, (21, 21))
    local_sq = cv2.blur(gray.astype(np.float32) ** 2, (21, 21))
    texture = ((local_sq - local_mean.astype(np.float32) ** 2) > 300).astype(np.uint8) * 255
    texture_mask = cv2.morphologyEx(
        texture, cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(11, w // 120), max(9, h // 120))))
    page_area = w * h
    candidates = []
    for source_mask, is_color in ((color_mask, True), (texture_mask, False)):
        contours, _ = cv2.findContours(source_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, cw, ch = cv2.boundingRect(contour)
            area = cw * ch
            # Ignore tiny decoration and page-sized background/text blobs.
            # Textbook photos are often only 3–5% of the page area. The older
            # 6% color cutoff dropped those panels while keeping the map.
            min_area = page_area * (0.018 if is_color else 0.012)
            if (area < min_area or area > page_area * 0.62
                    or cw < w * 0.10 or ch < h * 0.05):
                continue
            box = _box(x, y, x + cw, y + ch)
            fill = cv2.countNonZero(source_mask[y:y + ch, x:x + cw]) / max(1, area)
            if fill < (0.12 if is_color else 0.16):
                continue
            inside = [word for word in words if _intersection_over_smaller(word["bbox"], box) > 0.65]
            # Texture on dense printed paragraphs can form page-sized blobs.
            # A real photo usually has few OCR words; map labels are handled by
            # the separate color proposal and scattered-label classifier.
            word_density = len(inside) / max(1, area / 10000)
            if not is_color and word_density > 4.0:
                continue
            if is_color and word_density > 8.0 and cw / max(1, ch) > 1.5:
                continue
            candidates.append({"bbox": box, "inside": inside, "is_color": is_color})

    # Deduplicate near-identical proposals and join touching fragments of the
    # same panel (for example, a photo split between color and texture masks).
    # Require a narrow vertical gap and nearly matching horizontal extents so
    # neighboring figures and text columns remain separate.
    merged = []
    for candidate in sorted(candidates, key=lambda item: (item["bbox"]["y0"], item["bbox"]["x0"])):
        cb = candidate["bbox"]
        match = None
        for entry in merged:
            eb = entry["bbox"]
            if _intersection_over_smaller(eb, cb) > 0.72:
                match = entry
                break
            overlap_x = max(0, min(eb["x1"], cb["x1"]) - max(eb["x0"], cb["x0"]))
            narrowest_width = max(1, min(eb["x1"] - eb["x0"], cb["x1"] - cb["x0"]))
            gap_y = max(0, max(eb["y0"], cb["y0"]) - min(eb["y1"], cb["y1"]))
            different_masks = entry["is_color"] != candidate["is_color"]
            if (overlap_x / narrowest_width >= 0.82
                    and gap_y <= max(6, int(h * 0.008))
                    and (different_masks or gap_y <= 6)):
                match = entry
                break
        if match:
            b = match["bbox"]
            match["bbox"] = _box(min(b["x0"], cb["x0"]), min(b["y0"], cb["y0"]),
                                 max(b["x1"], cb["x1"]), max(b["y1"], cb["y1"]))
            match["inside"].extend(candidate["inside"])
            match["is_color"] = match["is_color"] or candidate["is_color"]
        else:
            merged.append(candidate)

    for region in merged:
        b = region["bbox"]
        crop = hsv[b["y0"]:b["y1"], b["x0"]:b["x1"], :]
        unique_colors = len(np.unique((crop.reshape(-1, 3)[::max(1, crop.size // 12000)] // [8, 32, 32]).astype(np.uint8), axis=0)) if crop.size else 0
        bw, bh = max(1, b["x1"] - b["x0"]), max(1, b["y1"] - b["y0"])
        occupied_grid = {
            (min(3, int(4 * ((wrd["bbox"]["x0"] + wrd["bbox"]["x1"]) / 2 - b["x0"]) / bw)),
             min(3, int(4 * ((wrd["bbox"]["y0"] + wrd["bbox"]["y1"]) / 2 - b["y0"]) / bh)))
            for wrd in region["inside"]
        }
        scattered_labels = (len(region["inside"]) >= 12 and len(occupied_grid) >= 7
                            and unique_colors >= 12)
        area_ratio = ((b["x1"] - b["x0"]) * (b["y1"] - b["y0"])) / max(1, page_area)
        aspect_ratio = bw / bh
        if (scattered_labels and aspect_ratio < 3.8
                or (area_ratio > 0.08 and aspect_ratio < 1.2)
                or (area_ratio > 0.08 and len(region["inside"]) >= 8 and unique_colors > 18)):
            kind = "map"
        else:
            patch = gray[b["y0"]:b["y1"], b["x0"]:b["x1"]]
            texture_score = float(np.std(patch)) if patch.size else 0
            photo_like = (0.72 <= aspect_ratio <= 3.8 and texture_score >= 17
                          and (region["is_color"] or texture_score >= 32))
            kind = "photo" if photo_like else "diagram"
        region.update(type=kind, reason="opencv_non_text_visual")
        region.pop("inside", None)
        region.pop("is_color", None)
    return merged


def group_lines(words: list[dict]) -> list[dict]:
    groups = defaultdict(list)
    for word in words:
        groups[(word["block_num"], word["paragraph_num"], word["line_num"])].append(word)
    lines = []
    for values in groups.values():
        values.sort(key=lambda word: word["bbox"]["x0"])
        boxes = [word["bbox"] for word in values]
        lines.append({"text": " ".join(word["text"] for word in values),
                      "bbox": _box(min(b["x0"] for b in boxes), min(b["y0"] for b in boxes),
                                   max(b["x1"] for b in boxes), max(b["y1"] for b in boxes)),
                      "words": values, "height": np.median([b["y1"]-b["y0"] for b in boxes])})
    lines.sort(key=lambda line: (line["bbox"]["y0"], line["bbox"]["x0"]))
    return lines


def _clean_wrap(lines):
    value = " ".join(line["text"] for line in lines)
    value = value.replace("\ufffd", "–")
    return re.sub(r"(?<=\w)-\s+(?=\w)", "", re.sub(r"\s+", " ", value)).strip()


def build_blocks(lines: list[dict], page_width: int, include_activities: bool = False) -> list[dict]:
    if not lines:
        return []
    centers = sorted((line["bbox"]["x0"] + line["bbox"]["x1"]) / 2 for line in lines)
    # Detect a generous inter-column gutter from x-coordinate distribution.
    gaps = [(b-a, (a+b)/2) for a, b in zip(centers, centers[1:]) if b-a > page_width * 0.22]
    split_x = max(gaps)[1] if gaps else None
    if split_x:
        left = [line for line in lines if (line["bbox"]["x0"]+line["bbox"]["x1"])/2 < split_x]
        right = [line for line in lines if line not in left]
        lines = sorted(left, key=lambda line: (line["bbox"]["y0"], line["bbox"]["x0"])) + sorted(right, key=lambda line: (line["bbox"]["y0"], line["bbox"]["x0"]))
    heights = [line["height"] for line in lines]
    median_height = float(np.median(heights))
    blocks = []
    current = []
    for line in lines:
        text = line["text"].strip()
        if not text:
            continue
        numbered_heading = bool(re.match(r"^\d+(?:\.\d+)*\.?\s+[A-Z][^.!?]{2,80}$", text))
        all_caps_heading = text.isupper() and 1 < len(text.split()) <= 10
        heading = line["height"] > median_height * 1.28 or numbered_heading or all_caps_heading
        tag = "activity" if re.match(r"^activity\b", text, re.I) else "callout" if re.match(r"^do you know\b", text, re.I) else "heading" if heading else "paragraph"
        if current and (heading or line["bbox"]["y0"] - current[-1]["bbox"]["y1"] > median_height * 1.65 or tag in {"callout", "activity"}):
            blocks.append(_make_block(current, "paragraph"))
            current = []
        if tag in {"heading", "callout", "activity"}:
            blocks.append(_make_block([line], tag))
        else:
            current.append(line)
    if current:
        blocks.append(_make_block(current, "paragraph"))
    for block in blocks:
        if block["tag"] == "activity":
            block["optional"] = True
    return [block for block in blocks if include_activities or not block["optional"]]


def _make_block(lines, tag):
    boxes = [line["bbox"] for line in lines]
    return {"text": _clean_wrap(lines),
            "bbox": _box(min(b["x0"] for b in boxes), min(b["y0"] for b in boxes), max(b["x1"] for b in boxes), max(b["y1"] for b in boxes)),
            "tag": tag, "optional": tag == "activity"}


def remove_visual_words(words: list[dict], regions: list[dict]) -> list[dict]:
    return [word for word in words if not any(_intersection_over_smaller(word["bbox"], r["bbox"]) > 0.5 for r in regions)]

