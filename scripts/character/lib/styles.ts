/**
 * Coiffures, barbes, vêtements et chaussures, définis comme des coques
 * calculées à partir des sommets du corps (régions anatomiques + épaisseur).
 */
import type { BodyBuild } from "./body";
import { clamp01, smoothstep, valueNoise3 } from "./geometry";
import type { ShellSpec } from "./assemble";

type V3 = [number, number, number];

/** Paramètre t (0 = tête de l'os, 1 = extrémité) d'un point projeté sur un segment. */
const segT = (p: V3, a: V3, b: V3) => {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  return ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2;
};
const mir = (a: V3, side: number): V3 => [a[0] * side, a[1], a[2]];

export function shellSpecs(b: BodyBuild): ShellSpec[] {
  const { base, cat, paint, ref } = b;
  const P = (v: number): V3 => [base[v * 3], base[v * 3 + 1], base[v * 3 + 2]];
  const side = (v: number) => (base[v * 3] >= 0 ? 1 : -1);
  const bone = (n: string) => b.bones.find((x) => x.name === n)!;
  const L = {
    shoulder: bone("LeftArm").head,
    elbow: bone("LeftForeArm").head,
    wrist: bone("LeftHand").head,
    hip: bone("LeftUpLeg").head,
    knee: bone("LeftLeg").head,
    ankle: bone("LeftFoot").head,
  };
  const tUpperArm = (v: number) => segT(P(v), mir(L.shoulder, side(v)), mir(L.elbow, side(v)));
  const tForeArm = (v: number) => segT(P(v), mir(L.elbow, side(v)), mir(L.wrist, side(v)));
  const tThigh = (v: number) => segT(P(v), mir(L.hip, side(v)), mir(L.knee, side(v)));
  const tShin = (v: number) => segT(P(v), mir(L.knee, side(v)), mir(L.ankle, side(v)));
  const isBody = (v: number) => v < 13380;
  const torsoW = (v: number) => cat.torso[v] + cat.clavicle[v] + cat.hips[v];
  const offset =
    (h: number | ((v: number) => number)) =>
    (v: number, p: V3, n: V3): V3 => {
      const d = typeof h === "number" ? h : h(v);
      return [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
    };
  const y = (v: number) => base[v * 3 + 1];
  const z = (v: number) => base[v * 3 + 2];
  const ax = (v: number) => Math.abs(base[v * 3]);

  // ── Vêtements ─────────────────────────────────────────────────────────
  const neckY = ref.neck[1];
  const pelvisY = ref.pelvis[1];
  const chestY = ref.chest[1];
  const shoulderY = ref.shoulderL[1];
  const shoulderX = ref.shoulderL[0];
  const neckline = (v: number, front: number, back: number) => {
    const isFront = z(v) > ref.neck[2] - 0.01;
    return y(v) < neckY - (isFront ? front : back);
  };
  const topBase = (v: number) => isBody(v) && y(v) > pelvisY - 0.035;

  const distShoulder = (v: number) => {
    const sh = mir(ref.shoulderL, side(v));
    return Math.hypot(base[v * 3] - sh[0], base[v * 3 + 1] - sh[1], base[v * 3 + 2] - sh[2]);
  };
  const tank: ShellSpec = {
    name: "Top_tank",
    material: "Top_tank",
    include: (v) =>
      topBase(v) &&
      torsoW(v) + cat.shoulder[v] > 0.5 &&
      cat.upperarm[v] < 0.25 &&
      cat.neck[v] < 0.4 &&
      neckline(v, 0.075, 0.03) &&
      distShoulder(v) > 0.12 &&
      !(ax(v) > shoulderX * 0.7 && y(v) > chestY + (shoulderY - chestY) * 0.55 && z(v) < ref.chest[2] + 0.02),
    place: offset(0.014),
    smooth: 3,
    hem: 0.018,
  };
  const tee: ShellSpec = {
    name: "Top_tee",
    material: "Top_tee",
    include: (v) =>
      topBase(v) &&
      neckline(v, 0.04, 0.012) &&
      (torsoW(v) + cat.shoulder[v] + cat.upperarm[v] * (tUpperArm(v) < 0.55 ? 1 : 0) > 0.5) &&
      cat.lowerarm[v] < 0.2 &&
      cat.neck[v] < 0.5,
    place: offset(0.015),
    smooth: 3,
    hem: 0.019,
    visible: false,
  };
  const hoodie: ShellSpec = {
    name: "Top_hoodie",
    material: "Top_hoodie",
    include: (v) =>
      topBase(v) &&
      neckline(v, 0.01, -0.01) &&
      cat.hand[v] < 0.3 &&
      (torsoW(v) + cat.shoulder[v] + cat.upperarm[v] + cat.neck[v] > 0.5 || (cat.lowerarm[v] > 0.3 && tForeArm(v) < 0.93)),
    place: offset((v) => 0.019 + 0.004 * clamp01(cat.lowerarm[v])),
    smooth: 6,
    hem: 0.02,
    visible: false,
  };
  const shortsBase = (v: number) =>
    isBody(v) &&
    ((torsoW(v) > 0.45 && y(v) < pelvisY + 0.075) || (cat.thigh[v] > 0.3 && tThigh(v) < 0.52 && cat.hips[v] + cat.thigh[v] > 0.6));
  const shorts: ShellSpec = {
    name: "Bottom_shorts",
    material: "Bottom_shorts",
    include: shortsBase,
    place: offset(0.0105),
    smooth: 3,
    hem: 0.015,
  };
  const joggers: ShellSpec = {
    name: "Bottom_joggers",
    material: "Bottom_joggers",
    include: (v) =>
      isBody(v) &&
      ((torsoW(v) > 0.45 && y(v) < pelvisY + 0.075) || cat.thigh[v] > 0.3 || (cat.shin[v] > 0.3 && tShin(v) < 0.9)) &&
      cat.foot[v] < 0.4,
    place: offset((v) => 0.011 + 0.006 * clamp01(cat.shin[v] * smoothstep(0.5, 0.85, tShin(v)))),
    smooth: 5,
    hem: 0.015,
    visible: false,
  };
  const ankleY = ref.ankleL[1];
  const sneakers: ShellSpec = {
    name: "Shoes_sneakers",
    material: "Shoes",
    include: (v) => isBody(v) && (cat.foot[v] > 0.25 || (cat.shin[v] > 0.25 && tShin(v) > 0.88)),
    place: (v, p, n) => {
      // Semelle : plus épaisse en bas, aplatie au sol.
      const low = 1 - smoothstep(0.0, ankleY * 0.6, p[1]);
      const toes = smoothstep(0.02, 0.09, p[2] - ref.ankleL[2]);
      const d = 0.011 + 0.012 * low + 0.008 * toes;
      const q: V3 = [p[0] + n[0] * d * 1.1, p[1] + n[1] * d, p[2] + n[2] * d * 1.15];
      if (q[1] < 0.004) q[1] = -0.004;
      return q;
    },
    smooth: 10,
    hem: 0.012,
  };

  // ── Cheveux ───────────────────────────────────────────────────────────
  const O = ref.eyeMid;
  const C: V3 = [0, O[1] + 0.03, O[2] - 0.075]; // centre approximatif du crâne
  const scalp = (v: number) => paint[v * 4 + 3];
  const hairDir = (p: V3): V3 => {
    const d: V3 = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
    const l = Math.hypot(...d) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  // Mèches stylisées : bruit étiré dans le sens avant → arrière.
  const strands = (p: V3, scale = 1) => {
    const n1 = valueNoise3(p[0] * 70 * scale, p[1] * 55 * scale, p[2] * 18 * scale);
    const n2 = valueNoise3(p[0] * 160 * scale + 7, p[1] * 120 * scale, p[2] * 40 * scale);
    return 0.7 * n1 + 0.3 * n2;
  };
  const hairInclude = (v: number) => isBody(v) && scalp(v) > 0.02;
  const hairShell = (
    name: string,
    thickness: (v: number, p0: V3, dir: V3, s: number) => number,
    pushForward = 0,
  ): ShellSpec => ({
    name,
    material: "Hair",
    include: hairInclude,
    place: (v, p, n) => {
      const p0 = P(v);
      const dir = hairDir(p0);
      const s = smoothstep(0.02, 0.6, scalp(v));
      const h = 0.0012 + s * thickness(v, p0, dir, s);
      const up = smoothstep(0.2, 0.8, dir[1]) * smoothstep(0, 0.8, dir[2]) * pushForward * s;
      return [p[0] + n[0] * h, p[1] + n[1] * h + up * 0.6, p[2] + n[2] * h + up];
    },
    smooth: 2,
    visible: false,
  });
  const short = hairShell("Hair_short", (v, p0, dir) => {
    const top = smoothstep(-0.1, 0.65, dir[1]);
    return (0.003 + 0.014 * top + 0.006 * smoothstep(0.2, 0.9, dir[2]) * top) * (0.75 + 0.5 * strands(p0));
  });
  const quiff = hairShell(
    "Hair_quiff",
    (v, p0, dir) => {
      const top = smoothstep(0.0, 0.7, dir[1]);
      const fwd = smoothstep(0.1, 0.85, dir[2]) * smoothstep(0.25, 0.75, dir[1]);
      return (0.002 + 0.012 * top + 0.028 * fwd) * (0.8 + 0.4 * strands(p0, 0.8));
    },
    0.012,
  );
  const afro = hairShell("Hair_afro", (v, p0, dir) => {
    const top = smoothstep(-0.3, 0.6, dir[1]);
    return (0.022 + 0.03 * top) * (0.9 + 0.2 * strands(p0, 0.6));
  });
  afro.smooth = 6;
  const slick = hairShell("Hair_bun", (v, p0, dir) => (0.003 + 0.003 * smoothstep(0, 0.7, dir[1])) * (0.85 + 0.3 * strands(p0, 1.4)));

  // ── Barbes ────────────────────────────────────────────────────────────
  const beardMask = (v: number) => paint[v * 4 + 1];
  const chin = (v: number) => {
    const p = P(v);
    return (1 - smoothstep(0.012, 0.045, Math.abs(p[0]))) * smoothstep(-0.02, 0.03, p[2] - O[2] + 0.05);
  };
  const beard = (name: string, include: (v: number) => boolean, h: (v: number, s: number) => number): ShellSpec => ({
    name,
    material: "Beard",
    include: (v) => isBody(v) && include(v),
    place: (v, p, n) => {
      const s = smoothstep(0.05, 0.6, beardMask(v));
      const d = 0.0008 + s * h(v, s);
      const drop = s * chin(v) * h(v, s) * 0.5;
      return [p[0] + n[0] * d, p[1] + n[1] * d - drop, p[2] + n[2] * d];
    },
    smooth: 2,
    visible: false,
  });
  const beardShort = beard("Beard_short", (v) => beardMask(v) > 0.05, (v) => 0.0045 * (0.8 + 0.4 * strands(P(v), 2)));
  const beardFull = beard(
    "Beard_full",
    (v) => beardMask(v) > 0.05,
    (v) => (0.006 + 0.01 * chin(v)) * (0.8 + 0.4 * strands(P(v), 1.5)),
  );
  const goateeZone = (v: number) => {
    const p = P(v);
    const dx = Math.abs(p[0] - O[0]);
    return dx < 0.032 && p[1] - O[1] < -0.05 && p[2] > O[2] - 0.09;
  };
  const goatee = beard("Beard_goatee", (v) => beardMask(v) > 0.05 && goateeZone(v), (v) => (0.005 + 0.008 * chin(v)) * (0.85 + 0.3 * strands(P(v), 2)));

  return [tank, tee, hoodie, shorts, joggers, sneakers, short, quiff, afro, slick, beardShort, beardFull, goatee];
}

/** Centre du crâne (pour placer le chignon). */
export function skullCenter(b: BodyBuild): V3 {
  const O = b.ref.eyeMid;
  return [0, O[1] + 0.03, O[2] - 0.075];
}
