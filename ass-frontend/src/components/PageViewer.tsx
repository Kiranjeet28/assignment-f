import { useState } from "react";
import type { Page, RegionType } from "@/lib/api";
import { TiltCard } from "@/components/fx";

export const REGION_CLS: Record<RegionType, string> = {
  photo: "border-region-photo bg-region-photo/25",
  map: "border-region-map bg-region-map/25",
  diagram: "border-region-diagram bg-region-diagram/25",
  caption: "border-region-caption bg-region-caption/25",
};
export const REGION_BADGE: Record<RegionType, string> = {
  photo: "bg-region-photo", map: "bg-region-map", diagram: "bg-region-diagram", caption: "bg-region-caption",
};

// Page image with skipped regions overlaid. Boxes use % of page_size so they scale with the image.
export function PageViewer({ page }: { page: Page }) {
  const [show, setShow] = useState(true);
  const [debug, setDebug] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const { width: W, height: H } = page.page_size;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3 text-xs" aria-label="Legend">
          {(Object.keys(REGION_BADGE) as RegionType[]).map((t) => (
            <li key={t} className="flex items-center gap-1.5 capitalize"><span className={`h-3 w-3 rounded-sm ${REGION_BADGE[t]}`} />{t}</li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-primary" /> Show skipped regions
        </label>
        {page.debug_overlay_url && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} className="accent-primary" /> Show OCR/layout overlay</label>}
      </div>
      <TiltCard className="mx-auto max-w-xl"><div className="relative overflow-hidden rounded-lg border border-border shadow-soft">
        <img src={debug && page.debug_overlay_url ? page.debug_overlay_url : page.page_image_url} alt={`Page ${page.source}${debug ? " OCR and layout overlay" : ""}`} className="block w-full" />
        {show && !debug && page.skipped_regions.map((r, i) => {
          const [x, y, w, h] = r.bbox;
          return (
            <button key={i} type="button"
              aria-label={`${r.type}${r.caption ? `: ${r.caption}` : ""}`}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              className={`absolute border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${REGION_CLS[r.type]}`}
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%` }}>
              {active === i && (
                <span role="tooltip" className="absolute left-0 top-full z-10 mt-1 w-max max-w-[220px] rounded bg-popover px-2 py-1 text-left text-xs text-popover-foreground shadow-lg">
                  <b className="capitalize">{r.type}</b>{r.caption ? ` — ${r.caption}` : " — no caption"}
                </span>
              )}
            </button>
          );
        })}
      </div></TiltCard>
    </div>
  );
}
