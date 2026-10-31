import type { Page, Question } from "@/lib/api";

// Raw JSON with copy + download.
export function JsonViewer({ pages, questions, extractedText, warnings, notify }: {
  pages: Page[]; questions: Question[]; extractedText: string; warnings: string[]; notify: (m: string) => void;
}) {
  const text = JSON.stringify({
    pages: pages.map(({ questions: _pageQuestions, ...page }) => page),
    extracted_text: extractedText,
    skipped_regions: pages.flatMap((page) => page.skipped_regions),
    questions,
    warnings,
  }, null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "questions.json"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(text).then(() => notify("JSON copied"))}>Copy JSON</button>
        <button type="button" className="btn-ghost" onClick={download}>Download JSON</button>
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 font-mono text-xs" tabIndex={0} aria-label="Raw JSON">{text}</pre>
    </div>
  );
}
