// Single place for the backend call + response types.
export type RegionType = "photo" | "map" | "diagram" | "caption";
export type QType = "mcq" | "short_answer" | "true_false" | "fill_blank";
export type Difficulty = "easy" | "medium" | "hard";

export interface Region { type: RegionType; caption: string | null; bbox: [number, number, number, number] }
export interface Question { id: number; type: QType; difficulty: Difficulty; question: string; options: string[] | null; answer: string; source_sentence: string }
export interface Page { source: string; page_image_url: string; page_size: { width: number; height: number }; extracted_text: string; skipped_regions: Region[]; questions: Question[] }
export interface Settings { mcq: number; short_answer: number; true_false: number; fill_blank: number; difficulty_mix: Record<Difficulty, number> }

export async function generateQuestions(files: File[], s: Settings): Promise<Page[]> {
  const base = import.meta.env["VITE_API_URL"] ?? "";
  const fd = new FormData();
  files.forEach((f) => fd.append("files[]", f));
  fd.append("mcq", String(s.mcq));
  fd.append("short_answer", String(s.short_answer));
  fd.append("true_false", String(s.true_false));
  fd.append("fill_blank", String(s.fill_blank));
  fd.append("difficulty_mix", JSON.stringify(s.difficulty_mix));
  const res = await fetch(`${base}/api/generate`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  const data = await res.json();
  return data.pages ?? [];
}
