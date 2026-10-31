export type RegionType = "photo" | "map" | "diagram" | "caption";
export type QType = "mcq" | "short_answer" | "true_false" | "fill_blank";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultySetting = Difficulty | "mixed";

export interface Region { type: RegionType; caption: string | null; bbox: [number, number, number, number]; page?: number }
export interface Question { id?: number; type: QType; difficulty: Difficulty; question: string; options: string[] | null; answer: string; source_sentence: string }
export interface UploadedPage { page_number: number; page_size: { width: number; height: number }; page_image_url: string; [key: string]: unknown }
export interface Page {
  source: string; page_number?: number; page_image_url: string; page_size: { width: number; height: number };
  extracted_text: string; skipped_regions: Region[]; questions: Question[]; debug_overlay_url?: string;
}
export interface GenerateResult { extracted_text: string; questions: Question[]; skipped_regions: Region[]; warnings: string[]; debug_overlay_url?: string }
export interface Settings { mcq: number; short_answer: number; true_false: number; fill_blank: number; difficulty_mix: Record<Difficulty, number> }

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
export function resolveApiAsset(url: string) {
  return /^https?:\/\//i.test(url) || !apiBase ? url : `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
}

function errorMessage(status: number, detail?: string) {
  const messages: Record<number, string> = {
    422: "No readable text was found in these files. Try a clearer scan or image.",
    502: "Question generation or response validation failed. Please try again.",
    503: "The backend is missing its Gemini API key. Contact the backend operator.",
    504: "The Gemini request timed out. Please try again.",
  };
  return `${messages[status] ?? `The API returned ${status}.`}${detail ? ` ${detail}` : ""}`;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { throw new Error("Could not reach the backend. Check the API URL and CORS settings."); }
  const payload = await response.json().catch(() => ({})) as { detail?: unknown; message?: unknown };
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : typeof payload.message === "string" ? payload.message : undefined;
    throw new Error(errorMessage(response.status, detail));
  }
  return payload as T;
}

export async function uploadFiles(files: File[]): Promise<UploadedPage[]> {
  if (!apiBase) throw new Error("VITE_API_BASE_URL is not configured. Set it to your backend base URL.");
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const data = await request<{ pages?: UploadedPage[] }>(`${apiBase}/api/upload`, { method: "POST", body: form });
  if (!Array.isArray(data.pages) || data.pages.length === 0) throw new Error("The upload response did not contain any pages.");
  return data.pages;
}

export async function generateQuestions(pages: UploadedPage[], s: Settings): Promise<GenerateResult> {
  if (!apiBase) throw new Error("VITE_API_BASE_URL is not configured. Set it to your backend base URL.");
  const questionTypes = (["mcq", "short_answer", "true_false", "fill_blank"] as QType[]).filter((type) => s[type] > 0);
  const values = Object.entries(s.difficulty_mix).filter(([, count]) => count > 0).map(([key]) => key as Difficulty);
  const difficulty: DifficultySetting = values.length === 1 ? values[0]! : "mixed";
  const data = await request<GenerateResult>(`${apiBase}/api/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages, question_count: s.mcq + s.short_answer + s.true_false + s.fill_blank, question_types: questionTypes, difficulty, include_activities: false }),
  });
  if (!Array.isArray(data.questions)) throw new Error("The generation response did not contain a questions list.");
  if (data.questions.length === 0) throw new Error("The backend returned no questions. Adjust the settings or try different pages.");
  return data;
}
