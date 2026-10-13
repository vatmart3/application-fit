"use client";
/**
 * Fallback 2D (SVG) quand WebGL est indisponible : silhouette stylisée dont
 * les volumes suivent les mêmes paramètres que l'avatar 3D.
 */
import type { MuscleGroup } from "./contract";
import { CLASS_INFO, type Appearance, type AvatarState, muscleInfluence } from "./params";

export function Avatar2DFallback({ state, appearance, pulsing }: { state: AvatarState; appearance: Appearance; pulsing?: MuscleGroup | null }) {
  const m = (g: MuscleGroup) => Math.max(0, muscleInfluence(state.muscles[g]));
  const color = CLASS_INFO[state.playerClass].color;
  const sh = 46 + m("shoulders") * 10 + m("back") * 6; // demi-largeur d'épaules
  const waist = 30 - (state.definition - 50) * 0.08 + Math.max(0, 50 - state.definition) * 0.15;
  const arm = 9 + m("biceps") * 4 + m("triceps") * 3;
  const thigh = 15 + m("quads") * 5;
  const tired = state.energy < 30;
  const glow = (g: MuscleGroup) => (pulsing === g ? color : appearance.skin);
  return (
    <svg viewBox="0 0 200 320" role="img" aria-label="Avatar (mode 2D)" className="h-full w-full" style={{ filter: tired ? "saturate(0.5)" : undefined }}>
      <defs>
        <radialGradient id="aura2d" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={0.35 * (state.energy / 100)} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="170" rx="95" ry="150" fill="url(#aura2d)" />
      <g transform={tired ? "rotate(4 100 300) translate(0 6)" : undefined} stroke={color} strokeWidth="1.5">
        <circle cx="100" cy="48" r="20" fill={appearance.skin} />
        <path d={`M${100 - sh} 82 Q100 70 ${100 + sh} 82 L${100 + waist} 170 L${100 - waist} 170 Z`} fill={appearance.outfitColor} />
        <rect x={100 - sh - arm} y="82" width={arm * 2} height="70" rx={arm} fill={glow("biceps")} />
        <rect x={100 + sh - arm} y="82" width={arm * 2} height="70" rx={arm} fill={glow("biceps")} />
        <rect x={100 - sh - arm * 0.8} y="150" width={arm * 1.6} height="60" rx={arm * 0.8} fill={glow("forearms")} />
        <rect x={100 + sh - arm * 0.8} y="150" width={arm * 1.6} height="60" rx={arm * 0.8} fill={glow("forearms")} />
        <path d={`M${100 - waist} 168 L${100 + waist} 168 L${100 + waist + 2} 205 L${100 - waist - 2} 205 Z`} fill="#141a2e" />
        <rect x={100 - waist - 2} y="200" width={thigh * 2} height="105" rx={thigh} fill={glow("quads")} />
        <rect x={100 + waist + 2 - thigh * 2} y="200" width={thigh * 2} height="105" rx={thigh} fill={glow("quads")} />
      </g>
    </svg>
  );
}
