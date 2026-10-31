# Image, map, diagram, and caption exclusion

The processing pipeline detects large non-text regions using OpenCV color saturation, local texture, contour size, and OCR word density. A detected region is heuristically classified as `photo`, `map`, or `diagram`. OCR words whose boxes substantially overlap those regions are removed before reading order and question generation.

Caption candidates are short OCR lines near a detected region, horizontally aligned with it, or prefixed with a common label such as “Figure” or “Photo”. The caption is stored on the detected region as `caption`; a separate `type: caption` skipped region marks the caption's own box. Activity blocks are omitted from the generated text by default and returned as optional skipped regions.

Coordinates are pixel values relative to the page image returned by `/api/upload`. The OCR debug overlay draws retained OCR word boxes in green and exclusions in red.

These are explainable heuristics rather than a trained page-layout model. They can miss grayscale or low-contrast figures, merge neighboring visual elements, or conservatively flag nearby prose. The page-44 checkpoint (four regions and four linked captions) requires running the actual assignment textbook page and reviewing its overlay; that source page was not in the workspace when this backend was implemented.
