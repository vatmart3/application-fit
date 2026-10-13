"use client";
/** Briques d'interface du jeu : transitions en wipe diagonal, stepper, barre maintenue. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Transition d'écran façon jeu : une lame diagonale balaie l'écran. */
export function WipeSwitch({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={id} className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-y-0 z-50 w-[160vw] -skew-x-[18deg] bg-[var(--class)]"
          style={{ left: "-30vw" }}
          initial={{ x: "0%" }}
          animate={{ x: "120%", transition: { duration: 0.45, ease: [0.7, 0, 0.3, 1] } }}
          exit={{ x: ["-120%", "0%"], transition: { duration: 0.32, ease: [0.7, 0, 0.3, 1] } }}
        />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const id = `stepper-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center justify-between gap-2 bg-night-900/70 px-3 py-2" style={{ clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)" }}>
      <label htmlFor={id} className="text-[11px] uppercase tracking-[0.14em] text-sand-300">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`${label} moins`} className="chip h-8 w-8 bg-night-700 font-display text-sand-100" onClick={() => set(value - step)}>
          −
        </button>
        <input
          id={id}
          inputMode="decimal"
          className="w-16 bg-transparent text-center font-display text-lg text-sand-100 tabular-nums outline-none"
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(v)) onChange(v);
          }}
          onBlur={() => set(value)}
        />
        <span className="w-6 text-[11px] text-sand-300">{unit}</span>
        <button type="button" aria-label={`${label} plus`} className="chip h-8 w-8 bg-night-700 font-display text-sand-100" onClick={() => set(value + step)}>
          +
        </button>
      </div>
    </div>
  );
}

/** Bouton à maintenir (signature du pacte). */
export function HoldButton({ children, onDone, duration = 1100 }: { children: ReactNode; onDone: () => void; duration?: number }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (!done.current) setP(0);
  };
  const tick = (t: number) => {
    if (!start.current) start.current = t;
    const v = Math.min(1, (t - start.current) / duration);
    setP(v);
    if (v >= 1) {
      done.current = true;
      if ("vibrate" in navigator) navigator.vibrate?.([20, 40, 60]);
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      type="button"
      className="btn-game relative w-full overflow-hidden bg-night-700 px-6 py-4 text-base uppercase text-sand-100 select-none"
      onPointerDown={() => {
        start.current = 0;
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !done.current) {
          done.current = true;
          onDone();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${p * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  );
}

/** Barre de niveau animée (stats, muscles). */
export function Bar({ label, value, max = 100, color = "var(--class)", delta }: { label: string; value: number; max?: number; color?: string; delta?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.12em] text-sand-300">
        <span>{label}</span>
        <span className="font-display text-sm text-sand-100 tabular-nums">
          {Math.round(value)}
          {delta ? <span className="ml-1 text-[11px] text-record">+{delta.toFixed(1)}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-2 bg-night-700" style={{ clipPath: "polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)" }}>
        <motion.div
          className="h-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
