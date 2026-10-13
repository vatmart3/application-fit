import { describe, expect, it } from "vitest";
import { compositionInfluences, computeMorphFrame, DEFAULT_APPEARANCE, DEFAULT_STATE, muscleInfluence, uniformMuscles } from "./params";

describe("niveaux → morphs", () => {
  it("25 = neutre, 60 = max, 100 = exagération héroïque", () => {
    expect(muscleInfluence(25)).toBe(0);
    expect(muscleInfluence(60)).toBe(1);
    expect(muscleInfluence(100)).toBeCloseTo(1.5);
    expect(muscleInfluence(0)).toBeCloseTo(-0.3);
  });
  it("est monotone", () => {
    for (let l = 0; l < 100; l++) expect(muscleInfluence(l + 1)).toBeGreaterThan(muscleInfluence(l));
  });
  it("définition 50 = neutre", () => {
    expect(compositionInfluences(50)).toEqual({ lean: 0, fat: 0 });
    expect(compositionInfluences(100).lean).toBe(1);
  });
  it("les abdos dessinés exigent muscle ET sécheresse", () => {
    const sec = computeMorphFrame({ ...DEFAULT_STATE, muscles: uniformMuscles(25), definition: 100 }, DEFAULT_APPEARANCE);
    const fort = computeMorphFrame({ ...DEFAULT_STATE, muscles: uniformMuscles(80), definition: 100 }, DEFAULT_APPEARANCE);
    expect(sec.weights.cut).toBe(0);
    expect(fort.weights.cut).toBeGreaterThan(0.9);
  });
  it("la fatigue n'apparaît qu'avec une énergie basse", () => {
    expect(computeMorphFrame({ ...DEFAULT_STATE, energy: 80 }, DEFAULT_APPEARANCE).tiredness).toBe(0);
    expect(computeMorphFrame({ ...DEFAULT_STATE, energy: 10 }, DEFAULT_APPEARANCE).tiredness).toBe(1);
  });
});
