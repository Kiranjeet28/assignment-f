# Image, map, diagram, and caption exclusion

The backend uses OpenCV to propose non-text panels from color saturation and local texture. It filters candidates by approximate size, fill, OCR density, and shape, then classifies them as `photo`, `map`, or `diagram`. These labels and bounding boxes are heuristic. OCR words substantially overlapping detected panels are excluded from the body text and marked in the response.

Caption detection considers short OCR lines adjacent to a visual and aligned with its horizontal span. If Tesseract merges caption words with body text on a single line, the detector attempts to isolate words over the figure's horizontal span before excluding them. A separate `type: caption` region is returned when a caption is linked. This can miss small or low-resolution captions and can still misassociate nearby text.

Activity handling is separate from figure exclusion. A recognized block beginning with “Activity” is marked optional and omitted by default. OCR-split or misread labels may not be recognized, so activity instructions can leak into extracted text.

Coordinates are pixel values relative to the page image returned by `/api/upload`. In the debug overlay, retained OCR word boxes are green, excluded word boxes are orange, and skipped-region outlines are red.

### Observed page check

On the supplied 554 × 936 chapter page image, the current detector returned the three photo panels and one map. It linked the glacier and dam captions but missed the Ganga-plains caption. The main body paragraphs were retained in reading order; some activity text remained, and “Activity” was split by OCR. This is a smoke check on one image, not a measured accuracy score across document types. Review the page viewer and skipped-region JSON for each new layout, especially grayscale figures, narrow captions, two-column text, and low-resolution scans.
