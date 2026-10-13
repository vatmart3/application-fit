/** Projection du pacte : état du corps semaine par semaine sur 6 mois. */
import { ACTIVITY_FACTOR, bmrMifflin, nutritionTargets } from "@/engine/nutrition";
import { initialState, project, type ProjectionPoint } from "@/engine/physiology";
import type { BodyScan, Pact, Profile } from "./types";

export function pactProjection(profile: Profile, scan: Pick<BodyScan, "bodyFat" | "muscles">, pact: Pact, weeks = 26): ProjectionPoint[] {
  const t = nutritionTargets(profile);
  const start = initialState(profile.sex, profile.weightKg, scan.bodyFat, scan.muscles);
  return project(
    start,
    {
      sessionsPerWeek: pact.sessionsPerWeek,
      setsPerSession: 18,
      kcalBalance: t.kcal - t.tdee,
      // Apport constant ; la dépense suit le poids semaine après semaine.
      intake: {
        kcal: t.kcal,
        tdee: (s) => bmrMifflin(profile.sex, s.weightKg, profile.heightCm, profile.age) * ACTIVITY_FACTOR[profile.activity],
      },
      // On arrête la sèche à un % MG athlétique sain, la prise de masse avant d'accumuler trop de gras.
      stopAtBodyFat: profile.goal === "seche" ? { below: profile.sex === "m" ? 11 : 19 } : profile.goal === "masse" ? { above: profile.sex === "m" ? 20 : 30 } : undefined,
      proteinGPerKg: t.proteinG / profile.weightKg,
      sleepHours: pact.sleepHours,
    },
    profile.training,
    weeks,
  );
}

/** Énergie de départ (0-100) d'après le sommeil visé. */
export const startEnergy = (sleepHours: number) => Math.round(Math.min(95, Math.max(35, 45 + (sleepHours - 6) * 18)));
