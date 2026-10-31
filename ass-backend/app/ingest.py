import base64
import io
import re

import pymupdf as fitz
from fastapi import HTTPException, UploadFile
from PIL import Image

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_PAGES = 30
MAX_RENDERED_BYTES = 60 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg"}


def data_url(image_bytes: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"


async def ingest_uploads(files: list[UploadFile]) -> list[dict]:
    if not files:
        raise HTTPException(400, "Upload at least one PDF, PNG, or JPG file.")
    pages: list[dict] = []
    rendered_bytes = 0
    for file in files:
        content = await file.read(MAX_FILE_BYTES + 1)
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(413, f"{file.filename or 'File'} exceeds the 25 MB limit.")
        name = file.filename or "upload"
        mime = (file.content_type or "").lower()
        if content.startswith(b"%PDF-") or mime == "application/pdf" or name.lower().endswith(".pdf"):
            try:
                document = fitz.open(stream=content, filetype="pdf")
            except Exception as exc:
                raise HTTPException(400, f"Could not read PDF {name}.") from exc
            if document.page_count == 0:
                raise HTTPException(400, f"PDF {name} has no pages.")
            if len(pages) + document.page_count > MAX_UPLOAD_PAGES:
                document.close()
                raise HTTPException(413, f"Upload no more than {MAX_UPLOAD_PAGES} pages per request.")
            try:
                for index, page in enumerate(document):
                    pix = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False)
                    raw = pix.tobytes("png")
                    rendered_bytes += len(raw)
                    if rendered_bytes > MAX_RENDERED_BYTES:
                        raise HTTPException(413, "Rendered page images exceed the 60 MB request limit.")
                    pages.append({"page_number": len(pages) + 1, "page_size": {
                        "width": pix.width, "height": pix.height, "unit": "px"},
                        "page_image_url": data_url(raw, "image/png"),
                        "source_filename": name, "source_page": index + 1})
            finally:
                document.close()
        elif mime in IMAGE_TYPES or name.lower().endswith((".png", ".jpg", ".jpeg")):
            try:
                image = Image.open(io.BytesIO(content)).convert("RGB")
            except Exception as exc:
                raise HTTPException(400, f"Could not read image {name}.") from exc
            if image.width * image.height > 40_000_000:
                raise HTTPException(413, f"Image {name} dimensions exceed the 40 megapixel limit.")
            if len(pages) == MAX_UPLOAD_PAGES:
                raise HTTPException(413, f"Upload no more than {MAX_UPLOAD_PAGES} pages per request.")
            stream = io.BytesIO()
            image.save(stream, format="PNG", optimize=True)
            rendered_bytes += stream.tell()
            if rendered_bytes > MAX_RENDERED_BYTES:
                raise HTTPException(413, "Rendered page images exceed the 60 MB request limit.")
            pages.append({"page_number": len(pages) + 1, "page_size": {
                "width": image.width, "height": image.height, "unit": "px"},
                "page_image_url": data_url(stream.getvalue(), "image/png"),
                "source_filename": name, "source_page": 1})
        else:
            raise HTTPException(415, f"Unsupported file {name}; use PDF, PNG, or JPG.")
    if not pages:
        raise HTTPException(400, "No pages were found in the uploaded files.")
    return pages


def decode_data_url(value: str) -> Image.Image:
    match = re.fullmatch(r"data:image/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=\r\n]+)", value)
    if not match:
        raise HTTPException(422, "page_image_url must be a PNG/JPG base64 data URL returned by /api/upload.")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
        image = Image.open(io.BytesIO(raw))
        image.verify()
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(422, "Invalid image data in page_image_url.") from exc
