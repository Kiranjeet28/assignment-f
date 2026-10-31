import re
import statistics

CAPTION_LABEL = re.compile(r"^(?:fig(?:ure)?|plate|photo(?:graph)?|source|map|diagram|image)\s*\d*\s*[:.)-]?", re.I)


def _overlap(a: dict, b: dict) -> float:
    left, right = max(a["x0"], b["x0"]), min(a["x1"], b["x1"])
    return max(0, right - left) / max(1, min(a["x1"] - a["x0"], b["x1"] - b["x0"]))


def detect_captions(lines: list[dict], regions: list[dict]) -> list[dict]:
    heights = [max(1, line["bbox"]["y1"] - line["bbox"]["y0"]) for line in lines]
    typical = statistics.median(heights) if heights else 12
    found = []
    for line in lines:
        for region in regions:
            rb = region["bbox"]
            box = line["bbox"]
            # OCR may combine the end of a body line in one column with a
            # caption in another. Restrict the candidate to words inside the
            # visual's horizontal span so only caption words are excluded.
            line_width = box["x1"] - box["x0"]
            region_width = rb["x1"] - rb["x0"]
            candidate = line
            if line_width > region_width * 1.35 and line.get("words"):
                selected = [word for word in line["words"]
                            if rb["x0"] - typical * 0.3 <= (word["bbox"]["x0"] + word["bbox"]["x1"]) / 2
                            <= rb["x1"] + typical * 0.3]
                if not selected:
                    continue
                selected.sort(key=lambda word: word["bbox"]["x0"])
                candidate_box = {
                    "x0": min(word["bbox"]["x0"] for word in selected),
                    "y0": min(word["bbox"]["y0"] for word in selected),
                    "x1": max(word["bbox"]["x1"] for word in selected),
                    "y1": max(word["bbox"]["y1"] for word in selected),
                }
                candidate = {**line, "text": " ".join(word["text"] for word in selected),
                             "bbox": candidate_box, "words": selected}
            text, box = candidate["text"].strip(), candidate["bbox"]
            small = (box["y1"] - box["y0"]) <= typical * 1.3
            heading_like = text.isupper() and len(text.split()) <= 4
            numbered_heading = bool(re.match(r"^\s*\d+(?:\.\d+)*\.?\s+", text))
            horizontal = _overlap(box, rb) >= 0.45
            gap_below = box["y0"] - rb["y1"]
            gap_above = rb["y0"] - box["y1"]
            adjacent_below = -3 <= gap_below <= typical * 2.5
            adjacent = adjacent_below or (-3 <= gap_above <= typical * 1.4)
            labeled = bool(CAPTION_LABEL.match(text))
            inside_edge = (
                box["y0"] >= rb["y0"] and box["y1"] <= rb["y1"]
                and min(abs(box["y0"] - rb["y0"]), abs(box["y1"] - rb["y1"])) <= typical * 2
            )
            if horizontal and not numbered_heading and ((labeled and (adjacent or inside_edge)) or (small and adjacent_below and not heading_like)):
                previous = region.get("caption")
                region["caption"] = f"{previous} {text}" if previous else text
                previous_box = region.get("caption_bbox")
                region["caption_bbox"] = ({
                    "x0": min(previous_box["x0"], box["x0"]),
                    "y0": min(previous_box["y0"], box["y0"]),
                    "x1": max(previous_box["x1"], box["x1"]),
                    "y1": max(previous_box["y1"], box["y1"]),
                } if previous_box else box)
                found.append(candidate)
                break
    return found

