import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Backdrop, SpotlightCard } from "@/components/fx";
import { UploadZone } from "@/components/UploadZone";
import { SettingsForm } from "@/components/SettingsForm";
import { PageViewer, REGION_BADGE } from "@/components/PageViewer";
import { QuestionCard, TYPE_LABEL } from "@/components/QuestionCard";
import { JsonViewer } from "@/components/JsonViewer";
import { generateQuestions, resolveApiAsset, uploadFiles, type Page, type Settings } from "@/lib/api";
import sample from "@/data/sample.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Text-Only AI Question Generator" },
      { name: "description", content: "Upload textbook pages and generate questions from body text only — images, maps and captions are skipped." },
      { property: "og:title", content: "Text-Only AI Question Generator" },
      { property: "og:description", content: "Generate MCQ, short answer, true/false and fill-in-the-blank questions from textbook pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

const TABS = ["Page View", "Extracted Text", "Skipped / Flagged", "Questions", "JSON"] as const;
type Tab = (typeof TABS)[number];
const REGION_TYPES = ["photo", "map", "diagram", "caption"] as const;
const QUESTION_TYPES = ["mcq", "short_answer", "true_false", "fill_blank"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function normalizeRegions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const region = entry as Record<string, unknown>;
    const normalizedType = region["type"] === "image" ? "photo" : region["type"];
    if (!REGION_TYPES.includes(normalizedType as (typeof REGION_TYPES)[number])) return [];
    let bbox: number[] | undefined;
    if (Array.isArray(region["bbox"]) && region["bbox"].length === 4 && region["bbox"].every((n) => typeof n === "number" && Number.isFinite(n))) {
      bbox = region["bbox"] as number[];
    } else if (region["bbox"] && typeof region["bbox"] === "object") {
      const box = region["bbox"] as Record<string, unknown>;
      const x = box["x"] ?? box["x0"] ?? box["left"];
      const y = box["y"] ?? box["y0"] ?? box["top"];
      const xEnd = box["x1"] ?? box["right"];
      const yEnd = box["y1"] ?? box["bottom"];
      const width = box["width"] ?? (typeof xEnd === "number" && typeof x === "number" ? xEnd - x : undefined);
      const height = box["height"] ?? (typeof yEnd === "number" && typeof y === "number" ? yEnd - y : undefined);
      if ([x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) bbox = [x as number, y as number, width as number, height as number];
    }
    if (!bbox) return [];
    return [{ type: normalizedType as (typeof REGION_TYPES)[number], caption: typeof region["caption"] === "string" ? region["caption"] : null, bbox: bbox as [number, number, number, number], ...(typeof region["page"] === "number" && { page: region["page"] }) }];
  });
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const question = entry as Record<string, unknown>;
    if (typeof question["question"] !== "string" || typeof question["answer"] !== "string") return [];
    const type = QUESTION_TYPES.includes(question["type"] as (typeof QUESTION_TYPES)[number]) ? question["type"] as (typeof QUESTION_TYPES)[number] : "short_answer";
    const difficulty = DIFFICULTIES.includes(question["difficulty"] as (typeof DIFFICULTIES)[number]) ? question["difficulty"] as (typeof DIFFICULTIES)[number] : "medium";
    return [{
      id: typeof question["id"] === "number" ? question["id"] : index + 1,
      type,
      difficulty,
      question: question["question"] as string,
      options: Array.isArray(question["options"]) ? question["options"].filter((option): option is string => typeof option === "string") : null,
      answer: question["answer"] as string,
      source_sentence: typeof question["source_sentence"] === "string" ? question["source_sentence"] : "",
    }];
  });
}

function Empty({ msg }: { msg: string }) {
  return <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">{msg}</div>;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<Settings>({ mcq: 4, short_answer: 2, true_false: 2, fill_blank: 2, difficulty_mix: { easy: 4, medium: 4, hard: 2 } });
  const [pages, setPages] = useState<Page[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("Page View");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [dark, setDark] = useState(false);
  const [fType, setFType] = useState("all");
  const [fDiff, setFDiff] = useState("all");
  const [allAns, setAllAns] = useState(false);

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const notify = (msg: string, err = false) => setToast({ msg, err });
  const load = (p: Page[]) => { setPages(p); setPageIdx(0); };

  const generate = async () => {
    load([]);
    setWarnings([]);
    setStatus("Uploading files…");
    setLoading(true);
    try {
      const uploaded = await uploadFiles(files);
      setStatus(`Uploaded ${uploaded.length} page${uploaded.length === 1 ? "" : "s"}. Generating questions…`);
      const result = await generateQuestions(uploaded, settings);
      const topRegions = normalizeRegions(result.skipped_regions);
      const processedPages = Array.isArray(result.pages) ? result.pages : [];
      const extractedText = typeof result.extracted_text === "string" ? result.extracted_text : "";
      const questions = normalizeQuestions(result.questions);
      if (questions.length === 0) throw new Error("The backend returned a questions list, but none of its entries had a readable question and answer.");
      const merged = uploaded.map((p, i) => {
        const processed = processedPages.find((candidate) => candidate.page_number === p.page_number)
          ?? processedPages[i];
        const pageRegions = normalizeRegions(processed?.skipped_regions);
        const globalRegions = topRegions.filter((r) => r.page == null || r.page === p.page_number || r.page === i + 1);
        // The API returns regions both per-page and at top level. Merge both
        // so older backend variants and partial responses still draw every
        // detector result, while removing duplicated boxes.
        const regionMap = new Map<string, (typeof pageRegions)[number]>();
        for (const region of [...pageRegions, ...globalRegions]) {
          const key = [region.type, ...region.bbox.map((value) => Math.round(value)), region.caption ?? ""].join(":");
          regionMap.set(key, region);
        }
        const pageDebugOverlay = typeof processed?.debug_overlay_url === "string"
          ? processed.debug_overlay_url : result.debug_overlay_url;
        return {
          source: typeof p["source"] === "string" ? p["source"] : `Page ${p.page_number ?? i + 1}`,
          page_number: p.page_number,
          page_image_url: typeof p.page_image_url === "string" ? resolveApiAsset(p.page_image_url) : "",
          page_size: processed?.page_size && typeof processed.page_size.width === "number" && typeof processed.page_size.height === "number"
            ? processed.page_size
            : p.page_size && typeof p.page_size.width === "number" && typeof p.page_size.height === "number" ? p.page_size : { width: 1, height: 1 },
          extracted_text: extractedText,
          skipped_regions: [...regionMap.values()],
          questions,
          ...(pageDebugOverlay ? { debug_overlay_url: resolveApiAsset(pageDebugOverlay) } : {}),
        } satisfies Page;
      });
      load(merged);
      setWarnings(Array.isArray(result.warnings) ? result.warnings.map((warning) => typeof warning === "string" ? warning : JSON.stringify(warning)) : []);
      setStatus(`Generated ${questions.length} questions from ${uploaded.length} page${uploaded.length === 1 ? "" : "s"}.`);
      notify("Questions generated");
    }
    catch (e) { setStatus((e as Error).message); notify((e as Error).message, true); }
    finally { setLoading(false); }
  };

  const page = pages[pageIdx];
  const qs = page?.questions.filter((q) => (fType === "all" || q.type === fType) && (fDiff === "all" || q.difficulty === fDiff)) ?? [];
  const words = page?.extracted_text.trim().split(/\s+/).filter(Boolean).length ?? 0;

  return (
    <div className="relative flex min-h-screen flex-col">
      <Backdrop />
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5">
          <div>
            <h1 className="text-shimmer font-display text-2xl sm:text-3xl">Text-Only Question Generator</h1>
            <p className="text-sm text-muted-foreground">Upload a textbook page. We read the body text, skip the pictures, and write the questions.</p>
          </div>
          <button type="button" onClick={() => setDark(!dark)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} className="btn-ghost">{dark ? "☀ Light" : "☾ Dark"}</button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6" aria-label="Controls">
          <SpotlightCard><h2 className="mb-3 font-display text-lg">Pages</h2><UploadZone files={files} onChange={setFiles} /></SpotlightCard>
          <SpotlightCard><SettingsForm value={settings} onChange={setSettings} /></SpotlightCard>
          <div className="space-y-2">
            <button type="button" onClick={generate} disabled={!files.length || loading} aria-busy={loading}
              className="moving-border flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 shadow-soft transition-transform active:scale-[0.98] py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" aria-hidden />}
              {loading ? "Generating…" : "Generate Questions"}
            </button>
            <button type="button" onClick={() => { load((sample as { pages: Page[] }).pages); setWarnings([]); setStatus("Sample results loaded."); notify("Sample loaded"); }} className="btn-ghost w-full">Load sample JSON</button>
            {status && <p role={status.startsWith("Generated") || status.startsWith("Sample") || loading ? "status" : "alert"} aria-live="polite" className={`rounded-md px-3 py-2 text-sm ${status.startsWith("Generated") || status.startsWith("Sample") || loading ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>{status}</p>}
          </div>
        </aside>

        <SpotlightCard className="min-w-0" aria-label="Results">
          {warnings.length > 0 && <div role="status" className="mb-4 rounded-md border border-region-caption bg-region-caption/10 p-3 text-sm"><b>Backend warnings</b><ul className="mt-1 list-disc pl-5">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
          {pages.length > 1 && (
            <label className="mb-4 flex items-center gap-2 text-sm">Page
              <select value={pageIdx} onChange={(e) => setPageIdx(+e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
                {pages.map((p, i) => <option key={i} value={i}>{p.page_number ?? i + 1}. {p.source}</option>)}
              </select>
            </label>
          )}
          <div role="tablist" aria-label="Result views" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1"
            onKeyDown={(e) => {
              const i = TABS.indexOf(tab);
              if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length]!);
              if (e.key === "ArrowLeft") setTab(TABS[(i - 1 + TABS.length) % TABS.length]!);
            }}>
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}
                className={`relative whitespace-nowrap px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {tab === t && <motion.span layoutId="tab-pill" className="absolute inset-x-1 inset-y-1 -z-0 rounded-md bg-accent" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{t}</span></button>
            ))}
          </div>

          <AnimatePresence mode="wait"><motion.div key={tab + pageIdx} role="tabpanel" aria-label={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {!page ? <Empty msg={`Nothing here yet. Upload a page and generate, or load the sample to preview the ${tab} view.`} /> : <>
              {tab === "Page View" && <PageViewer page={page} />}

              {tab === "Extracted Text" && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{words} words</span>
                    <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(page.extracted_text).then(() => notify("Text copied"))}>Copy</button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm leading-relaxed">{page.extracted_text}</pre>
                </div>
              )}

              {tab === "Skipped / Flagged" && (page.skipped_regions.length === 0 ? <Empty msg="No regions were skipped on this page." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-muted-foreground"><tr><th className="p-2">Type</th><th className="p-2">Caption</th><th className="p-2">BBox (x, y, w, h)</th></tr></thead>
                    <tbody>{page.skipped_regions.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-medium capitalize text-background ${REGION_BADGE[r.type]}`}>{r.type}</span></td>
                        <td className="p-2">{r.caption ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 font-mono text-xs">{r.bbox.join(", ")}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              ))}

              {tab === "Questions" && (
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                    <select aria-label="Filter by type" value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
                      <option value="all">All types</option>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select aria-label="Filter by difficulty" value={fDiff} onChange={(e) => setFDiff(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
                      <option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                    <label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={allAns} onChange={(e) => setAllAns(e.target.checked)} className="accent-primary" /> Show all answers</label>
                  </div>
                  {qs.length === 0 ? <Empty msg="No questions match these filters." /> : <div className="grid gap-3 md:grid-cols-2">{qs.map((q, i) => <motion.div key={q.id ?? i} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}><QuestionCard q={q} forceOpen={allAns} /></motion.div>)}</div>}
                </div>
              )}

              {tab === "JSON" && <JsonViewer pages={pages} notify={notify} />}
            </>}
          </motion.div></AnimatePresence>
        </SpotlightCard>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Questions are generated only from extracted text. Images, maps and captions are ignored.
      </footer>

      <AnimatePresence>{toast && (
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} role={toast.err ? "alert" : "status"} className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-md px-4 py-3 text-sm shadow-lg ${toast.err ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"}`}>{toast.msg}</motion.div>
      )}</AnimatePresence>
    </div>
  );
}
