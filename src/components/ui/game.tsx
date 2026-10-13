"use client";
/**
 * Composants d'interface "jeu" : aucun composant web par défaut reconnaissable.
 * Panneaux biseautés, boutons qui s'enfoncent, curseurs hexagonaux, puces.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("panel", className)} style={style}>
      {children}
    </div>
  );
}

export function GameButton({
  children,
  variant = "signal",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "signal" | "ghost" | "class" }) {
  const styles = {
    signal: "bg-signal text-night-950 hover:brightness-110",
    class: "bg-class text-night-950 hover:brightness-110",
    ghost: "bg-night-700/80 text-sand-100 hover:bg-night-600",
  }[variant];
  return (
    <button type="button" className={cx("btn-game px-4 py-2 text-sm uppercase", styles, className)} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  onClick,
  swatch,
  label,
}: {
  active?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  swatch?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        "chip flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
        active ? "bg-class text-night-950" : "bg-night-700/80 text-sand-300 hover:bg-night-600",
      )}
    >
      {swatch && <span className="inline-block h-3.5 w-3.5 rotate-45 border border-night-950/50" style={{ background: swatch }} />}
      {children}
    </button>
  );
}

export function GameSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  accent?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.12em] text-sand-300">
        {label}
        <span className="font-display text-sm text-sand-100 tabular-nums">
          {Math.round(value * (step < 1 ? 100 : 1)) / (step < 1 ? 100 : 1)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        className="slider-game"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${fill}%`, ...(accent ? { ["--class" as string]: accent } : {}) }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "chip flex-1 px-2 py-2 font-display text-[11px] uppercase",
            value === t.id ? "bg-class text-night-950" : "bg-night-800 text-sand-300 hover:bg-night-700",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 flex items-center gap-2 font-display text-xs uppercase text-sand-300 first:mt-0">
      <span className="inline-block h-2 w-2 rotate-45 bg-class" />
      {children}
    </h3>
  );
}
