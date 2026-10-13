/**
 * Bibliothèque d'exercices de base (sera la table `exercises` en BDD).
 * Groupes principaux / secondaires utilisés par le calcul de volume.
 */
import type { MuscleGroup } from "@/avatar/contract";

export type Activity = "muscu" | "boxe" | "cardio" | "hyrox" | "mobilite";

export interface Exercise {
  id: string;
  name: string;
  activity: Activity;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

export const EXERCISES: Exercise[] = [
  { id: "bench", name: "Développé couché", activity: "muscu", primary: ["pecs"], secondary: ["triceps", "shoulders"] },
  { id: "incline_db", name: "Développé incliné haltères", activity: "muscu", primary: ["pecs"], secondary: ["shoulders", "triceps"] },
  { id: "ohp", name: "Développé militaire", activity: "muscu", primary: ["shoulders"], secondary: ["triceps"] },
  { id: "dips", name: "Dips", activity: "muscu", primary: ["triceps", "pecs"], secondary: ["shoulders"] },
  { id: "pushdown", name: "Extension triceps poulie", activity: "muscu", primary: ["triceps"], secondary: [] },
  { id: "lateral", name: "Élévations latérales", activity: "muscu", primary: ["shoulders"], secondary: [] },
  { id: "pullup", name: "Tractions", activity: "muscu", primary: ["back"], secondary: ["biceps", "forearms"] },
  { id: "row", name: "Rowing barre", activity: "muscu", primary: ["back"], secondary: ["biceps", "forearms"] },
  { id: "pulldown", name: "Tirage vertical", activity: "muscu", primary: ["back"], secondary: ["biceps"] },
  { id: "curl", name: "Curl barre", activity: "muscu", primary: ["biceps"], secondary: ["forearms"] },
  { id: "hammer", name: "Curl marteau", activity: "muscu", primary: ["biceps", "forearms"], secondary: [] },
  { id: "facepull", name: "Face pull", activity: "muscu", primary: ["shoulders"], secondary: ["back"] },
  { id: "squat", name: "Squat", activity: "muscu", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs"] },
  { id: "rdl", name: "Soulevé de terre roumain", activity: "muscu", primary: ["hamstrings", "glutes"], secondary: ["back", "forearms"] },
  { id: "deadlift", name: "Soulevé de terre", activity: "muscu", primary: ["back", "hamstrings", "glutes"], secondary: ["quads", "forearms"] },
  { id: "legpress", name: "Presse à cuisses", activity: "muscu", primary: ["quads"], secondary: ["glutes"] },
  { id: "legcurl", name: "Leg curl", activity: "muscu", primary: ["hamstrings"], secondary: [] },
  { id: "calf", name: "Mollets debout", activity: "muscu", primary: ["calves"], secondary: [] },
  { id: "hipthrust", name: "Hip thrust", activity: "muscu", primary: ["glutes"], secondary: ["hamstrings"] },
  { id: "plank", name: "Gainage lesté", activity: "muscu", primary: ["abs"], secondary: [] },
  { id: "hanging_raise", name: "Relevés de jambes suspendu", activity: "muscu", primary: ["abs"], secondary: ["forearms"] },
  { id: "boxing", name: "Sac de frappe (rounds)", activity: "boxe", primary: [], secondary: ["shoulders"] },
  { id: "run", name: "Course", activity: "cardio", primary: [], secondary: ["calves"] },
  { id: "wallball", name: "Wall balls", activity: "hyrox", primary: ["quads"], secondary: ["shoulders"] },
];

export const exerciseById = (id: string) => {
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`Exercice inconnu : ${id}`);
  return e;
};
