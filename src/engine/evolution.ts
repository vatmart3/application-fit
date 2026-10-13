/**
 * Moteur d'évolution — fonctions pures, partagées entre le client (aperçu)
 * et le serveur (Edge Function Supabase, source de vérité anti-triche : étape 5).
 *
 * Règles du brief :
 *  - série effective : 5 ≤ reps ≤ 30 et RPE ≥ 7 ; secondaires comptées × 0,5
 *  - niveau par groupe : tend vers une cible calculée sur la moyenne glissante
 *    de 4 semaines, progression max +2 / semaine
 *  - atrophie douce : < 4 séries/semaine pendant 2 semaines → −1 / semaine
 *  - 1RM estimé (Epley) = poids × (1 + reps / 30)
 */
import { MUSCLE_GROUPS, type MuscleGroup } from "@/avatar/contract";

export interface SetLog {
  date: string; // ISO (jour)
  exerciseId: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  weightKg: number;
  reps: number;
  rpe: number;
}

export type MuscleLevels = Record<MuscleGroup, number>;
export type WeeklyVolume = Record<MuscleGroup, number>;

export const MAX_GAIN_PER_WEEK = 2;
export const ATROPHY_PER_WEEK = 1;
export const ATROPHY_THRESHOLD_SETS = 4;
export const ATROPHY_WEEKS = 2;

export const emptyVolume = (): WeeklyVolume => Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as WeeklyVolume;

export function isEffectiveSet(s: Pick<SetLog, "reps" | "rpe">): boolean {
  return s.reps >= 5 && s.reps <= 30 && s.rpe >= 7;
}

/** Volume d'une liste de séries (en séries effectives) par groupe. */
export function volumeOf(sets: SetLog[]): WeeklyVolume {
  const v = emptyVolume();
  for (const s of sets) {
    if (!isEffectiveSet(s)) continue;
    for (const g of s.primary) v[g] += 1;
    for (const g of s.secondary) v[g] += 0.5;
  }
  return v;
}

/**
 * Niveau "plafond" atteignable avec un volume hebdo moyen donné.
 * ~10 séries/sem → ~60, 20 séries/sem → ~80 (rendements décroissants).
 */
export function potentialLevel(avgWeeklySets: number): number {
  return 20 + 75 * (1 - Math.exp(-avgWeeklySets / 11));
}

/**
 * Fait avancer le niveau d'un groupe d'une semaine.
 * @param level niveau actuel (0-100)
 * @param last4 volumes des 4 dernières semaines (la plus récente en dernier)
 */
export function stepLevel(level: number, last4: number[]): number {
  const recent = last4.slice(-4);
  const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
  const lastWeeks = recent.slice(-ATROPHY_WEEKS);
  const neglected = lastWeeks.length >= ATROPHY_WEEKS && lastWeeks.every((x) => x < ATROPHY_THRESHOLD_SETS);
  if (neglected) return Math.max(0, level - ATROPHY_PER_WEEK);
  const target = potentialLevel(avg);
  if (target <= level) return level; // les acquis restent (pas de baisse sans négligence)
  return Math.min(100, level + Math.min(MAX_GAIN_PER_WEEK, target - level));
}

/** Rejoue un historique hebdomadaire → niveaux semaine par semaine (index 0 = départ). */
export function simulateLevels(start: MuscleLevels, weeks: WeeklyVolume[]): MuscleLevels[] {
  const out: MuscleLevels[] = [{ ...start }];
  for (let w = 0; w < weeks.length; w++) {
    const prev = out[out.length - 1];
    const next = { ...prev };
    for (const g of MUSCLE_GROUPS) {
      const hist = weeks.slice(Math.max(0, w - 3), w + 1).map((wk) => wk[g]);
      next[g] = stepLevel(prev[g], hist);
    }
    out.push(next);
  }
  return out;
}

export const epley1RM = (weightKg: number, reps: number) => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30));

/**
 * Contrôle de plausibilité : un saut énorme de 1RM estimé demande confirmation
 * (+60 kg absolu ou +35 % d'une séance à l'autre).
 */
export function needsConfirmation(previous1RM: number | null, next1RM: number): boolean {
  if (previous1RM === null || previous1RM <= 0) return next1RM > 300;
  return next1RM - previous1RM >= 60 || next1RM / previous1RM > 1.35;
}

/**
 * Définition (0-100) à partir de la tendance réelle : moyenne mobile 7 j du
 * % de masse grasse si disponible, sinon de l'IMC.
 */
export function definitionFrom(opts: { bodyFat7d?: number | null; bmi7d?: number | null; sex: "m" | "f" }): number {
  const { bodyFat7d, bmi7d, sex } = opts;
  if (bodyFat7d != null) {
    // Homme : 28 % → 10, 10 % → 92 ; Femme : décalé de +8 points de MG.
    const bf = sex === "m" ? bodyFat7d : bodyFat7d - 8;
    return clamp(((28 - bf) / 18) * 82 + 10, 0, 100);
  }
  if (bmi7d != null) return clamp(((30 - bmi7d) / 10) * 60 + 20, 0, 85);
  return 50;
}

/** Moyenne mobile sur les `n` dernières valeurs non nulles. */
export function movingAverage(values: (number | null | undefined)[], n = 7): number | null {
  const xs = values.filter((x): x is number => typeof x === "number").slice(-n);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Énergie (0-100) : sommeil, vitalité nutrition, régularité. */
export function energyFrom(opts: { sleepHours7d: number; vitality7d: number; discipline: number }): number {
  const sleep = clamp((opts.sleepHours7d - 5) / 3, 0, 1); // 5 h → 0, 8 h → 1
  return Math.round(clamp(sleep * 45 + opts.vitality7d * 0.35 + opts.discipline * 0.2, 0, 100));
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
