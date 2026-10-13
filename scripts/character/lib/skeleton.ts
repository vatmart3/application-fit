/**
 * Squelette du héros : 55 os aux noms Mixamo (dont LeftEye, RightEye et Prop), construits à partir des
 * articulations MakeHuman. Les poids MakeHuman (163 os) sont fusionnés.
 * Pose de repos = A-pose MakeHuman, rotations de repos identité (repères
 * alignés sur le monde), ce qui simplifie l'écriture des animations.
 */
import type { MhSkeleton, Vec3 } from "./makehuman";
import { jointPosition } from "./makehuman";
import { FINGERS, SIDES } from "../../../src/avatar/contract";

export interface Bone {
  name: string;
  parent: string | null;
  /** Position de la tête de l'os (monde, repos). */
  head: Vec3;
  /** Extrémité (sert à la direction de l'os pour l'IK / la pose). */
  tail: Vec3;
}

type MhSide = "L" | "R";
const mhSide = (s: (typeof SIDES)[number]): MhSide => (s === "Left" ? "L" : "R");

/** Fusion des os MakeHuman → os du héros (avec répartition éventuelle). */
export function boneMapping(): Record<string, [string, number][]> {
  const map: Record<string, [string, number][]> = {
    root: [["Hips", 1]],
    spine05: [["Hips", 1]],
    spine04: [["Spine", 1]],
    spine03: [["Spine1", 1]],
    spine02: [["Spine2", 1]],
    spine01: [["Spine2", 1]],
    neck01: [["Neck", 1]],
    neck02: [["Neck", 1]],
    neck03: [["Neck", 0.5], ["Head", 0.5]],
  };
  const face = [
    "head", "jaw", "special01", "special03", "special04", "oris01", "oris02", "oris05", "oris06", "tongue00", "tongue01",
    "tongue02", "tongue03", "tongue04",
  ];
  for (const f of face) map[f] = [["Head", 1]];
  const sidedFace = [
    "special05", "special06", "levator02", "levator03", "levator04", "levator05", "levator06", "oculi01", "oculi02",
    "orbicularis03", "orbicularis04", "oris03", "oris04", "oris06", "oris07", "risorius02", "risorius03", "temporalis01",
    "temporalis02", "tongue05", "tongue06", "tongue07",
  ];
  for (const side of SIDES) {
    const s = mhSide(side);
    for (const f of sidedFace) map[`${f}.${s}`] = [["Head", 1]];
    map[`eye.${s}`] = [[`${side}Eye`, 1]];
    map[`breast.${s}`] = [["Spine2", 1]];
    map[`clavicle.${s}`] = [[`${side}Shoulder`, 1]];
    map[`shoulder01.${s}`] = [[`${side}Shoulder`, 0.4], [`${side}Arm`, 0.6]];
    map[`upperarm01.${s}`] = [[`${side}Arm`, 1]];
    map[`upperarm02.${s}`] = [[`${side}Arm`, 1]];
    map[`lowerarm01.${s}`] = [[`${side}ForeArm`, 1]];
    map[`lowerarm02.${s}`] = [[`${side}ForeArm`, 1]];
    map[`wrist.${s}`] = [[`${side}Hand`, 1]];
    for (let m = 1; m <= 4; m++) map[`metacarpal${m}.${s}`] = [[`${side}Hand`, 1]];
    FINGERS.forEach((finger, fi) => {
      for (let k = 1; k <= 3; k++) map[`finger${fi + 1}-${k}.${s}`] = [[`${side}Hand${finger}${k}`, 1]];
    });
    map[`pelvis.${s}`] = [["Hips", 1]];
    map[`upperleg01.${s}`] = [[`${side}UpLeg`, 1]];
    map[`upperleg02.${s}`] = [[`${side}UpLeg`, 1]];
    map[`lowerleg01.${s}`] = [[`${side}Leg`, 1]];
    map[`lowerleg02.${s}`] = [[`${side}Leg`, 1]];
    map[`foot.${s}`] = [[`${side}Foot`, 1]];
    for (let t = 1; t <= 5; t++) for (let k = 1; k <= 3; k++) map[`toe${t}-${k}.${s}`] = [[`${side}ToeBase`, 1]];
  }
  return map;
}

/** Construit le squelette du héros à partir des positions (déjà mises à l'échelle). */
export function buildSkeleton(mh: MhSkeleton, positions: Float32Array): Bone[] {
  const J = (bone: string, end: "head" | "tail"): Vec3 =>
    jointPosition(positions, mh.joints[mh.bones[bone][end]]);
  const bones: Bone[] = [];
  const add = (name: string, parent: string | null, head: Vec3, tail: Vec3) =>
    bones.push({ name, parent, head, tail });

  add("Hips", null, J("spine05", "head"), J("spine04", "head"));
  add("Spine", "Hips", J("spine04", "head"), J("spine03", "head"));
  add("Spine1", "Spine", J("spine03", "head"), J("spine02", "head"));
  add("Spine2", "Spine1", J("spine02", "head"), J("neck01", "head"));
  add("Neck", "Spine2", J("neck01", "head"), J("head", "head"));
  add("Head", "Neck", J("head", "head"), J("head", "tail"));
  for (const side of SIDES) {
    const s = mhSide(side);
    add(`${side}Eye`, "Head", J(`eye.${s}`, "head"), J(`eye.${s}`, "tail"));
    add(`${side}Shoulder`, "Spine2", J(`clavicle.${s}`, "head"), J(`upperarm01.${s}`, "head"));
    add(`${side}Arm`, `${side}Shoulder`, J(`upperarm01.${s}`, "head"), J(`lowerarm01.${s}`, "head"));
    add(`${side}ForeArm`, `${side}Arm`, J(`lowerarm01.${s}`, "head"), J(`wrist.${s}`, "head"));
    add(`${side}Hand`, `${side}ForeArm`, J(`wrist.${s}`, "head"), J(`finger3-1.${s}`, "head"));
    FINGERS.forEach((finger, fi) => {
      for (let k = 1; k <= 3; k++) {
        const mhName = `finger${fi + 1}-${k}.${s}`;
        add(`${side}Hand${finger}${k}`, k === 1 ? `${side}Hand` : `${side}Hand${finger}${k - 1}`, J(mhName, "head"), J(mhName, "tail"));
      }
    });
    add(`${side}UpLeg`, "Hips", J(`upperleg01.${s}`, "head"), J(`lowerleg01.${s}`, "head"));
    add(`${side}Leg`, `${side}UpLeg`, J(`lowerleg01.${s}`, "head"), J(`foot.${s}`, "head"));
    add(`${side}Foot`, `${side}Leg`, J(`foot.${s}`, "head"), J(`toe3-1.${s}`, "head"));
    add(`${side}ToeBase`, `${side}Foot`, J(`toe3-1.${s}`, "head"), J(`toe3-3.${s}`, "tail"));
  }
  // Os du prop (barre olympique) : racine indépendante, piloté par les animations.
  add("Prop", null, [0, 0, 0], [0, 0.1, 0]);
  return bones;
}

/**
 * Poids fusionnés : 4 influences max par sommet, normalisées.
 * Retourne JOINTS_0 / WEIGHTS_0 pour `vertexCount` sommets MakeHuman.
 */
export function mergeWeights(
  mhWeights: Record<string, [number, number][]>,
  bones: Bone[],
  vertexCount: number,
): { joints: Uint16Array; weights: Float32Array } {
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const mapping = boneMapping();
  const acc: Map<number, number>[] = Array.from({ length: vertexCount }, () => new Map());
  for (const [mhBone, list] of Object.entries(mhWeights)) {
    const targets = mapping[mhBone];
    if (!targets) throw new Error(`Os MakeHuman non mappé : ${mhBone}`);
    for (const [v, w] of list) {
      for (const [target, share] of targets) {
        const j = index.get(target);
        if (j === undefined) throw new Error(`Os cible inconnu : ${target}`);
        acc[v].set(j, (acc[v].get(j) ?? 0) + w * share);
      }
    }
  }
  const joints = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  const head = index.get("Head")!;
  for (let v = 0; v < vertexCount; v++) {
    const top = [...acc[v].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0);
    if (sum === 0) {
      // Sommet sans poids (rare : helpers) → rattaché à la tête par défaut.
      joints[v * 4] = head;
      weights[v * 4] = 1;
      continue;
    }
    top.forEach(([j, w], k) => {
      joints[v * 4 + k] = j;
      weights[v * 4 + k] = w / sum;
    });
  }
  return { joints, weights };
}
