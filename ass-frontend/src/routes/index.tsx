import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Backdrop, SpotlightCard } from "@/components/fx";
import { UploadZone } from "@/components/UploadZone";
import { SettingsForm } from "@/components/SettingsForm";
import { PageViewer, REGION_BADGE } from "@/components/PageViewer";
import { QuestionCard, TYPE_LABEL } from "@/components/QuestionCard";
import { JsonViewer } from "@/components/JsonViewer";
import { generateQuestions, type Page, type Settings } from "@/lib/api";
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

function Empty({ msg }: { msg: string }) {
  return <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">{msg}</div>;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<Settings>({ mcq: 4, short_answer: 2, true_false: 2, fill_blank: 2, difficulty_mix: { easy: 4, medium: 4, hard: 2 } });
  const [pages, setPages] = useState<Page[]>([]);
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
    setLoading(true);
    try { load(await generateQuestions(files, settings)); notify("Questions generated"); }
    catch (e) { notify(`Generation failed: ${(e as Error).message}`, true); }
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
            <button type="button" onClick={() => { load((sample as { pages: Page[] }).pages); notify("Sample loaded"); }} className="btn-ghost w-full">Load sample JSON</button>
          </div>
        </aside>

        <SpotlightCard className="min-w-0" aria-label="Results">
          {pages.length > 1 && (
            <label className="mb-4 flex items-center gap-2 text-sm">Page
              <select value={pageIdx} onChange={(e) => setPageIdx(+e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
                {pages.map((p, i) => <option key={i} value={i}>{i + 1}. {p.source}</option>)}
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
                  {qs.length === 0 ? <Empty msg="No questions match these filters." /> : <div className="grid gap-3 md:grid-cols-2">{qs.map((q, i) => <motion.div key={q.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}><QuestionCard q={q} forceOpen={allAns} /></motion.div>)}</div>}
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
