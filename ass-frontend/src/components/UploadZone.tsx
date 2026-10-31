import { useEffect, useMemo, useRef, useState } from "react";

const ACCEPT = ".png,.jpg,.jpeg,.pdf";

// Drag-and-drop + file picker with thumbnails and remove buttons.
export function UploadZone({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const urls = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => /\.(png|jpe?g|pdf)$/i.test(f.name));
    onChange([...files, ...ok]);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload textbook pages. Press Enter to browse files."
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${over ? "scale-[1.02] border-primary bg-accent" : "border-border hover:border-primary/60 hover:bg-accent/40"} transition-all duration-300`}
      >
        <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-accent text-xl text-primary motion-safe:animate-bounce" aria-hidden>↑</div>
        <p className="font-medium">Drop pages here or <span className="text-primary underline">browse</span></p>
        <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, PDF · multiple files</p>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Selected files">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
              {urls[i] ? <img src={urls[i]!} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded bg-muted text-[10px] font-bold">PDF</div>}
              <span className="flex-1 truncate text-sm">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
