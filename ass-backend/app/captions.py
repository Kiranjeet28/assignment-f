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
        text, box = line["text"].strip(), line["bbox"]
        small = (box["y1"] - box["y0"]) <= typical * 1.3
        heading_like = text.isupper() and len(text.split()) <= 4
        numbered_heading = bool(re.match(r"^\s*\d+(?:\.\d+)*\.?\s+", text))
        for region in regions:
            rb = region["bbox"]
            horizontal = _overlap(box, rb) >= 0.45
            gap_below = box["y0"] - rb["y1"]
            gap_above = rb["y0"] - box["y1"]
            adjacent_below = -3 <= gap_below <= typical * 1.6
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
                found.append(line)
                break
    return found

