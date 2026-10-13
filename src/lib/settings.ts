"use client";
/**
 * Réglages "options du jeu" (graphismes, mouvements réduits) — Zustand,
 * persistés localement. Le préréglage graphique est détecté automatiquement
 * au premier lancement.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Quality = "low" | "medium" | "ultra";

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  ao: boolean;
  grain: boolean;
  multisampling: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, bloom: false, ao: false, grain: false, multisampling: 0 },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, bloom: true, ao: false, grain: true, multisampling: 2 },
  ultra: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, bloom: true, ao: true, grain: true, multisampling: 4 },
};

/** Heuristique simple : cœurs CPU + mémoire + écran tactile. */
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const touch = typeof window !== "undefined" && "ontouchstart" in window;
  if (cores <= 4 || mem <= 2) return "low";
  if (touch || cores <= 6 || mem <= 4) return "medium";
  return "ultra";
}

interface SettingsState {
  quality: Quality | null;
  reducedMotion: boolean | null;
  setQuality: (q: Quality) => void;
  setReducedMotion: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: null,
      reducedMotion: null,
      setQuality: (quality) => set({ quality }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: "mue-settings" },
  ),
);

/** Qualité effective (réglage utilisateur ou détection). */
export const useQuality = (): Quality => {
  const q = useSettings((s) => s.quality);
  return q ?? detectQuality();
};

export const usePrefersReducedMotion = (): boolean => {
  const v = useSettings((s) => s.reducedMotion);
  if (v !== null) return v;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

let webglSupport: boolean | null = null;
/** Test unique (mis en cache) : créer un contexte WebGL à chaque appel en épuiserait le quota. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return true;
  if (webglSupport !== null) return webglSupport;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    webglSupport = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}
