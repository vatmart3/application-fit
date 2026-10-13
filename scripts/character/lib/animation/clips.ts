/**
 * Les 10 clips du héros, écrits "à la main" par intentions (cibles IK,
 * flexions) puis échantillonnés à 30 i/s. Placeholder en attendant des
 * animations Mixamo / Quaternius retargetées (voir ASSETS.md).
 */
import { Quaternion, Vector3 } from "three";
import type { ClipName } from "../../../../src/avatar/contract";
import type { ClipData, Track } from "../gltf";
import type { Bone } from "../skeleton";
import { Rig, type ArmSpec, type Ctx, type Deg, type LegSpec, type Pose, type V3 } from "./pose";

const FPS = 30;
const TAU = Math.PI * 2;

// ── Interpolation de poses ─────────────────────────────────────────────────
type Lerpable = number | V3 | Deg | ((ctx: Ctx) => Vector3) | undefined;
const ease = (t: number) => t * t * (3 - 2 * t);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: number[], b: number[], t: number) => a.map((x, i) => lerpN(x, b[i], t)) as V3;
const asFn = (x: V3 | ((ctx: Ctx) => Vector3)) => (typeof x === "function" ? x : () => new Vector3(...x));

function lerpAny(a: Lerpable, b: Lerpable, t: number): Lerpable {
  if (a === undefined && b === undefined) return undefined;
  if (typeof a === "number" || typeof b === "number") return lerpN((a as number) ?? 0, (b as number) ?? 0, t);
  if (typeof a === "function" || typeof b === "function") {
    const fa = asFn((a ?? [0, 0, 0]) as V3),
      fb = asFn((b ?? [0, 0, 0]) as V3);
    return (ctx: Ctx) => fa(ctx).lerp(fb(ctx), t);
  }
  return lerpV((a as V3) ?? [0, 0, 0], (b as V3) ?? [0, 0, 0], t);
}

function lerpLimb<T extends ArmSpec | LegSpec>(a: T, b: T, t: number): T {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[k] = lerpAny((a as never)[k], (b as never)[k], t);
  }
  return out as T;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {
    armL: lerpLimb(a.armL, b.armL, t),
    armR: lerpLimb(a.armR, b.armR, t),
    legL: lerpLimb(a.legL, b.legL, t),
    legR: lerpLimb(a.legR, b.legR, t),
  };
  for (const k of ["spine", "spine1", "spine2", "neck", "head", "eyes", "shoulderL", "shoulderR"] as const) {
    out[k] = lerpAny(a[k], b[k], t) as Deg | undefined;
  }
  out.hips = {
    offset: lerpAny(a.hips?.offset, b.hips?.offset, t) as V3 | undefined,
    rot: lerpAny(a.hips?.rot, b.hips?.rot, t) as Deg | undefined,
  };
  if (a.prop || b.prop) {
    out.prop = {
      pos: lerpAny(a.prop?.pos, b.prop?.pos, t) as V3,
      rot: lerpAny(a.prop?.rot, b.prop?.rot, t) as Deg | undefined,
    };
  }
  return out;
}

/** Poses clés [temps, pose] interpolées avec un easing doux. */
function keyed(t: number, keys: [number, Pose][]): Pose {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i],
      [t1, p1] = keys[i + 1];
    if (t <= t1) return lerpPose(p0, p1, ease((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
/** Valeur clé scalaire. */
function k1(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i],
      [t1, b] = keys[i + 1];
    if (t <= t1) return lerpN(a, b, ease((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}

interface ClipDef {
  name: ClipName;
  duration: number;
  loop: boolean;
  pose: (t: number) => Pose;
}

export function clipDefs(rig: Rig): ClipDef[] {
  const m = rig.m;
  const ankleY = m.ankleL[1];
  const sh = m.shoulderL;
  const add = (a: Vector3, b: V3) => a.add(new Vector3(...b));
  /** Pied posé au sol : x latéral (gauche +), z avant. */
  const foot = (x: number, z: number, yaw: number, pole: V3 = [0.1 * Math.sign(x), 0, 1], lift = 0, pitch = 0, toe = 0): LegSpec => ({
    ik: [x, ankleY + lift, m.ankleL[2] + z],
    pole,
    foot: [pitch, yaw, 0],
    toe,
  });
  const chestRel = (x: number, y: number, z: number) => (ctx: Ctx) => ctx.chest([x, y, z]);
  const neckH = m.neck[1] - m.chest[1];
  const shRel: V3 = [sh[0] - m.chest[0], sh[1] - m.chest[1], sh[2] - m.chest[2]];

  /** Pose de base : debout, héroïque, bras légèrement écartés. */
  const stand = (breath = 0, sway = 0): Pose => ({
    hips: { offset: [0.008 * sway, -0.012 + 0.003 * breath, 0], rot: [0, 2 * sway, 1.2 * sway] },
    spine: [-1 + 0.6 * breath, 0, -0.8 * sway],
    spine1: [-1 + 0.4 * breath, 0, 0],
    spine2: [-3 + 1.4 * breath, 0, 0],
    neck: [2, 0, 0],
    head: [-1 + 0.5 * breath, -2 * sway, 0],
    shoulderL: [0, 0, -2 + 1.5 * breath],
    shoulderR: [0, 0, 2 - 1.5 * breath],
    armL: { ik: [sh[0] + 0.07, sh[1] - m.armLen * 0.92, sh[2] + 0.03], pole: [0.4, -0.2, -1], hand: [0, -20, 0], grip: 0.1 },
    armR: { ik: [-sh[0] - 0.07, sh[1] - m.armLen * 0.92, sh[2] + 0.03], pole: [-0.4, -0.2, -1], hand: [0, 20, 0], grip: 0.1 },
    legL: foot(0.13, 0, 9),
    legR: foot(-0.13, 0, -9),
  });

  const idle: ClipDef = {
    name: "idle",
    duration: 4,
    loop: true,
    pose: (t) => stand(Math.sin((TAU * t) / 4), Math.sin((TAU * t) / 4 + 1)),
  };

  const tired: ClipDef = {
    name: "idle_tired",
    duration: 4.8,
    loop: true,
    pose: (t) => {
      const b = Math.sin((TAU * t) / 4.8);
      const s = Math.sin((TAU * t) / 4.8 + 0.7);
      // Grand soupir vers 3,4 s : les épaules montent puis retombent.
      const sigh = Math.exp(-(((t - 3.4) / 0.45) ** 2));
      return {
        hips: { offset: [0.014 * s, -0.035, -0.01], rot: [0, 3 * s, 2 * s] },
        spine: [7 + b, 0, -1.5 * s],
        spine1: [7, 0, 0],
        spine2: [9 + 1.5 * b - 6 * sigh, 0, 0],
        neck: [10, 0, 0],
        head: [15 - 2 * b - 8 * sigh, 4 * s, 3 * s],
        shoulderL: [0, -9, -6 + 5 * sigh],
        shoulderR: [0, 9, 6 - 5 * sigh],
        armL: { ik: [sh[0] - 0.02, sh[1] - m.armLen * 0.975, sh[2] + 0.1], pole: [0.2, 0, -1], hand: [0, 0, 4], grip: -0.1 },
        armR: { ik: [-sh[0] + 0.02, sh[1] - m.armLen * 0.975, sh[2] + 0.1], pole: [-0.2, 0, -1], hand: [0, 0, -4], grip: -0.1 },
        legL: foot(0.12, 0.02, 12, [0.2, 0, 1]),
        legR: foot(-0.14, -0.02, -14, [-0.2, 0, 1]),
      };
    },
  };

  const flexPose = (tremble: number, squeeze: number): Pose => ({
    hips: { offset: [0, -0.03, 0], rot: [0, 0, 0] },
    spine: [-2, 0, 0],
    spine1: [-3, 0, 0],
    spine2: [-7 - 2 * squeeze, 0, 0],
    neck: [0, 0, 0],
    head: [-3, 0, 0],
    shoulderL: [0, 0, 6 + 2 * squeeze],
    shoulderR: [0, 0, -6 - 2 * squeeze],
    armL: {
      ik: [sh[0] + 0.24 - 0.02 * squeeze, sh[1] + 0.2 + tremble, sh[2] + 0.04],
      pole: [1, -1.2, 0],
      hand: [0, 0, 25],
      grip: 1,
    },
    armR: {
      ik: [-sh[0] - 0.24 + 0.02 * squeeze, sh[1] + 0.2 - tremble, sh[2] + 0.04],
      pole: [-1, -1.2, 0],
      hand: [0, 0, -25],
      grip: 1,
    },
    legL: foot(0.17, 0.01, 12, [0.3, 0, 1]),
    legR: foot(-0.17, 0.01, -12, [-0.3, 0, 1]),
  });
  const flex: ClipDef = {
    name: "flex",
    duration: 2.6,
    loop: false,
    pose: (t) => {
      const tremble = 0.0025 * Math.sin(t * 47) * (t > 0.45 ? 1 : 0);
      const squeeze = Math.exp(-(((t - 1.3) / 0.25) ** 2));
      return lerpPose(stand(), flexPose(tremble, squeeze), ease(Math.min(1, t / 0.42)));
    },
  };

  const vPose = (pump: number, look = 0): Pose => ({
    hips: { offset: [0, 0.0, 0], rot: [-3, 0, 0] },
    spine: [-3, 0, 0],
    spine1: [-4, 0, 0],
    spine2: [-9, 0, 0],
    neck: [-6, 0, 0],
    head: [-14 + look, 0, 0],
    shoulderL: [0, 0, 14],
    shoulderR: [0, 0, -14],
    armL: { ik: [sh[0] + 0.3, sh[1] + 0.48 - 0.05 * pump, sh[2] + 0.06], pole: [1, -0.4, -0.4], grip: 1 },
    armR: { ik: [-sh[0] - 0.3, sh[1] + 0.48 - 0.1 * pump, sh[2] + 0.06], pole: [-1, -0.4, -0.4], grip: 1 },
    legL: foot(0.16, 0.0, 10),
    legR: foot(-0.16, 0.0, -10),
  });
  const crouch = (): Pose => ({
    ...stand(),
    hips: { offset: [0, -0.07, -0.01], rot: [6, 0, 0] },
    spine2: [6, 0, 0],
    head: [8, 0, 0],
    armL: { ik: [sh[0] - 0.02, sh[1] - m.armLen * 0.85, sh[2] - 0.08], pole: [0.3, 0, -1], grip: 1 },
    armR: { ik: [-sh[0] + 0.02, sh[1] - m.armLen * 0.85, sh[2] - 0.08], pole: [-0.3, 0, -1], grip: 1 },
  });
  const victory: ClipDef = {
    name: "victory",
    duration: 3,
    loop: false,
    pose: (t) => {
      const pump = t > 0.6 && t < 1.5 ? Math.max(0, Math.sin((t - 0.6) * TAU * 2.2)) : 0;
      if (t > 0.55 && t < 1.5) return vPose(pump);
      return keyed(t, [
        [0, stand()],
        [0.22, crouch()],
        [0.55, vPose(0)],
        [1.5, vPose(0)],
        [3, vPose(0, 4)],
      ]);
    },
  };

  // ── Squat barre haute ──────────────────────────────────────────────────
  const barBack: V3 = [0, neckH - 0.03, -0.08];
  const squat: ClipDef = {
    name: "squat",
    duration: 2.8,
    loop: true,
    pose: (t) => {
      const d = k1(t, [
        [0, 0],
        [0.25, 0],
        [1.35, 1],
        [1.55, 1],
        [2.4, 0],
        [2.8, 0],
      ]);
      return {
        hips: { offset: [0, -0.41 * d, -0.16 * d], rot: [30 * d, 0, 0] },
        spine: [-6 * d, 0, 0],
        spine1: [-4 * d, 0, 0],
        spine2: [-6 - 2 * d, 0, 0],
        neck: [-6 * d, 0, 0],
        head: [-10 * d, 0, 0],
        shoulderL: [0, 6, 4],
        shoulderR: [0, -6, -4],
        armL: { ik: chestRel(0.4, barBack[1] - 0.005, barBack[2] + 0.035), pole: [0.3, -1, -0.6], hand: [0, 0, 30], grip: 0.6 },
        armR: { ik: chestRel(-0.4, barBack[1] - 0.005, barBack[2] + 0.035), pole: [-0.3, -1, -0.6], hand: [0, 0, -30], grip: 0.6 },
        legL: foot(0.2, 0, 22, [0.5, 0, 1]),
        legR: foot(-0.2, 0, -22, [-0.5, 0, 1]),
        prop: { pos: chestRel(...barBack) },
      };
    },
  };

  // ── Développé militaire ────────────────────────────────────────────────
  const press: ClipDef = {
    name: "press",
    duration: 2.6,
    loop: true,
    pose: (t) => {
      const h = k1(t, [
        [0, 0],
        [0.3, 0],
        [1.05, 1],
        [1.45, 1],
        [2.25, 0],
        [2.6, 0],
      ]);
      const barY = lerpN(sh[1] + 0.035, sh[1] + m.armLen * 0.93 + 0.05, h);
      const barZ = sh[2] + lerpN(0.11, 0.01, h);
      const passFace = Math.sin(Math.PI * Math.min(1, h * 1.6));
      return {
        hips: { offset: [0, -0.012, 0.0], rot: [-2 * h, 0, 0] },
        spine: [-2, 0, 0],
        spine1: [-2 - 2 * h, 0, 0],
        spine2: [-4 - 3 * h, 0, 0],
        neck: [-4 * passFace, 0, 0],
        head: [-6 * passFace + 4 * h, 0, 0],
        shoulderL: [0, 0, 10 * h],
        shoulderR: [0, 0, -10 * h],
        armL: {
          ik: [0.25, barY - 0.035, barZ - 0.02],
          pole: lerpV([0.25, -0.8, 0.8], [1, -0.2, 0], h),
          hand: [0, 0, 20],
          grip: 0.6,
        },
        armR: {
          ik: [-0.25, barY - 0.035, barZ - 0.02],
          pole: lerpV([-0.25, -0.8, 0.8], [-1, -0.2, 0], h),
          hand: [0, 0, -20],
          grip: 0.6,
        },
        legL: foot(0.15, 0, 8),
        legR: foot(-0.15, 0, -8),
        prop: { pos: [0, barY, barZ] },
      };
    },
  };

  // ── Soulevé de terre ───────────────────────────────────────────────────
  const deadlift: ClipDef = {
    name: "deadlift",
    duration: 3.2,
    loop: true,
    pose: (t) => {
      const d = k1(t, [
        [0, 0],
        [0.35, 0],
        [1.4, 1],
        [1.7, 1],
        [2.8, 0],
        [3.2, 0],
      ]);
      const midHands = (ctx: Ctx) => ctx.pos("LeftHand").add(ctx.pos("RightHand")).multiplyScalar(0.5).add(new Vector3(0, -0.055, 0.025));
      return {
        hips: { offset: [0, -0.26 * d, -0.2 * d], rot: [52 * d, 0, 0] },
        spine: [-4 * d, 0, 0],
        spine1: [-2 * d, 0, 0],
        spine2: [-2 * d, 0, 0],
        neck: [-14 * d, 0, 0],
        head: [-14 * d, 0, 0],
        shoulderL: [0, -4 * d, -4],
        shoulderR: [0, 4 * d, 4],
        armL: { ik: (ctx) => add(ctx.pos("LeftArm"), [0.025, -m.armLen * 0.99, 0.09]), pole: [0.3, 0, -1], hand: [0, 0, 6], grip: 0.65 },
        armR: { ik: (ctx) => add(ctx.pos("RightArm"), [-0.025, -m.armLen * 0.99, 0.09]), pole: [-0.3, 0, -1], hand: [0, 0, -6], grip: 0.65 },
        legL: foot(0.14, 0, 8, [0.25, 0, 1]),
        legR: foot(-0.14, 0, -8, [-0.25, 0, 1]),
        prop: { pos: midHands },
      };
    },
  };

  // ── Jab – cross ────────────────────────────────────────────────────────
  const guardL: V3 = [0.11, neckH + 0.07, 0.25];
  const guardR: V3 = [-0.1, neckH + 0.05, 0.19];
  const punch: ClipDef = {
    name: "punch",
    duration: 1.6,
    loop: true,
    pose: (t) => {
      const jab = k1(t, [
        [0, 0],
        [0.12, 0],
        [0.24, 1],
        [0.42, 0],
        [1.6, 0],
      ]);
      const cross = k1(t, [
        [0, 0],
        [0.55, 0],
        [0.7, 1],
        [0.95, 0],
        [1.6, 0],
      ]);
      const bounce = Math.sin(TAU * (t / 0.8)) * 0.008;
      const yaw = -24 + 30 * cross - 6 * jab;
      return {
        hips: { offset: [0, -0.06 + bounce, 0], rot: [4, yaw * 0.6, 0] },
        spine: [3, yaw * 0.15, 0],
        spine1: [3, yaw * 0.15, 0],
        spine2: [4, -8 * jab + 10 * cross, 0],
        neck: [4, -yaw * 0.5, 0],
        head: [8, -yaw * 0.4, 0],
        shoulderL: [0, 6 * jab, 0],
        shoulderR: [0, -6 * cross, 0],
        armL: { ik: chestRel(...lerpV(guardL, [0.04, neckH + 0.08, 0.6], jab)), pole: [0.3, -1, -0.2], hand: [0, 0, 70 * jab], grip: 1 },
        armR: { ik: chestRel(...lerpV(guardR, [-0.03, neckH + 0.08, 0.62], cross)), pole: [-0.3, -1, -0.2], hand: [0, 0, -70 * cross], grip: 1 },
        legL: foot(0.12, 0.17, 18, [0.2, 0, 1]),
        legR: foot(-0.13, -0.14, -40 + 25 * cross, [-0.2, 0, 1], 0.01 * cross, 12 * cross, -12 * cross),
      };
    },
  };

  // ── Course sur place ───────────────────────────────────────────────────
  const run: ClipDef = {
    name: "run",
    duration: 0.72,
    loop: true,
    pose: (t) => {
      const phi = (TAU * t) / 0.72;
      const leg = (psi: number, x: number): LegSpec => {
        const s = Math.sin(psi);
        const air = Math.max(0, s);
        const z = -0.23 * Math.cos(psi);
        const lift = air * 0.16 + air * Math.max(0, -Math.cos(psi)) * 0.14;
        return { ik: [x, ankleY + lift, m.ankleL[2] + z + 0.05], pole: [0, 0, 1], foot: [26 * air - 6, 0, 0], toe: -10 * air };
      };
      const arm = (psi: number, x: number): ArmSpec => ({
        ik: chestRel(x, shRel[1] - 0.24 + 0.07 * Math.max(0, Math.cos(psi)), 0.07 + 0.2 * Math.cos(psi)),
        pole: [Math.sign(x) * 0.3, -0.6, -1],
        grip: 0.7,
        hand: [0, 0, Math.sign(x) * 10],
      });
      return {
        hips: { offset: [0, -0.035 - 0.022 * Math.cos(2 * phi), 0.02], rot: [9, 7 * Math.sin(phi), 0] },
        spine: [2, -3 * Math.sin(phi), 0],
        spine1: [2, -3 * Math.sin(phi), 0],
        spine2: [3, -6 * Math.sin(phi), 0],
        neck: [-4, 4 * Math.sin(phi), 0],
        head: [-4, 3 * Math.sin(phi), 0],
        shoulderL: [0, 4 * Math.cos(phi), 0],
        shoulderR: [0, 4 * Math.cos(phi), 0],
        legL: leg(phi, 0.1),
        legR: leg(phi + Math.PI, -0.1),
        armL: arm(phi, 0.2),
        armR: arm(phi + Math.PI, -0.2),
      };
    },
  };

  // ── Level-up ───────────────────────────────────────────────────────────
  const gather = (): Pose => ({
    hips: { offset: [0, -0.14, -0.03], rot: [12, 0, 0] },
    spine: [8, 0, 0],
    spine1: [8, 0, 0],
    spine2: [10, 0, 0],
    neck: [10, 0, 0],
    head: [18, 0, 0],
    shoulderL: [0, -10, -4],
    shoulderR: [0, 10, 4],
    armL: { ik: chestRel(-0.09, -0.13, 0.26), pole: [0.6, -1, -0.2], grip: 1 },
    armR: { ik: chestRel(0.09, -0.1, 0.28), pole: [-0.6, -1, -0.2], grip: 1 },
    legL: foot(0.16, 0.02, 14, [0.3, 0, 1]),
    legR: foot(-0.16, 0.02, -14, [-0.3, 0, 1]),
  });
  const ascend = (f: number): Pose => ({
    hips: { offset: [0, 0.035 + f * 0.01, 0], rot: [-4, 0, 0] },
    spine: [-4, 0, 0],
    spine1: [-6, 0, 0],
    spine2: [-12, 0, 0],
    neck: [-8, 0, 0],
    head: [-18, 0, 0],
    shoulderL: [0, 0, 16],
    shoulderR: [0, 0, -16],
    armL: { ik: [sh[0] + 0.45, sh[1] + 0.3 + f * 0.02, sh[2] + 0.08], pole: [0.3, -1, -0.3], hand: [0, 0, -10], grip: -0.25 },
    armR: { ik: [-sh[0] - 0.45, sh[1] + 0.3 - f * 0.02, sh[2] + 0.08], pole: [-0.3, -1, -0.3], hand: [0, 0, 10], grip: -0.25 },
    legL: foot(0.15, 0.0, 10, [0.2, 0, 1], 0.055, 22, -24),
    legR: foot(-0.15, 0.0, -10, [-0.2, 0, 1], 0.055, 22, -24),
  });
  const levelUp: ClipDef = {
    name: "level_up",
    duration: 3.4,
    loop: false,
    pose: (t) => {
      const f = Math.sin(TAU * t * 0.9);
      if (t > 1.05) return ascend(f);
      return keyed(t, [
        [0, stand()],
        [0.7, gather()],
        [1.05, ascend(0)],
      ]);
    },
  };

  return [idle, tired, flex, victory, squat, press, deadlift, punch, run, levelUp];
}

/** Échantillonne chaque clip en pistes glTF (rotations de tous les os + translations racine/prop). */
export function buildClips(bones: Bone[]): ClipData[] {
  const rig = new Rig(bones);
  return clipDefs(rig).map((def) => {
    const frames = Math.round(def.duration * FPS) + 1;
    const times = new Float32Array(frames);
    const rot = new Map(bones.map((b) => [b.name, new Float32Array(frames * 4)]));
    const hips = new Float32Array(frames * 3);
    const prop = new Float32Array(frames * 3);
    const prev = new Map<string, Quaternion>();
    for (let f = 0; f < frames; f++) {
      // Les boucles se referment exactement : la dernière image = la première.
      const t = def.loop && f === frames - 1 ? 0 : Math.min(def.duration, f / FPS);
      times[f] = f === frames - 1 ? def.duration : f / FPS;
      const s = rig.solve(def.pose(t));
      for (const b of bones) {
        const qv = s.local.get(b.name)!;
        const p = prev.get(b.name);
        // Continuité des quaternions (évite les interpolations par le "long chemin").
        if (p && p.dot(qv) < 0) qv.set(-qv.x, -qv.y, -qv.z, -qv.w);
        prev.set(b.name, qv.clone());
        rot.get(b.name)!.set([qv.x, qv.y, qv.z, qv.w], f * 4);
      }
      hips.set([s.hipsPos.x, s.hipsPos.y, s.hipsPos.z], f * 3);
      prop.set([s.propPos.x, s.propPos.y, s.propPos.z], f * 3);
    }
    const tracks: Track[] = bones.map((b) => ({ bone: b.name, path: "rotation", times, values: rot.get(b.name)! }));
    tracks.push({ bone: "Hips", path: "translation", times, values: hips });
    tracks.push({ bone: "Prop", path: "translation", times, values: prop });
    return { name: def.name, tracks };
  });
}
