/** Données de sauvegarde du joueur (une seule personne : toi). */
import type { MuscleGroup } from "@/avatar/contract";
import type { Appearance, PlayerClass } from "@/avatar/params";
import type { Activity, Goal, Sex } from "@/engine/nutrition";
import type { TrainingLevel } from "@/engine/physiology";

export interface Profile {
  heroName: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** % de masse grasse mesuré (balance, InBody) si connu. */
  measuredBodyFat: number | null;
  training: TrainingLevel;
  goal: Goal;
  activity: Activity;
}

export interface BodyScan {
  date: string;
  source: "photo" | "questionnaire";
  bodyFat: number;
  muscles: Record<MuscleGroup, number>;
  confidence: number;
  summary: string;
  strengths: string[];
  focus: string[];
  /** Ids des photos privées (capability assets), si conservées. */
  photoIds: string[];
}

export interface Pact {
  sessionsPerWeek: number;
  sleepHours: number;
}

export interface SaveData {
  version: 1;
  createdAt: string;
  profile: Profile;
  baseline: BodyScan;
  appearance: Appearance;
  playerClass: PlayerClass;
  pact: Pact;
  xp: { level: number; progress: number };
  settings: { hideWeight: boolean };
}
