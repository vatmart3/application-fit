/**
 * Modèle physiologique (fonctions pures) : fait évoluer masse maigre, masse
 * grasse et niveaux musculaires à partir des habitudes réelles.
 *
 * Ordres de grandeur retenus (littérature d'entraînement) :
 *  - prise de masse maigre max ≈ 0,9 kg/mois la 1re année (homme débutant),
 *    0,45 (intermédiaire), 0,2 (avancé) ; ≈ ×0,55 pour une femme ;
 *  - rendements décroissants quand on approche de son potentiel ;
 *  - ~10 séries effectives / semaine / groupe = stimulus plein ;
 *  - protéines < 1,6 g/kg, sommeil court, gros déficit → gains réduits ;
 *  - 1 kg de graisse ≈ 7 700 kcal, 1 kg de tissu maigre ≈ 1 800 kcal ;
 *  - sans entraînement, la masse maigre décroît doucement.
 * Un niveau musculaire (0-100) correspond à ≈ 0,26 kg de masse maigre
 * répartie (0,17 kg pour une femme) : 25 = adulte moyen, 60 = très musclé.
 */
import { MUSCLE_GROUPS, type MuscleGroup } from "@/avatar/contract";
import { definitionFrom } from "./evolution";
import type { Sex } from "./nutrition";

export type TrainingLevel = "debutant" | "intermediaire" | "avance";

export const TRAINING_LABELS: Record<TrainingLevel, string> = {
  debutant: "Débutant (< 1 an)",
  intermediaire: "Intermédiaire (1-3 ans)",
  avance: "Avancé (3 ans +)",
};

export interface BodyState {
  sex: Sex;
  weightKg: number;
  fatKg: number;
  leanKg: number;
  muscles: Record<MuscleGroup, number>;
}

export interface Habits {
  sessionsPerWeek: number;
  /** Séries effectives par séance (toutes zones). */
  setsPerSession: number;
  /** Balance énergétique moyenne (kcal/jour, négatif = déficit). Ignorée si `intake` est fourni. */
  kcalBalance: number;
  /**
   * Apport fixe (kcal/jour) + dépense recalculée chaque semaine selon le
   * poids : le déficit se réduit naturellement quand on maigrit.
   */
  intake?: { kcal: number; tdee: (s: BodyState) => number };
  /** % MG où l'on repasse à l'équilibre (fin de sèche / de prise de masse). */
  stopAtBodyFat?: { below?: number; above?: number };
  proteinGPerKg: number;
  sleepHours: number;
  /** Répartition du volume entre groupes (défaut : uniforme). */
  split?: Partial<Record<MuscleGroup, number>>;
}

const BASE_GAIN_PER_MONTH: Record<TrainingLevel, number> = { debutant: 0.9, intermediaire: 0.45, avance: 0.2 };
export const KG_PER_LEVEL: Record<Sex, number> = { m: 0.26, f: 0.17 };
const KCAL_PER_KG_FAT = 7700;
const KCAL_PER_KG_LEAN = 1800;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const meanLevel = (m: Record<MuscleGroup, number>) => MUSCLE_GROUPS.reduce((s, g) => s + m[g], 0) / MUSCLE_GROUPS.length;

export function bodyFatPct(s: BodyState) {
  return (s.fatKg / s.weightKg) * 100;
}

export function definitionOf(s: BodyState) {
  return definitionFrom({ bodyFat7d: bodyFatPct(s), sex: s.sex });
}

/** Facteur lié à la balance énergétique (kcal/jour). */
export function energyFactor(balance: number): number {
  if (balance >= 300) return 1.15;
  if (balance >= 0) return 0.85 + (balance / 300) * 0.3;
  if (balance >= -600) return 0.85 + (balance / 600) * 0.45; // -600 → 0,4
  return clamp(0.4 + ((balance + 600) / 400) * 0.25, 0.15, 0.4); // ≤ -1000 → 0,15
}
export const proteinFactor = (gPerKg: number) => clamp(gPerKg / 1.6, 0.5, 1);
export const sleepFactor = (h: number) => (h >= 7 ? 1 : h >= 6 ? 0.85 + (h - 6) * 0.15 : clamp(0.7 + (h - 5) * 0.15, 0.55, 0.85));

/**
 * Balance réelle de la semaine : apport − dépense du moment, avec une
 * adaptation métabolique en déficit (≈ 10 % du déficit), et retour à
 * l'équilibre une fois l'objectif de % MG atteint.
 */
export function weeklyBalance(s: BodyState, h: Habits): number {
  if (!h.intake) return h.kcalBalance;
  const bf = bodyFatPct(s);
  if ((h.stopAtBodyFat?.below !== undefined && bf <= h.stopAtBodyFat.below) || (h.stopAtBodyFat?.above !== undefined && bf >= h.stopAtBodyFat.above)) return 0;
  const tdee = h.intake.tdee(s);
  const raw = h.intake.kcal - tdee;
  return raw < 0 ? raw * 0.9 : raw;
}

/** Avance d'une semaine. */
export function stepWeek(s: BodyState, input: Habits, level: TrainingLevel): BodyState {
  const h = { ...input, kcalBalance: weeklyBalance(s, input) };
  const shares = MUSCLE_GROUPS.map((g) => h.split?.[g] ?? 1);
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const totalSets = h.sessionsPerWeek * h.setsPerSession * 1.3; // + volume secondaire
  const potential = clamp((100 - meanLevel(s.muscles)) / 70, 0.1, 1.1);
  const base = (BASE_GAIN_PER_MONTH[level] * (s.sex === "m" ? 1 : 0.55)) / 4.33;
  const nutrition = energyFactor(h.kcalBalance) * proteinFactor(h.proteinGPerKg) * sleepFactor(h.sleepHours);

  const muscles = { ...s.muscles };
  let leanDelta = 0;
  MUSCLE_GROUPS.forEach((g, i) => {
    const share = shares[i] / shareSum;
    const groupSets = totalSets * share;
    const stimulus = Math.min(1.15, groupSets / 10);
    let dLean: number;
    if (groupSets < 4) {
      // Désentraînement doux : ~0,3 %/sem de la masse du groupe, plus fort en gros déficit.
      dLean = -(s.leanKg / MUSCLE_GROUPS.length) * 0.003 * (h.kcalBalance < -500 ? 1.6 : 1);
    } else {
      dLean = base * share * stimulus * nutrition * potential;
      // Gros déficit malgré l'entraînement : un peu de muscle part aussi.
      if (h.kcalBalance < -750) dLean -= (s.leanKg / MUSCLE_GROUPS.length) * 0.0015;
    }
    leanDelta += dLean;
    // Δniveau = Δmasse du groupe / (kg par niveau × part du groupe)
    muscles[g] = clamp(muscles[g] + dLean / (KG_PER_LEVEL[s.sex] / MUSCLE_GROUPS.length), 0, 100);
  });

  const fatDelta = (h.kcalBalance * 7 - leanDelta * KCAL_PER_KG_LEAN) / KCAL_PER_KG_FAT;
  const fatKg = Math.max(s.weightKg * (s.sex === "m" ? 0.04 : 0.1), s.fatKg + fatDelta);
  const leanKg = s.leanKg + leanDelta;
  return { ...s, fatKg, leanKg, weightKg: fatKg + leanKg, muscles };
}

export interface ProjectionPoint {
  week: number;
  weightKg: number;
  bodyFat: number;
  leanKg: number;
  definition: number;
  muscles: Record<MuscleGroup, number>;
}

export function project(s: BodyState, h: Habits, level: TrainingLevel, weeks: number): ProjectionPoint[] {
  const out: ProjectionPoint[] = [];
  let cur = s;
  for (let w = 0; w <= weeks; w++) {
    out.push({
      week: w,
      weightKg: cur.weightKg,
      bodyFat: bodyFatPct(cur),
      leanKg: cur.leanKg,
      definition: definitionOf(cur),
      muscles: { ...cur.muscles },
    });
    if (w < weeks) cur = stepWeek(cur, h, level);
  }
  return out;
}

/** Point de départ à partir du poids et du % MG. */
export function initialState(sex: Sex, weightKg: number, bodyFatPercent: number, muscles: Record<MuscleGroup, number>): BodyState {
  const fatKg = (weightKg * bodyFatPercent) / 100;
  return { sex, weightKg, fatKg, leanKg: weightKg - fatKg, muscles: { ...muscles } };
}

/** Niveaux musculaires plausibles sans photo (questionnaire seul). */
export function estimateLevels(level: TrainingLevel, sex: Sex, bmi: number): Record<MuscleGroup, number> {
  const base = { debutant: 24, intermediaire: 36, avance: 50 }[level] + clamp((bmi - 22) * 0.8, -4, 6) - (sex === "f" ? 2 : 0);
  // Les jambes sont souvent un peu plus développées chez les non-entraînés (marche).
  const legBonus: Partial<Record<MuscleGroup, number>> = { quads: 3, calves: 3, glutes: 2 };
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, clamp(Math.round(base + (legBonus[g] ?? 0)), 5, 95)])) as Record<MuscleGroup, number>;
}
