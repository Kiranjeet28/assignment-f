import { useState } from "react";
import type { Question } from "@/lib/api";

export const TYPE_LABEL = { mcq: "MCQ", short_answer: "Short answer", true_false: "True/False", fill_blank: "Fill blank" } as const;
const DIFF = { easy: "bg-diff-easy/15 text-diff-easy", medium: "bg-diff-medium/15 text-diff-medium", hard: "bg-diff-hard/15 text-diff-hard" };
const ANSWER_STOPWORDS = new Set(["about", "after", "also", "and", "are", "because", "been", "being", "both", "but", "for", "from", "have", "into", "its", "that", "the", "their", "them", "they", "this", "through", "was", "were", "which", "with"]);

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const keyTerms = (value: string) => new Set(normalize(value).split(/\s+/).filter((word) => word.length > 2 && !ANSWER_STOPWORDS.has(word)));

function isCorrect(q: Question, response: string, options: string[]) {
  const answer = normalize(q.answer);
  const selected = normalize(response);
  if (answer === selected) return true;
  if (q.type === "short_answer") {
    const expectedTerms = keyTerms(q.answer);
    const submittedTerms = keyTerms(response);
    const overlap = [...expectedTerms].filter((term) => submittedTerms.has(term)).length;
    return expectedTerms.size > 0 && submittedTerms.size > 0
      && overlap / expectedTerms.size >= 0.75
      && overlap / submittedTerms.size >= 0.6;
  }
  // Some generators return the option letter instead of the option text.
  const answerLetter = answer.match(/^(?:option\s*)?\(?([a-z])\)?$/)?.[1];
  if (answerLetter) {
    const answerIndex = answerLetter.charCodeAt(0) - 97;
    return options[answerIndex] !== undefined && normalize(options[answerIndex]!) === selected;
  }
  const answerText = answer.match(/^\(?([a-z])\)?[.)]\s*(.+)$/)?.[2];
  return Boolean(answerText && normalize(answerText) === selected);
}

export function QuestionCard({ q, forceOpen }: { q: Question; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const options = q.type === "true_false" ? (Array.isArray(q.options) && q.options.length ? q.options : ["True", "False"]) : (Array.isArray(q.options) ? q.options : []);
  const shown = open || forceOpen;
  const updateResponse = (value: string) => { setResponse(value); setChecked(null); };

  return (
    <article className={`h-full rounded-lg border p-4 shadow-sm transition-all duration-300 ${checked === true ? "border-green-600 bg-green-500/10" : checked === false ? "border-red-600 bg-red-500/10" : "border-border bg-card"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">Q{q.id ?? "—"}</span>
        <span className="rounded bg-secondary px-2 py-0.5 font-medium">{TYPE_LABEL[q.type]}</span>
        <span className={`rounded px-2 py-0.5 font-medium capitalize ${DIFF[q.difficulty]}`}>{q.difficulty}</span>
      </div>
      <p className="font-medium">{q.question}</p>

      {(q.type === "mcq" || q.type === "true_false") && options.length > 0 ? (
        <fieldset className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <legend className="sr-only">Choose an answer</legend>
          {options.map((option, i) => {
            const correctOption = checked !== null && isCorrect(q, option, options);
            const selectedWrong = checked === false && response === option;
            return <label key={i} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors ${correctOption ? "border-green-600 bg-green-500/15" : selectedWrong ? "border-red-600 bg-red-500/15" : "border-border bg-background/70"}`}>
              <input type="radio" name={`answer-${q.id ?? q.question}`} value={option} checked={response === option} onChange={() => updateResponse(option)} className="accent-primary" />
              <span>{q.type === "mcq" ? `(${String.fromCharCode(97 + i)}) ` : ""}{option}</span>
            </label>;
          })}
        </fieldset>
      ) : q.type === "short_answer" ? (
        <label className="mt-3 block text-sm"><span className="sr-only">Your answer</span><textarea value={response} onChange={(e) => updateResponse(e.target.value)} rows={3} placeholder="Write your answer…" className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      ) : (
        <label className="mt-3 block text-sm"><span className="sr-only">Your answer</span><input type="text" value={response} onChange={(e) => updateResponse(e.target.value)} placeholder="Type your answer…" className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setChecked(isCorrect(q, response, options))} disabled={!response.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">Check answer</button>
        {!forceOpen && <button type="button" aria-expanded={shown} onClick={() => setOpen(!open)} className="text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded">{shown ? "Hide answer" : "Show answer"}</button>}
        {checked !== null && <span role="status" className={`text-sm font-semibold ${checked ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{checked ? "Correct!" : "Not quite"}</span>}
      </div>
      {(shown || checked === false) && (
        <div className="mt-3 space-y-2 text-sm">
          <p><b>Answer:</b> {q.answer}</p>
          {q.source_sentence && <blockquote className="border-l-4 border-primary bg-accent px-3 py-2 italic text-accent-foreground">“{q.source_sentence}”</blockquote>}
        </div>
      )}
    </article>
  );
}
