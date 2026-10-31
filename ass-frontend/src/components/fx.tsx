// Aceternity-style effects, hand-built with `motion` (no extra UI kit).
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode, MouseEvent } from "react";

/** 3D tilt card: rotates toward the cursor with a moving glare. */
export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [8, -8]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(x, [0, 1], [-8, 8]), { stiffness: 200, damping: 20 });
  const gx = useTransform(x, (v) => `${v * 100}%`), gy = useTransform(y, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(400px circle at ${gx} ${gy}, color-mix(in oklab, white 25%, transparent), transparent 60%)`;
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height);
  };
  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div onMouseMove={move} onMouseLeave={() => { x.set(0.5); y.set(0.5); }}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative">
        {children}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
      </motion.div>
    </div>
  );
}

/** Card with a spotlight that follows the cursor (Aceternity "card spotlight"). */
export function SpotlightCard({ children, className = "", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside"; [k: string]: unknown }) {
  const mx = useMotionValue(-500), my = useMotionValue(-500);
  const bg = useMotionTemplate`radial-gradient(350px circle at ${mx}px ${my}px, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)`;
  const M = motion[Tag];
  return (
    <M {...rest} onMouseMove={(e: MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); mx.set(e.clientX - r.left); my.set(e.clientY - r.top); }}
      onMouseLeave={() => { mx.set(-500); my.set(-500); }}
      className={`group relative overflow-hidden panel shadow-soft ${className}`}>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: bg }} />
      <div className="relative">{children}</div>
    </M>
  );
}

/** Aurora + grid backdrop behind the page. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <div className="aurora absolute -top-1/3 left-1/2 h-[70vh] w-[120vw] -translate-x-1/2" />
    </div>
  );
}
