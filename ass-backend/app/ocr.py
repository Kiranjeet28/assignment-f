import cv2
import numpy as np
import pytesseract
import os
import shutil
from PIL import Image


def _configure_tesseract():
    configured = os.getenv("TESSERACT_CMD") or shutil.which("tesseract")
    if not configured:
        candidates = [
            os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Tesseract-OCR", "tesseract.exe"),
            os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Tesseract-OCR", "tesseract.exe"),
        ]
        configured = next((path for path in candidates if os.path.isfile(path)), None)
    if configured:
        pytesseract.pytesseract.tesseract_cmd = configured


_configure_tesseract()


def ocr_words(image: Image.Image, min_confidence: float = 28.0) -> list[dict]:
    rgb = np.asarray(image.convert("RGB"))
    # Browser screenshots and pasted images are often much smaller than PDFs
    # rendered at 200 DPI. Upscale those inputs before OCR, then map word boxes
    # back to the original image coordinate system for overlays/layout.
    scale = min(3.0, max(1.0, 1200.0 / max(rgb.shape[1], 1)))
    if scale > 1.0:
        rgb = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # Light denoising helps scans without destroying small textbook glyphs.
    processed = cv2.fastNlMeansDenoising(gray, None, 8, 7, 21)
    raw = pytesseract.image_to_data(processed, output_type=pytesseract.Output.DICT,
                                    config="--oem 3 --psm 3")
    words = []
    for i, text in enumerate(raw["text"]):
        text = text.strip()
        try:
            confidence = float(raw["conf"][i])
        except (TypeError, ValueError):
            continue
        if not text or confidence < min_confidence:
            continue
        x, y, width, height = (int(round(int(raw[key][i]) / scale))
                                for key in ("left", "top", "width", "height"))
        if width <= 0 or height <= 0:
            continue
        words.append({"text": text, "bbox": {"x0": x, "y0": y,
                      "x1": x + width, "y1": y + height}, "confidence": round(confidence, 1),
                      "block_num": int(raw["block_num"][i]),
                      "paragraph_num": int(raw["par_num"][i]),
                      "line_num": int(raw["line_num"][i]),
                      "word_num": int(raw["word_num"][i])})
    return words

