/**
 * Construction du corps du héros à partir de MakeHuman :
 *  1. forme de base "héroïque stylisée" (macros + proportions + exagérations)
 *  2. mise à l'échelle en mètres, pieds au sol
 *  3. deltas de morph targets (muscles par groupe, composition, visage, états)
 *  4. masques par groupe musculaire et masques de "peinture" du visage
 */
import { MUSCLE_GROUPS, type MuscleGroup } from "../../../src/avatar/contract";
import { HERO_HEIGHT } from "../config";
import { clamp01, computeNormals, smoothstep } from "./geometry";
import {
  applyTarget,
  loadTarget,
  parseObj,
  parseSkeleton,
  parseWeights,
  type ObjMesh,
  type Target,
} from "./makehuman";
import { buildSkeleton, type Bone } from "./skeleton";

export type Gender = "m" | "f";

export interface BodyBuild {
  gender: Gender;
  obj: ObjMesh;
  /** Positions finales (m) des 19158 sommets MakeHuman (corps + helpers). */
  base: Float32Array;
  /** Deltas par morph (même taille que base). */
  morphs: Map<string, Float32Array>;
  /** Triangles du corps (indices MakeHuman). */
  bodyTris: Uint32Array;
  /** Normales du corps au repos. */
  normals: Float32Array;
  bones: Bone[];
  mhWeights: Record<string, [number, number][]>;
  /** Masques musculaires par sommet : 11 canaux. */
  muscleMask: Map<MuscleGroup, Float32Array>;
  /** Peinture visage : brows, stubble, lips, scalp (4 canaux, 0→1). */
  paint: Float32Array;
  /** Catégories anatomiques par sommet (pour les régions des vêtements/cheveux). */
  cat: Record<Category, Float32Array>;
  /** Repères anatomiques (m). */
  ref: Record<string, [number, number, number]>;
  scale: number;
}

export type Category =
  | "hips"
  | "torso"
  | "neck"
  | "head"
  | "clavicle"
  | "shoulder"
  | "upperarm"
  | "lowerarm"
  | "hand"
  | "thigh"
  | "shin"
  | "foot";

const CATEGORY_OF = (mhBone: string): Category => {
  const b = mhBone.replace(/\.(L|R)$/, "");
  if (["root", "spine05", "pelvis"].includes(b)) return "hips";
  if (b.startsWith("spine") || b === "breast") return "torso";
  if (b.startsWith("neck")) return "neck";
  if (b === "clavicle") return "clavicle";
  if (b === "shoulder01") return "shoulder";
  if (b.startsWith("upperarm")) return "upperarm";
  if (b.startsWith("lowerarm")) return "lowerarm";
  if (b === "wrist" || b.startsWith("metacarpal") || b.startsWith("finger")) return "hand";
  if (b.startsWith("upperleg")) return "thigh";
  if (b.startsWith("lowerleg")) return "shin";
  if (b === "foot" || b.startsWith("toe")) return "foot";
  return "head";
};

const sided = (name: string) => [name.replace("{s}", "l"), name.replace("{s}", "r")];

/** Combinaison linéaire de targets → delta dense (unités MakeHuman). */
function combine(n: number, parts: [Target, number][]): Float32Array {
  const d = new Float32Array(n * 3);
  for (const [t, w] of parts) applyTarget(d, t, w);
  return d;
}

export function buildBody(gender: Gender): BodyBuild {
  const obj = parseObj("3dobjs/base.obj");
  const N = obj.positions.length / 3;
  const g = gender === "m" ? "male" : "female";
  const T = (name: string) => loadTarget(name);
  const macro = (muscle: string, weight: string) =>
    T(`macrodetails/universal-${g}-young-${muscle}muscle-${weight}weight`);

  // ── 1. Forme de base ────────────────────────────────────────────────
  const shape = new Float32Array(obj.positions);
  const avgavg = macro("average", "average");
  applyTarget(shape, avgavg, 1);
  for (const race of ["african", "asian", "caucasian"]) applyTarget(shape, T(`macrodetails/${race}-${g}-young`), 1 / 3);
  applyTarget(shape, T(`macrodetails/proportions/${g}-young-averagemuscle-averageweight-idealproportions`), 1);

  // Exagérations "héroïques" : épaules larges, taille fine, tête un peu plus petite,
  // mains/pieds plus présents, jambes plus longues. Le muscle de départ reste moyen.
  const heroic: [string, number][] =
    gender === "m"
      ? [
          ["torso/torso-vshape-incr", 0.55],
          ["torso/torso-scale-horiz-incr", 0.2],
          ["neck/neck-scale-horiz-incr", 0.45],
          ["head/head-scale-horiz-decr", 0.2],
          ["head/head-scale-vert-decr", 0.15],
          ["armslegs/upperlegs-height-incr", 0.35],
          ["armslegs/lowerlegs-height-incr", 0.25],
          ["chin/chin-prominent-incr", 0.35],
          ["chin/chin-width-incr", 0.25],
          ...sided("armslegs/{s}-hand-scale-incr").map((n) => [n, 0.3] as [string, number]),
          ...sided("armslegs/{s}-foot-scale-incr").map((n) => [n, 0.15] as [string, number]),
        ]
      : [
          ["torso/torso-vshape-incr", 0.2],
          ["neck/neck-scale-horiz-incr", 0.1],
          ["head/head-scale-horiz-decr", 0.15],
          ["head/head-scale-vert-decr", 0.1],
          ["armslegs/upperlegs-height-incr", 0.35],
          ["armslegs/lowerlegs-height-incr", 0.25],
          ...sided("armslegs/{s}-hand-scale-incr").map((n) => [n, 0.15] as [string, number]),
        ];
  for (const [name, w] of heroic) applyTarget(shape, T(name), w);
  // Base légèrement athlétique (le joueur commence "moyen +").
  const maxavg = macro("max", "average");
  const muscleDelta = combine(N, [
    [maxavg, 1],
    [avgavg, -1],
  ]);
  for (let i = 0; i < shape.length; i++) shape[i] += muscleDelta[i] * 0.15;

  // ── 2. Échelle (dm → m, taille de référence) et pieds au sol ────────
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < 13380; i++) {
    minY = Math.min(minY, shape[i * 3 + 1]);
    maxY = Math.max(maxY, shape[i * 3 + 1]);
  }
  const scale = HERO_HEIGHT[gender] / (maxY - minY);
  const base = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    base[i * 3] = shape[i * 3] * scale;
    base[i * 3 + 1] = (shape[i * 3 + 1] - minY) * scale;
    base[i * 3 + 2] = shape[i * 3 + 2] * scale;
  }
  const scaled = (d: Float32Array) => {
    for (let i = 0; i < d.length; i++) d[i] *= scale;
    return d;
  };

  const mh = parseSkeleton("rigs/default.mhskel");
  const bones = buildSkeleton(mh, base);
  const bone = (n: string) => bones.find((b) => b.name === n)!;
  const mhWeights = parseWeights("rigs/default_weights.mhw");

  // ── Triangles + normales du corps ────────────────────────────────────
  const tris: number[] = [];
  for (const f of obj.faces) {
    if (f.group !== "body") continue;
    for (let k = 1; k + 1 < f.v.length; k++) tris.push(f.v[0], f.v[k], f.v[k + 1]);
  }
  const bodyTris = new Uint32Array(tris);
  const normals = computeNormals(base, bodyTris, N);

  // ── Catégories anatomiques par sommet ─────────────────────────────────
  const CATS: Category[] = ["hips", "torso", "neck", "head", "clavicle", "shoulder", "upperarm", "lowerarm", "hand", "thigh", "shin", "foot"];
  const cat = Object.fromEntries(CATS.map((c) => [c, new Float32Array(N)])) as Record<Category, Float32Array>;
  for (const [mhBone, list] of Object.entries(mhWeights)) {
    const c = CATEGORY_OF(mhBone);
    for (const [v, w] of list) cat[c][v] += w;
  }
  for (let v = 0; v < N; v++) {
    let s = 0;
    for (const c of CATS) s += cat[c][v];
    if (s > 0) for (const c of CATS) cat[c][v] /= s;
  }

  // ── Repères anatomiques ───────────────────────────────────────────────
  const eyeL = bone("LeftEye").head,
    eyeR = bone("RightEye").head;
  const ref: BodyBuild["ref"] = {
    pelvis: bone("Hips").head,
    spine1: bone("Spine1").head,
    chest: bone("Spine2").head,
    neck: bone("Neck").head,
    head: bone("Head").head,
    headTop: bone("Head").tail,
    eyeL,
    eyeR,
    eyeMid: [(eyeL[0] + eyeR[0]) / 2, (eyeL[1] + eyeR[1]) / 2, (eyeL[2] + eyeR[2]) / 2],
    shoulderL: bone("LeftArm").head,
    elbowL: bone("LeftForeArm").head,
    wristL: bone("LeftHand").head,
    hipL: bone("LeftUpLeg").head,
    kneeL: bone("LeftLeg").head,
    ankleL: bone("LeftFoot").head,
  };

  // ── 4. Masques musculaires ──────────────────────────────────────────
  const P = (v: number, k: number) => base[v * 3 + k];
  const Nz = (v: number) => normals[v * 3 + 2];
  const front = (v: number) => smoothstep(-0.25, 0.35, Nz(v));
  const pecLow = ref.chest[1] + (ref.neck[1] - ref.chest[1]) * 0.28;
  const shoulderX = ref.shoulderL[0];
  // Direction du biceps : composante de l'avant-bras perpendiculaire au bras (repos).
  const bicepsDir = (side: 1 | -1) => {
    const s = side === 1 ? "Left" : "Right";
    const a = bone(`${s}Arm`),
      f = bone(`${s}ForeArm`);
    const u = norm(sub(f.head, a.head)),
      l = norm(sub(f.tail, f.head));
    return norm(sub(l, mul(u, dot(l, u))));
  };
  const bDir = { 1: bicepsDir(1), [-1]: bicepsDir(-1) } as Record<1 | -1, [number, number, number]>;

  const masks = new Map<MuscleGroup, Float32Array>(MUSCLE_GROUPS.map((m) => [m, new Float32Array(N)]));
  const M = (gname: MuscleGroup) => masks.get(gname)!;
  for (let v = 0; v < N; v++) {
    const x = P(v, 0),
      y = P(v, 1),
      z = P(v, 2);
    const side: 1 | -1 = x >= 0 ? 1 : -1;
    const ax = Math.abs(x);
    const fr = front(v);
    // Torse : pectoraux (haut avant), abdos (bas avant), dos (arrière).
    const torso = cat.torso[v] + cat.clavicle[v];
    if (torso > 0) {
      const pec = smoothstep(pecLow - 0.03, pecLow + 0.02, y) * (1 - smoothstep(shoulderX * 0.75, shoulderX * 1.0, ax));
      M("pecs")[v] += torso * fr * pec;
      M("abs")[v] += torso * fr * (1 - pec);
      M("back")[v] += torso * (1 - fr);
    }
    // Bassin : fessiers à l'arrière, bas des abdos devant.
    if (cat.hips[v] > 0) {
      M("glutes")[v] += cat.hips[v] * (1 - fr);
      M("abs")[v] += cat.hips[v] * fr * smoothstep(ref.pelvis[1] - 0.06, ref.pelvis[1] + 0.02, y);
      M("quads")[v] += cat.hips[v] * fr * (1 - smoothstep(ref.pelvis[1] - 0.06, ref.pelvis[1] + 0.02, y));
    }
    // Cou : trapèzes.
    M("back")[v] += cat.neck[v] * 0.7;
    M("shoulders")[v] += cat.neck[v] * 0.1;
    M("shoulders")[v] += cat.shoulder[v];
    // Bras : deltoïde près de l'articulation, puis biceps / triceps.
    if (cat.upperarm[v] > 0) {
      const sh = side === 1 ? ref.shoulderL : mirror(ref.shoulderL);
      const dist = Math.hypot(x - sh[0], y - sh[1], z - sh[2]);
      const delt = 1 - smoothstep(0.07, 0.13, dist);
      const n: [number, number, number] = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
      const bi = smoothstep(-0.3, 0.3, dot(n, bDir[side]));
      M("shoulders")[v] += cat.upperarm[v] * delt;
      M("biceps")[v] += cat.upperarm[v] * (1 - delt) * bi;
      M("triceps")[v] += cat.upperarm[v] * (1 - delt) * (1 - bi);
    }
    M("forearms")[v] += cat.lowerarm[v] + cat.hand[v] * 0.6;
    // Cuisses : quadriceps devant/côté, ischios derrière, fessier en haut derrière.
    if (cat.thigh[v] > 0) {
      const hip = side === 1 ? ref.hipL : mirror(ref.hipL);
      const butt = smoothstep(hip[1] - 0.1, hip[1] - 0.02, y) * (1 - fr);
      const q = smoothstep(-0.45, 0.15, Nz(v));
      M("glutes")[v] += cat.thigh[v] * butt;
      M("quads")[v] += cat.thigh[v] * (1 - butt) * q;
      M("hamstrings")[v] += cat.thigh[v] * (1 - butt) * (1 - q);
    }
    M("calves")[v] += cat.shin[v] + cat.foot[v] * 0.3;
  }

  // ── 3. Morph targets ────────────────────────────────────────────────
  const morphs = new Map<string, Float32Array>();
  const masked = (delta: Float32Array, mask: Float32Array, gain = 1) => {
    const out = new Float32Array(delta.length);
    for (let v = 0; v < N; v++) for (let k = 0; k < 3; k++) out[v * 3 + k] = delta[v * 3 + k] * mask[v] * gain;
    return out;
  };
  const addInto = (dst: Float32Array, src: Float32Array, w = 1) => {
    for (let i = 0; i < dst.length; i++) dst[i] += src[i] * w;
  };
  const share = (a: MuscleGroup, b: MuscleGroup) => {
    const out = new Float32Array(N);
    for (let v = 0; v < N; v++) {
      const s = M(a)[v] + M(b)[v];
      out[v] = s > 1e-4 ? M(a)[v] / s : 0.5;
    }
    return out;
  };
  const local = (names: string[], w = 1) => combine(N, names.map((n) => [T(n), w] as [Target, number]));

  const localFor: Record<MuscleGroup, () => Float32Array> = {
    pecs: () => local(["torso/torso-muscle-pectoral-incr"], 0.9),
    back: () => {
      const d = local(["torso/torso-muscle-dorsi-incr"], 0.9);
      addInto(d, local(["torso/torso-vshape-incr"], 0.35));
      return d;
    },
    shoulders: () => local(sided("armslegs/{s}-upperarm-shoulder-muscle-incr"), 1),
    biceps: () => masked(local(sided("armslegs/{s}-upperarm-muscle-incr"), 1), share("biceps", "triceps")),
    triceps: () => masked(local(sided("armslegs/{s}-upperarm-muscle-incr"), 1), share("triceps", "biceps")),
    forearms: () => local(sided("armslegs/{s}-lowerarm-muscle-incr"), 1),
    abs: () => local(["stomach/stomach-pregnant-decr"], 0.5),
    quads: () => masked(local(sided("armslegs/{s}-upperleg-muscle-incr"), 1), share("quads", "hamstrings")),
    hamstrings: () => masked(local(sided("armslegs/{s}-upperleg-muscle-incr"), 1), share("hamstrings", "quads")),
    calves: () => local(sided("armslegs/{s}-lowerleg-muscle-incr"), 1),
    glutes: () => local(["buttocks/buttocks-volume-incr"], 0.6),
  };
  for (const m of MUSCLE_GROUPS) {
    const d = masked(muscleDelta, M(m), 1.0);
    addInto(d, localFor[m]());
    morphs.set(`muscle_${m}`, scaled(d));
  }

  const avgmin = macro("average", "min");
  const avgmax = macro("average", "max");
  const maxmin = macro("max", "min");
  morphs.set("lean", scaled(combine(N, [[avgmin, 1], [avgavg, -1]])));
  morphs.set("fat", scaled(combine(N, [[avgmax, 1], [avgavg, -1]])));
  morphs.set("cut", scaled(combine(N, [[maxmin, 1], [maxavg, -1], [avgmin, -1], [avgavg, 1]])));
  {
    const chestMask = new Float32Array(N);
    for (let v = 0; v < N; v++) chestMask[v] = cat.torso[v] + cat.clavicle[v] * 0.5;
    const d = masked(local(["torso/torso-scale-depth-incr"]), chestMask, 0.35);
    addInto(d, local(["stomach/stomach-pregnant-incr"], 0.08));
    morphs.set("breath", scaled(d));
  }
  const EXPR = (u: string) => `expression/units/caucasian/${u}`;
  morphs.set(
    "fatigue",
    scaled(
      combine(N, [
        [T(EXPR("eye-left-closure")), 0.38],
        [T(EXPR("eye-right-closure")), 0.38],
        [T(EXPR("eyebrows-left-inner-up")), 0.55],
        [T(EXPR("eyebrows-right-inner-up")), 0.55],
      ]),
    ),
  );
  morphs.set("smile", scaled(combine(N, [[T(EXPR("mouth-corner-puller")), 0.85]])));
  morphs.set("blink", scaled(combine(N, [[T(EXPR("eye-left-closure")), 1], [T(EXPR("eye-right-closure")), 1]])));
  morphs.set("cheeks_hollow", scaled(local(sided("cheek/{s}-cheek-volume-decr"), 0.8)));

  morphs.set("face_square", scaled(local(["head/head-square"])));
  morphs.set("face_round", scaled(local(["head/head-round"])));
  morphs.set("face_long", scaled(combine(N, [[T("head/head-oval"), 0.5], [T("head/head-scale-vert-incr"), 0.6]])));
  morphs.set("jaw_wide", scaled(combine(N, [[T("chin/chin-width-incr"), 0.7], [T("chin/chin-bones-incr"), 0.7]])));
  morphs.set("cheekbones", scaled(local(sided("cheek/{s}-cheek-bones-incr"))));
  morphs.set("nose_wide", scaled(local(["nose/nose-scale-horiz-incr"])));
  morphs.set("nose_long", scaled(local(["nose/nose-scale-vert-incr"])));
  morphs.set("brow_heavy", scaled(combine(N, [[T("eyebrows/eyebrows-trans-forward"), 1], [T("eyebrows/eyebrows-angle-down"), 0.5]])));

  // ── Peinture du visage (sourcils, barbe de 3 jours, lèvres, cuir chevelu) ──
  const paint = computeFacePaint(base, normals, cat.head, cat.neck, ref);

  return { gender, obj, base, morphs, bodyTris, normals, bones, mhWeights, muscleMask: masks, paint, cat, ref, scale };
}

// ── Petits utilitaires vectoriels ─────────────────────────────────────────
type V3 = [number, number, number];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mirror = (a: V3): V3 => [-a[0], a[1], a[2]];

/**
 * Repère du visage : origine entre les yeux. Calcule pour chaque sommet
 * 4 masques doux : sourcils, zone de barbe, lèvres, cuir chevelu.
 */
function computeFacePaint(
  base: Float32Array,
  normals: Float32Array,
  headCat: Float32Array,
  neckCat: Float32Array,
  ref: BodyBuild["ref"],
): Float32Array {
  const N = base.length / 3;
  const out = new Float32Array(N * 4);
  const O = ref.eyeMid;
  const eyeX = ref.eyeL[0];
  const headTop = ref.headTop[1];
  for (let v = 0; v < 13380; v++) {
    const h = headCat[v] + neckCat[v] * 0.5;
    if (h < 0.05) continue;
    const x = base[v * 3] - O[0],
      y = base[v * 3 + 1] - O[1],
      z = base[v * 3 + 2] - O[2];
    const nz = normals[v * 3 + 2];
    const ax = Math.abs(x);
    const frontish = smoothstep(0.05, 0.45, nz);

    // Sourcils : arc au-dessus de chaque œil.
    const bx = (ax - eyeX * 0.95) / 0.03; // -1..1 sur la largeur du sourcil
    const browY = 0.019 + 0.005 * (1 - bx * bx) - 0.002 * bx;
    const brow =
      (1 - smoothstep(0.0028, 0.0055, Math.abs(y - browY))) *
      (1 - smoothstep(0.85, 1.15, Math.abs(bx))) *
      smoothstep(0.004, 0.009, ax) *
      frontish;

    // Lèvres : ellipse sous le nez.
    const mouthY = -0.071;
    const lx = x / 0.025,
      ly = (y - mouthY) / 0.0095;
    const lips = (1 - smoothstep(0.75, 1.05, Math.sqrt(lx * lx + ly * ly))) * frontish;

    // Barbe : bas du visage + sous le menton + moustache, hors lèvres.
    const cheekLine = -0.053 + 0.02 * smoothstep(0.015, 0.05, ax);
    const lowerFace = 1 - smoothstep(cheekLine - 0.006, cheekLine + 0.006, y);
    const sideburn = smoothstep(0.045, 0.06, ax) * (1 - smoothstep(0.0, 0.012, y)) * smoothstep(-0.07, -0.04, z + 0.02);
    const behindJaw = smoothstep(-0.11, -0.075, z); // exclut la nuque
    const neckCut = smoothstep(-0.135, -0.11, y); // s'arrête sous le menton
    const stubble = clamp01(Math.max(lowerFace, sideburn)) * behindJaw * neckCut * (1 - lips * 0.95) * clamp01(h * 1.5);

    // Cuir chevelu : au-dessus d'une ligne d'implantation qui descend vers la nuque.
    const theta = Math.atan2(x, z + 0.07); // 0 = devant (centre du crâne)
    const c = Math.cos(theta);
    const hairline = c > 0 ? 0.058 * c + 0.03 * (1 - c) : 0.03 + (-0.05 - 0.03) * -c;
    const earGap = smoothstep(0.055, 0.07, ax) * (1 - smoothstep(0.005, 0.03, y)) * smoothstep(-0.06, 0.0, -z - 0.02);
    const scalp = smoothstep(hairline - 0.006, hairline + 0.006, y) * (1 - earGap) * (y < headTop ? 1 : 1);

    out[v * 4] = clamp01(brow);
    out[v * 4 + 1] = clamp01(stubble);
    out[v * 4 + 2] = clamp01(lips);
    out[v * 4 + 3] = clamp01(scalp * clamp01(headCat[v] * 1.4));
  }
  return out;
}
