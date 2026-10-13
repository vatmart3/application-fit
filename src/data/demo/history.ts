/**
 * Données de démo : "Sam", 8 semaines d'historique réaliste (déterministe).
 * Push / Pull / Jambes / Haut + boxe le samedi, une séance manquée en S6,
 * légère sèche (80 → ~77,5 kg). Sert à voir l'avatar évoluer immédiatement.
 * Le même générateur alimentera le seed SQL (étape 2).
 */
import { MUSCLE_GROUPS, type MuscleGroup } from "@/avatar/contract";
import { exerciseById } from "@/data/exercises";
import {
  type MuscleLevels,
  type SetLog,
  type WeeklyVolume,
  definitionFrom,
  emptyVolume,
  energyFrom,
  epley1RM,
  movingAverage,
  simulateLevels,
  volumeOf,
} from "@/engine/evolution";

/** PRNG déterministe (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan = [exerciseId: string, sets: number, reps: number, startKg: number, incKgPerWeek: number][];
const SESSIONS: { day: number; name: string; plan: Plan }[] = [
  { day: 0, name: "Push", plan: [["bench", 4, 8, 72.5, 1.25], ["ohp", 3, 8, 42.5, 0.6], ["incline_db", 3, 10, 26, 0.5], ["lateral", 4, 14, 10, 0.25], ["pushdown", 3, 12, 30, 0.6]] },
  { day: 1, name: "Pull", plan: [["pullup", 4, 8, 0, 0], ["row", 4, 8, 65, 1.25], ["curl", 3, 10, 32.5, 0.6], ["facepull", 3, 15, 20, 0.3], ["hammer", 2, 12, 14, 0.25]] },
  { day: 3, name: "Jambes", plan: [["squat", 4, 6, 95, 2.5], ["rdl", 3, 8, 85, 2], ["legpress", 3, 12, 160, 4], ["legcurl", 3, 12, 40, 1], ["calf", 4, 14, 60, 1.25], ["hanging_raise", 3, 12, 0, 0]] },
  { day: 4, name: "Haut", plan: [["bench", 3, 10, 65, 1.25], ["pulldown", 3, 10, 60, 1], ["dips", 3, 10, 0, 0], ["hipthrust", 3, 10, 90, 2.5], ["plank", 3, 10, 10, 0]] },
];

export interface DemoDay {
  date: string;
  sleepHours: number;
  sleepQuality: number;
  steps: number;
  weightKg: number;
  bodyFat: number | null;
  vitality: number; // score nutrition/hydratation 0-100
}

export interface DemoWeek {
  week: number; // 0 = départ
  levels: MuscleLevels;
  volume: WeeklyVolume;
  definition: number;
  energy: number;
  weightKg: number;
  sessionsDone: number;
  sessionsPlanned: number;
  bench1RM: number;
}

export interface DemoHistory {
  user: { name: string; sex: "m"; heightCm: number; age: number };
  start: string;
  sets: SetLog[];
  days: DemoDay[];
  weeks: DemoWeek[];
}

const START_LEVELS: MuscleLevels = {
  pecs: 30, back: 28, shoulders: 27, biceps: 26, triceps: 27, forearms: 30,
  abs: 24, quads: 33, hamstrings: 28, calves: 30, glutes: 30,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildDemoHistory(today = new Date("2026-10-12T08:00:00Z")): DemoHistory {
  const r = rng(42);
  const WEEKS = 8;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - WEEKS * 7);
  // Aligne sur un lundi.
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

  const sets: SetLog[] = [];
  const days: DemoDay[] = [];
  const weekly: WeeklyVolume[] = [];
  const done: number[] = [];
  const bench: number[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const weekSets: SetLog[] = [];
    let count = 0;
    let best = 0;
    for (const s of SESSIONS) {
      if (w === 5 && s.name === "Haut") continue; // semaine chargée : séance sautée
      count++;
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + w * 7 + s.day);
      for (const [id, n, reps, kg, inc] of s.plan) {
        const ex = exerciseById(id);
        for (let k = 0; k < n; k++) {
          const rpe = Math.min(10, Math.round(7 + k * 0.6 + r() * 1.2));
          const rr = Math.max(3, reps - (k === n - 1 && r() > 0.6 ? 1 : 0));
          const weightKg = Math.round((kg + inc * w) * 4) / 4;
          const log: SetLog = { date: iso(d), exerciseId: id, primary: ex.primary, secondary: ex.secondary, weightKg, reps: rr, rpe };
          weekSets.push(log);
          if (id === "bench") best = Math.max(best, epley1RM(weightKg, rr));
        }
        // Une série d'échauffement (RPE 5) : ne compte pas dans le volume.
        weekSets.push({ date: iso(d), exerciseId: id, primary: ex.primary, secondary: ex.secondary, weightKg: kg * 0.5, reps: 10, rpe: 5 });
      }
    }
    sets.push(...weekSets);
    weekly.push(volumeOf(weekSets));
    done.push(count + 1); // + boxe du samedi
    bench.push(Math.round(best * 10) / 10);
    for (let dd = 0; dd < 7; dd++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + w * 7 + dd);
      const progress = (w * 7 + dd) / (WEEKS * 7);
      const tough = w === 5; // semaine chargée : moins de sommeil
      days.push({
        date: iso(d),
        sleepHours: Math.round(((tough ? 6.1 : 7.2) + r() * 1.1 - (dd === 4 ? 0.6 : 0)) * 10) / 10,
        sleepQuality: tough ? 3 : 3 + Math.round(r() * 2),
        steps: Math.round(6500 + r() * 6000),
        weightKg: Math.round((80 - 2.5 * progress + (r() - 0.5) * 0.8) * 10) / 10,
        bodyFat: dd % 7 === 0 ? Math.round((19 - 3 * progress + (r() - 0.5) * 0.6) * 10) / 10 : null,
        vitality: Math.round((tough ? 55 : 72) + r() * 22),
      });
    }
  }

  const levels = simulateLevels(START_LEVELS, weekly);
  const weeks: DemoWeek[] = levels.map((lv, w) => {
    const upTo = days.slice(0, w * 7 || 1);
    const last7 = upTo.slice(-7);
    const bf = movingAverage(upTo.map((d) => d.bodyFat), 2);
    const sleep = movingAverage(last7.map((d) => d.sleepHours)) ?? 7;
    const vit = movingAverage(last7.map((d) => d.vitality)) ?? 70;
    const planned = 5;
    const sessionsDone = w === 0 ? 0 : done[w - 1];
    return {
      week: w,
      levels: lv,
      volume: w === 0 ? emptyVolume() : weekly[w - 1],
      definition: Math.round(definitionFrom({ bodyFat7d: bf ?? 19, sex: "m" })),
      energy: energyFrom({ sleepHours7d: sleep, vitality7d: vit, discipline: w === 0 ? 70 : (sessionsDone / planned) * 100 }),
      weightKg: movingAverage(last7.map((d) => d.weightKg)) ?? 80,
      sessionsDone,
      sessionsPlanned: planned,
      bench1RM: w === 0 ? 0 : bench[w - 1],
    };
  });

  return { user: { name: "Sam", sex: "m", heightCm: 178, age: 29 }, start: iso(start), sets, days, weeks };
}

/** Gains par groupe entre deux semaines (pour l'écran "ce qui a progressé"). */
export function gainsBetween(a: MuscleLevels, b: MuscleLevels): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const g of MUSCLE_GROUPS) if (b[g] - a[g] > 0.01) out[g] = Math.round((b[g] - a[g]) * 10) / 10;
  return out;
}
