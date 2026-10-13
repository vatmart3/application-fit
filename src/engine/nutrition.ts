/**
 * Besoins énergétiques et objectifs nutritionnels.
 * Mifflin-St Jeor × niveau d'activité, ajusté selon le but, avec garde-fous :
 * déficit plafonné à 25 %, plancher calorique, protéines en g/kg.
 */

export type Sex = "m" | "f";
export type Goal = "seche" | "maintien" | "masse";
export type Activity = "sedentaire" | "leger" | "actif" | "tres_actif";

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentaire: 1.2,
  leger: 1.375,
  actif: 1.55,
  tres_actif: 1.725,
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentaire: "Bureau, peu de marche",
  leger: "Un peu actif (≈ 7 000 pas)",
  actif: "Actif (≈ 10 000 pas, métier debout)",
  tres_actif: "Très actif (métier physique)",
};

export const GOAL_LABELS: Record<Goal, string> = {
  seche: "Sèche",
  maintien: "Recomposition",
  masse: "Prise de masse",
};

/** Ajustement calorique par but (fraction de la dépense). */
const GOAL_DELTA: Record<Goal, number> = { seche: -0.2, maintien: 0, masse: 0.1 };
const PROTEIN_PER_KG: Record<Goal, number> = { seche: 2.2, maintien: 1.8, masse: 1.8 };

/** Plafond de déficit (garde-fou santé). */
export const MAX_DEFICIT = 0.25;

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "m" ? 5 : -161);
}

/** Métabolisme de base à partir de la masse maigre (Katch-McArdle), plus juste quand le % MG est connu. */
export const bmrKatch = (leanKg: number) => 370 + 21.6 * leanKg;

export function calorieFloor(sex: Sex, bmr: number): number {
  return Math.round(Math.max(bmr, sex === "m" ? 1500 : 1200));
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  /** Plancher sous lequel aucun bonus n'est donné (message bienveillant). */
  floor: number;
}

export function nutritionTargets(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: Activity;
  goal: Goal;
}): Targets {
  const bmr = bmrMifflin(p.sex, p.weightKg, p.heightCm, p.age);
  const tdee = bmr * ACTIVITY_FACTOR[p.activity];
  const delta = Math.max(-MAX_DEFICIT, GOAL_DELTA[p.goal]);
  const floor = calorieFloor(p.sex, bmr);
  const kcal = Math.max(floor, tdee * (1 + delta));
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal / 10) * 10,
    proteinG: Math.round(p.weightKg * PROTEIN_PER_KG[p.goal]),
    floor,
  };
}

/**
 * % de masse grasse estimé à partir de l'IMC (Deurenberg 1991), utilisé
 * quand on n'a ni mesure ni photo.
 */
export function bodyFatFromBmi(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const bmi = weightKg / (heightCm / 100) ** 2;
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * (sex === "m" ? 1 : 0) - 5.4;
  return Math.min(50, Math.max(sex === "m" ? 6 : 12, bf));
}
