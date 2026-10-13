import { describe, expect, it } from "vitest";
import {
  MAX_GAIN_PER_WEEK,
  definitionFrom,
  epley1RM,
  isEffectiveSet,
  needsConfirmation,
  simulateLevels,
  stepLevel,
  volumeOf,
  type SetLog,
} from "./evolution";
import { buildDemoHistory } from "@/data/demo/history";
import { MUSCLE_GROUPS } from "@/avatar/contract";

const set = (p: Partial<SetLog>): SetLog => ({
  date: "2026-10-01", exerciseId: "bench", primary: ["pecs"], secondary: ["triceps"], weightKg: 80, reps: 8, rpe: 8, ...p,
});

describe("séries effectives", () => {
  it("respecte 5-30 reps et RPE ≥ 7", () => {
    expect(isEffectiveSet({ reps: 8, rpe: 8 })).toBe(true);
    expect(isEffectiveSet({ reps: 4, rpe: 9 })).toBe(false);
    expect(isEffectiveSet({ reps: 31, rpe: 9 })).toBe(false);
    expect(isEffectiveSet({ reps: 10, rpe: 6 })).toBe(false);
  });
  it("compte les secondaires × 0,5", () => {
    const v = volumeOf([set({}), set({}), set({ rpe: 5 })]);
    expect(v.pecs).toBe(2);
    expect(v.triceps).toBe(1);
  });
});

describe("niveaux musculaires", () => {
  it("progresse au plus de +2 / semaine", () => {
    expect(stepLevel(20, [30, 30, 30, 30])).toBe(20 + MAX_GAIN_PER_WEEK);
  });
  it("atrophie douce après 2 semaines sous 4 séries", () => {
    expect(stepLevel(50, [12, 12, 2, 3])).toBe(49);
    expect(stepLevel(50, [12, 12, 12, 3])).toBe(52); // une seule semaine faible : pas d'atrophie
  });
  it("ne baisse jamais sans négligence", () => {
    expect(stepLevel(90, [6, 6, 6, 6])).toBe(90);
  });
  it("ne descend jamais sous 0", () => {
    const start = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0.5])) as Record<(typeof MUSCLE_GROUPS)[number], number>;
    const weeks = Array.from({ length: 4 }, () => Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as never);
    expect(simulateLevels(start, weeks).at(-1)!.pecs).toBe(0);
  });
});

describe("force et plausibilité", () => {
  it("Epley", () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 1);
  });
  it("demande confirmation sur un saut absurde", () => {
    expect(needsConfirmation(100, 165)).toBe(true);
    expect(needsConfirmation(100, 140)).toBe(true);
    expect(needsConfirmation(100, 106)).toBe(false);
  });
});

describe("définition", () => {
  it("plus sec = plus défini", () => {
    expect(definitionFrom({ bodyFat7d: 12, sex: "m" })).toBeGreaterThan(definitionFrom({ bodyFat7d: 22, sex: "m" }));
  });
});

describe("démo 8 semaines", () => {
  const demo = buildDemoHistory();
  it("contient 9 instantanés (départ + 8 semaines)", () => {
    expect(demo.weeks).toHaveLength(9);
    expect(demo.days).toHaveLength(56);
  });
  it("l'avatar progresse visiblement mais de façon crédible", () => {
    const first = demo.weeks[0].levels, last = demo.weeks[8].levels;
    for (const g of MUSCLE_GROUPS) {
      expect(last[g] - first[g]).toBeLessThanOrEqual(8 * MAX_GAIN_PER_WEEK);
      expect(last[g]).toBeGreaterThanOrEqual(first[g] - 2);
    }
    expect(last.pecs - first.pecs).toBeGreaterThan(8);
    expect(demo.weeks[8].definition).toBeGreaterThan(demo.weeks[0].definition);
  });
  it("la semaine chargée (S6) fait baisser l'énergie", () => {
    expect(demo.weeks[6].energy).toBeLessThan(demo.weeks[5].energy);
  });
});
