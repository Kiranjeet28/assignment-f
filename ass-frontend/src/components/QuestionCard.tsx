import { useState } from "react";
import type { Question } from "@/lib/api";

export const TYPE_LABEL = { mcq: "MCQ", short_answer: "Short answer", true_false: "True/False", fill_blank: "Fill blank" } as const;
const DIFF = { easy: "bg-diff-easy/15 text-diff-easy", medium: "bg-diff-medium/15 text-diff-medium", hard: "bg-diff-hard/15 text-diff-hard" };

// One question with a per-card answer toggle (forced open by "Show all answers").
export function QuestionCard({ q, forceOpen }: { q: Question; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  return (
    <article className="h-full rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">Q{q.id}</span>
        <span className="rounded bg-secondary px-2 py-0.5 font-medium">{TYPE_LABEL[q.type]}</span>
        <span className={`rounded px-2 py-0.5 font-medium capitalize ${DIFF[q.difficulty]}`}>{q.difficulty}</span>
      </div>
      <p className="font-medium">{q.question}</p>
      {q.type === "mcq" && q.options && (
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {q.options.slice(0, 4).map((o, i) => <li key={i}>({String.fromCharCode(97 + i)}) {o}</li>)}
        </ol>
      )}
      <button type="button" aria-expanded={shown} onClick={() => setOpen(!open)} disabled={forceOpen}
        className="mt-3 text-sm font-medium text-primary hover:underline disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring rounded">
        {shown ? "Hide answer" : "Show answer"}
      </button>
      {shown && (
        <div className="mt-2 space-y-2 text-sm">
          <p><b>Answer:</b> {q.answer}</p>
          <blockquote className="border-l-4 border-primary bg-accent px-3 py-2 italic text-accent-foreground">“{q.source_sentence}”</blockquote>
        </div>
      )}
    </article>
  );
}
