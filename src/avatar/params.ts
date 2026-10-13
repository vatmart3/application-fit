/**
 * Paramètres "métier" de l'avatar (ce que le moteur d'évolution produit) et
 * leur traduction en influences de morph targets (ce que le rendu consomme).
 * Fonctions pures : testées dans src/avatar/params.test.ts.
 */
import {
  type BeardStyle,
  type BodyBase,
  type BottomStyle,
  type FaceMorph,
  FACE_MORPHS,
  type HairStyle,
  MUSCLE_GROUPS,
  type MuscleGroup,
  muscleMorph,
  type TopStyle,
} from "./contract";

export type PlayerClass = "titan" | "coureur" | "combattant" | "hybride";

export const CLASS_INFO: Record<PlayerClass, { label: string; color: string; tagline: string }> = {
  titan: { label: "Titan", color: "#ff4b2b", tagline: "La force brute, record après record." },
  coureur: { label: "Coureur", color: "#22d3ee", tagline: "Le souffle infini, la foulée légère." },
  combattant: { label: "Combattant", color: "#ff8a1f", tagline: "Les poings rapides, la garde de fer." },
  hybride: { label: "Hybride", color: "#b6ff2e", tagline: "Partout bon, nulle part battu." },
};

export interface Appearance {
  base: BodyBase;
  /** Teint : couleur sRGB hex. */
  skin: string;
  hair: HairStyle;
  hairColor: string;
  beard: BeardStyle;
  eyeColor: string;
  top: TopStyle;
  bottom: BottomStyle;
  /** Couleur principale de la tenue (débloquée en jouant). */
  outfitColor: string;
  /** Visage : chaque curseur 0→1. */
  face: Partial<Record<FaceMorph, number>>;
}

export interface AvatarState {
  /** Niveau par groupe musculaire, 0 → 100. */
  muscles: Record<MuscleGroup, number>;
  /** Sécheresse 0 → 100 (suit la tendance poids / % MG sur 7 jours). */
  definition: number;
  /** Énergie 0 → 100 (sommeil, nutrition, régularité). */
  energy: number;
  playerClass: PlayerClass;
}

export const SKIN_TONES = ["#f6d7c3", "#eac0a0", "#d79f78", "#b97b55", "#8d5a3b", "#5e3a26"] as const;
export const HAIR_COLORS = ["#1b1310", "#3b2416", "#6b4423", "#b07a3e", "#d9b26f", "#9a9a9a", "#e14b3b", "#3a6bff"] as const;
export const EYE_COLORS = ["#4a2d18", "#7a5230", "#3f7d4f", "#3b6fa8", "#7d8a96", "#c4892a"] as const;

export const DEFAULT_APPEARANCE: Appearance = {
  base: "m",
  skin: SKIN_TONES[2],
  hair: "short",
  hairColor: HAIR_COLORS[1],
  beard: "stubble",
  eyeColor: EYE_COLORS[1],
  top: "tank",
  bottom: "shorts",
  outfitColor: "#ff6a1a",
  face: {},
};

export const uniformMuscles = (level: number) =>
  Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, level])) as Record<MuscleGroup, number>;

export const DEFAULT_STATE: AvatarState = {
  muscles: uniformMuscles(30),
  definition: 50,
  energy: 70,
  playerClass: "hybride",
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Niveau musculaire (0-100) → influence du morph.
 * 25 ≈ corps moyen (0), 60 ≈ "max muscle" MakeHuman (1), 100 = exagération
 * héroïque (1.5). Courbe volontairement "jeu" : 8 semaines crédibles (+16
 * niveaux) doivent se VOIR. Sous 25 : légère fonte (négatif, plafonné à −0,3).
 */
export function muscleInfluence(level: number): number {
  const l = clamp(level, 0, 100);
  if (l < 25) return -0.3 * (1 - l / 25);
  if (l <= 60) return (l - 25) / 35;
  return 1 + ((l - 60) / 40) * 0.5;
}

/** Définition (0-100) → lean / fat. 50 = neutre. */
export function compositionInfluences(definition: number) {
  const d = clamp(definition, 0, 100);
  return {
    lean: d > 50 ? (d - 50) / 50 : 0,
    fat: d < 50 ? ((50 - d) / 50) * 0.8 : 0,
  };
}

export interface MorphFrame {
  /** Influences cibles par nom de morph. */
  weights: Record<string, number>;
  /** 0 → 1 : désaturation, posture fatiguée, aura faible. */
  tiredness: number;
}

/** Traduction complète état + apparence → poids de morphs. */
export function computeMorphFrame(state: AvatarState, appearance: Appearance): MorphFrame {
  const weights: Record<string, number> = {};
  let mean = 0;
  for (const g of MUSCLE_GROUPS) {
    const w = muscleInfluence(state.muscles[g]);
    weights[muscleMorph(g)] = w;
    mean += Math.max(0, w);
  }
  mean /= MUSCLE_GROUPS.length;
  const { lean, fat } = compositionInfluences(state.definition);
  weights.lean = lean;
  weights.fat = fat;
  // Les abdos et séparations n'apparaissent que si muscle ET sécheresse.
  weights.cut = clamp(mean * lean * 1.4, 0, 1.2);
  weights.cheeks_hollow = lean * 0.8;
  const energy = clamp(state.energy, 0, 100) / 100;
  const tiredness = clamp((0.55 - energy) / 0.45, 0, 1);
  weights.fatigue = tiredness * 0.9;
  for (const f of FACE_MORPHS) weights[f] = clamp(appearance.face[f] ?? 0, 0, 1);
  return { weights, tiredness };
}
