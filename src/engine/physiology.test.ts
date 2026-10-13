import { describe, expect, it } from "vitest";
import { bodyFatFromBmi, bmrMifflin, nutritionTargets } from "./nutrition";
import { bodyFatPct, energyFactor, estimateLevels, initialState, meanLevel, project } from "./physiology";
import { uniformMuscles } from "@/avatar/params";

const sam = () => initialState("m", 80, 19, uniformMuscles(30));
const pacte = { sessionsPerWeek: 4, setsPerSession: 18, kcalBalance: 250, proteinGPerKg: 1.8, sleepHours: 7.5 };

describe("nutrition", () => {
  it("Mifflin-St Jeor", () => {
    expect(bmrMifflin("m", 80, 178, 29)).toBeCloseTo(1772.5, 1);
  });
  it("le déficit de sèche reste ≤ 25 % et au-dessus du plancher", () => {
    const t = nutritionTargets({ sex: "f", weightKg: 52, heightCm: 160, age: 30, activity: "sedentaire", goal: "seche" });
    expect(t.kcal).toBeGreaterThanOrEqual(t.floor);
    expect(t.kcal).toBeGreaterThanOrEqual(t.tdee * 0.75 - 10);
  });
  it("% MG estimé plausible", () => {
    const bf = bodyFatFromBmi("m", 80, 178, 29);
    expect(bf).toBeGreaterThan(15);
    expect(bf).toBeLessThan(25);
  });
});

describe("modèle physiologique", () => {
  it("un débutant bien nourri gagne ≈ 4-6 kg de maigre en 6 mois", () => {
    const p = project(sam(), pacte, "debutant", 26);
    const gain = p[26].leanKg - p[0].leanKg;
    expect(gain).toBeGreaterThan(3.5);
    expect(gain).toBeLessThan(6.5);
    expect(meanLevel(p[26].muscles) - meanLevel(p[0].muscles)).toBeGreaterThan(12);
  });
  it("un avancé progresse bien moins vite", () => {
    const deb = project(sam(), pacte, "debutant", 26)[26].leanKg;
    const av = project(sam(), pacte, "avance", 26)[26].leanKg;
    expect(av).toBeLessThan(deb - 2);
  });
  it("en sèche : le gras baisse, le muscle est préservé", () => {
    const p = project(sam(), { ...pacte, kcalBalance: -500, proteinGPerKg: 2.2 }, "intermediaire", 12);
    expect(bodyFatPct(sam()) - p[12].bodyFat).toBeGreaterThan(3);
    expect(p[12].leanKg).toBeGreaterThan(p[0].leanKg - 0.5);
  });
  it("sans entraînement, on perd doucement du muscle", () => {
    const p = project(sam(), { ...pacte, sessionsPerWeek: 0 }, "intermediaire", 8);
    expect(p[8].leanKg).toBeLessThan(p[0].leanKg);
    expect(p[8].leanKg).toBeGreaterThan(p[0].leanKg - 2);
  });
  it("la balance énergétique module les gains", () => {
    expect(energyFactor(400)).toBeGreaterThan(energyFactor(0));
    expect(energyFactor(0)).toBeGreaterThan(energyFactor(-500));
    expect(energyFactor(-1200)).toBeGreaterThan(0);
  });
  it("estimation sans photo selon le niveau", () => {
    expect(meanLevel(estimateLevels("avance", "m", 24))).toBeGreaterThan(meanLevel(estimateLevels("debutant", "m", 24)));
  });
});

describe("projection réaliste", () => {
  it("la sèche ralentit en perdant du poids et s'arrête à un % MG sain", async () => {
    const { pactProjection } = await import("@/game/projection");
    const profile = { heroName: "T", sex: "m" as const, age: 28, heightCm: 178, weightKg: 78, measuredBodyFat: null, training: "intermediaire" as const, goal: "seche" as const, activity: "leger" as const };
    const p = pactProjection(profile, { bodyFat: 19.8, muscles: uniformMuscles(38) }, { sessionsPerWeek: 3, sleepHours: 7.5 });
    const end = p[26];
    expect(end.bodyFat).toBeGreaterThan(10);
    expect(end.weightKg).toBeGreaterThan(69);
    expect(end.weightKg).toBeLessThan(75);
    // Perte plus rapide au début qu'à la fin.
    expect(p[0].weightKg - p[8].weightKg).toBeGreaterThan(p[18].weightKg - p[26].weightKg);
  });
});
