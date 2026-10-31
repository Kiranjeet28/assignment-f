import base64
import io
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw
from pytesseract import TesseractNotFoundError

load_dotenv()

from app.captions import detect_captions
from app.generate import GeminiTimeoutError, generate_grounded
from app.ingest import decode_data_url, ingest_uploads
from app.layout import build_blocks, detect_visual_regions, group_lines, remove_visual_words
from app.ocr import ocr_words
from app.schemas import GenerateRequest, PageSize, ProcessedPage, SkippedRegion, TextBlock

app = FastAPI(title="Document Question Generator", version="2.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])


@app.get("/")
def root():
    return {"name": app.title, "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "gemini_configured": bool(os.getenv("GEMINI_API_KEY"))}


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    """Convert multiple PDFs/images into 200-DPI page image data URLs."""
    return {"pages": await ingest_uploads(files)}


def analyze_page(page_input, include_activities: bool) -> tuple[dict, list[dict]]:
    image = decode_data_url(page_input.page_image_url)
    width, height = image.size
    try:
        words = ocr_words(image)
    except TesseractNotFoundError as exc:
        raise HTTPException(503, "Tesseract OCR is not installed or is not available on PATH.") from exc
    except Exception as exc:
        raise HTTPException(503, f"OCR failed on page {page_input.page_number}: {exc}") from exc

    edge_margin = max(8, int(height * 0.018))
    edge_clipped_words = {id(word) for word in words if word["bbox"]["y1"] >= height - edge_margin}
    layout_words = [word for word in words if id(word) not in edge_clipped_words]
    visual_regions = detect_visual_regions(image, layout_words)
    lines = group_lines(layout_words)
    caption_lines = detect_captions(lines, visual_regions)
    skipped = []
    for region in visual_regions:
        skipped.append({"page": page_input.page_number, "bbox": region["bbox"],
                        "type": region["type"], "caption": region.get("caption"),
                        "reason": region["reason"]})
        if region.get("caption"):
            skipped.append({"page": page_input.page_number,
                            "bbox": region.get("caption_bbox", region["bbox"]),
                            "type": "caption", "caption": region["caption"],
                            "reason": "adjacent_small_text_or_caption_label"})

    caption_boxes = [line["bbox"] for line in caption_lines]
    all_words = words
    retained_words = remove_visual_words(layout_words, visual_regions)
    # Remove OCR words from lines classified as figure captions.
    retained_words = [word for word in retained_words if not any(
        word["bbox"]["x0"] >= box["x0"] - 1 and word["bbox"]["x1"] <= box["x1"] + 1
        and word["bbox"]["y0"] >= box["y0"] - 1 and word["bbox"]["y1"] <= box["y1"] + 1
        for box in caption_boxes)]
    retained_ids = {id(word) for word in retained_words}
    for word in all_words:
        word["excluded"] = id(word) not in retained_ids
        if word["excluded"]:
            word["excluded_reason"] = (
                "page_edge_clipped" if id(word) in edge_clipped_words
                else "visual_region_or_caption"
            )
    lines = group_lines(retained_words)
    blocks = build_blocks(lines, width, include_activities=True)
    retained = []
    for block in blocks:
        block["page"] = page_input.page_number
        if block["tag"] == "activity":
            if not include_activities:
                skipped.append({"page": page_input.page_number, "bbox": block["bbox"],
                                "type": "activity", "caption": None,
                                "reason": "optional_activity_skipped_by_default"})
                continue
        retained.append(block)
    extracted_text = "\n".join(block["text"] for block in retained).strip()

    overlay = image.copy()
    draw = ImageDraw.Draw(overlay)
    for word in all_words:
        b = word["bbox"]
        color = (235, 125, 20) if word["excluded"] else (20, 170, 60)
        draw.rectangle((b["x0"], b["y0"], b["x1"], b["y1"]), outline=color, width=1)
    for region in skipped:
        b = region["bbox"]
        draw.rectangle((b["x0"], b["y0"], b["x1"], b["y1"]), outline=(235, 45, 45), width=3)
    output = io.BytesIO()
    overlay.save(output, format="JPEG", quality=83, optimize=True)
    debug_url = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")

    result = ProcessedPage(
        page_number=page_input.page_number,
        page_size=PageSize(width=width, height=height),
        page_image_url=page_input.page_image_url,
        extracted_text=extracted_text,
        blocks=[TextBlock(**block) for block in retained],
        words=all_words,
        skipped_regions=[SkippedRegion(**region) for region in skipped],
    ).model_dump()
    result["debug_overlay_url"] = debug_url
    return result, skipped


@app.post("/api/generate")
async def generate(request: GenerateRequest):
    """OCR/layout each supplied page, then generate questions from text only."""
    processed, skipped = [], []
    for page_input in request.pages:
        page, page_skips = analyze_page(page_input, request.include_activities)
        processed.append(page)
        skipped.extend(page_skips)
    extracted_text = "\n\n".join(page["extracted_text"] for page in processed if page["extracted_text"])
    if not extracted_text:
        raise HTTPException(422, "No readable body text was found. Check Tesseract installation and page quality.")
    try:
        questions = await generate_grounded(extracted_text, request.question_count,
                                             request.question_types, request.difficulty, skipped)
    except GeminiTimeoutError as exc:
        raise HTTPException(504, str(exc)) from exc
    except RuntimeError as exc:
        detail = str(exc)
        if "GEMINI_API_KEY" in detail:
            raise HTTPException(503, detail) from exc
        if "Timeout" in detail or "timeout" in detail:
            raise HTTPException(504, detail) from exc
        raise HTTPException(502, detail) from exc
    except Exception as exc:
        raise HTTPException(502, f"Gemini request failed: {exc}") from exc
    return {"pages": processed, "extracted_text": extracted_text,
            "skipped_regions": skipped, "questions": [q.model_dump() for q in questions],
            "warnings": [] if len(questions) == request.question_count else [
                f"Grounding checks accepted {len(questions)} of {request.question_count} requested questions."]}


@app.post("/api/debug/ocr-overlay")
async def ocr_overlay(page_image_url: str = Form(...), page_number: int = Form(1, ge=1)):
    """Return OCR words and a visualizable overlay for a single uploaded page image."""
    image = decode_data_url(page_image_url)
    class DebugPage:
        pass
    page = DebugPage()
    page.page_image_url = page_image_url
    page.page_number = page_number
    page.page_size = PageSize(width=image.width, height=image.height)
    result, _ = analyze_page(page, include_activities=True)
    return {"page_number": page_number, "page_size": result["page_size"],
            "words": result["words"], "debug_overlay_url": result["debug_overlay_url"]}

