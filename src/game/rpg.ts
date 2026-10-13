/** Fiche de personnage (stats RPG) dérivée du corps réel + classe. */
import type { MuscleGroup } from "@/avatar/contract";
import type { PlayerClass } from "@/avatar/params";
import type { Activity } from "@/engine/nutrition";

export const STATS = ["force", "endurance", "explosivite", "vitalite", "discipline"] as const;
export type Stat = (typeof STATS)[number];
export const STAT_LABELS: Record<Stat, string> = {
  force: "Force",
  endurance: "Endurance",
  explosivite: "Explosivité",
  vitalite: "Vitalité",
  discipline: "Discipline",
};

const CLASS_BONUS: Record<PlayerClass, Partial<Record<Stat, number>>> = {
  titan: { force: 12, explosivite: 4 },
  coureur: { endurance: 14, vitalite: 2 },
  combattant: { explosivite: 10, endurance: 6 },
  hybride: { force: 5, endurance: 5, explosivite: 5 },
};

const avg = (m: Record<MuscleGroup, number>, gs: MuscleGroup[]) => gs.reduce((s, g) => s + m[g], 0) / gs.length;
const clamp = (x: number) => Math.round(Math.min(99, Math.max(1, x)));

export function statSheet(o: {
  muscles: Record<MuscleGroup, number>;
  bodyFat: number;
  sex: "m" | "f";
  activity: Activity;
  sleepHours: number;
  playerClass: PlayerClass;
}): Record<Stat, number> {
  const act = { sedentaire: 18, leger: 28, actif: 40, tres_actif: 50 }[o.activity];
  const bfIdeal = o.sex === "m" ? 13 : 22;
  const bonus = CLASS_BONUS[o.playerClass];
  return {
    force: clamp(avg(o.muscles, ["pecs", "back", "quads", "glutes", "hamstrings"]) + (bonus.force ?? 0)),
    endurance: clamp(act + (bonus.endurance ?? 0)),
    explosivite: clamp(avg(o.muscles, ["quads", "calves", "shoulders"]) * 0.8 + (bonus.explosivite ?? 0)),
    vitalite: clamp(70 - Math.abs(o.bodyFat - bfIdeal) * 2 - Math.max(0, 7 - o.sleepHours) * 8 + (bonus.vitalite ?? 0)),
    discipline: clamp(20),
  };
}

/** Classe conseillée selon le but et le profil. */
export function suggestedClass(goal: "seche" | "maintien" | "masse", activity: Activity): PlayerClass {
  if (goal === "masse") return "titan";
  if (activity === "tres_actif" || activity === "actif") return goal === "seche" ? "coureur" : "hybride";
  return "hybride";
}
