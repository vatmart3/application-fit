/**
 * Lecture des formats MakeHuman : .obj (maillage de base hm08), .target
 * (deltas de sommets creux), .mhskel (squelette JSON), .mhw (poids) et
 * .mhclo (proxys ajustés sur le maillage de base, ex. les yeux).
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../config";

export type Vec3 = [number, number, number];

export interface ObjMesh {
  /** Positions brutes (3 floats / sommet), unités MakeHuman (dm). */
  positions: Float32Array;
  uvs: Float32Array;
  /** Faces : indices de position + indices d'UV, groupe d'appartenance. */
  faces: { v: number[]; vt: number[]; group: string }[];
}

const read = (rel: string) => fs.readFileSync(path.join(CACHE_DIR, rel), "utf8");

export function parseObj(rel: string): ObjMesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const faces: ObjMesh["faces"] = [];
  let group = "default";
  for (const line of read(rel).split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(+x, +y, +z);
    } else if (line.startsWith("vt ")) {
      const [, u, v] = line.trim().split(/\s+/);
      uv.push(+u, +v);
    } else if (line.startsWith("g ")) {
      group = line.slice(2).trim();
    } else if (line.startsWith("f ")) {
      const parts = line.trim().split(/\s+/).slice(1);
      const v: number[] = [];
      const vt: number[] = [];
      for (const p of parts) {
        const [a, b] = p.split("/");
        v.push(+a - 1);
        vt.push(b ? +b - 1 : -1);
      }
      faces.push({ v, vt, group });
    }
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), faces };
}

/** Target creuse : index de sommet → delta. */
export type Target = Map<number, Vec3>;

export function parseTarget(rel: string): Target {
  const t: Target = new Map();
  for (const line of read(rel).split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [i, x, y, z] = line.trim().split(/\s+/);
    if (z === undefined) continue;
    t.set(+i, [+x, +y, +z]);
  }
  return t;
}

/** Applique `w × target` sur un tableau de positions (en place). */
export function applyTarget(positions: Float32Array, t: Target, w: number) {
  if (w === 0) return;
  for (const [i, d] of t) {
    positions[i * 3] += d[0] * w;
    positions[i * 3 + 1] += d[1] * w;
    positions[i * 3 + 2] += d[2] * w;
  }
}

export interface MhSkeleton {
  bones: Record<string, { head: string; tail: string; parent: string | null }>;
  joints: Record<string, number[]>;
}

export function parseSkeleton(rel: string): MhSkeleton {
  return JSON.parse(read(rel));
}

/** Poids : os MakeHuman → liste [indexSommet, poids]. */
export function parseWeights(rel: string): Record<string, [number, number][]> {
  return JSON.parse(read(rel)).weights;
}

/** Position moyenne d'un groupe de sommets (définition des articulations MakeHuman). */
export function jointPosition(positions: Float32Array, verts: number[]): Vec3 {
  const p: Vec3 = [0, 0, 0];
  for (const v of verts) {
    p[0] += positions[v * 3];
    p[1] += positions[v * 3 + 1];
    p[2] += positions[v * 3 + 2];
  }
  return [p[0] / verts.length, p[1] / verts.length, p[2] / verts.length];
}

export interface Mhclo {
  /** Par sommet du proxy : 3 sommets de référence, 3 poids, offset. */
  refs: { v: [number, number, number]; w: Vec3; d: Vec3 }[];
  scale: { x: [number, number, number]; y: [number, number, number]; z: [number, number, number] };
}

export function parseMhclo(rel: string): Mhclo {
  const refs: Mhclo["refs"] = [];
  const scale = {} as Mhclo["scale"];
  let inVerts = false;
  for (const raw of read(rel).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "x_scale" || parts[0] === "y_scale" || parts[0] === "z_scale") {
      scale[parts[0][0] as "x" | "y" | "z"] = [+parts[1], +parts[2], +parts[3]];
      continue;
    }
    if (parts[0] === "verts") {
      inVerts = true;
      continue;
    }
    if (inVerts) {
      if (parts.length === 9) {
        refs.push({
          v: [+parts[0], +parts[1], +parts[2]],
          w: [+parts[3], +parts[4], +parts[5]],
          d: [+parts[6], +parts[7], +parts[8]],
        });
      } else if (parts.length === 1) {
        // Sommet attaché rigidement à un seul sommet de référence.
        refs.push({ v: [+parts[0], +parts[0], +parts[0]], w: [1, 0, 0], d: [0, 0, 0] });
      } else {
        inVerts = false;
      }
    }
  }
  return { refs, scale };
}

/** Ajuste un proxy MakeHuman sur des positions de maillage de base (formule de proxy.py). */
export function fitProxy(clo: Mhclo, base: Float32Array): Float32Array {
  const axisScale = (s: [number, number, number], axis: number) => {
    const [a, b, den] = s;
    return Math.abs(base[a * 3 + axis] - base[b * 3 + axis]) / den;
  };
  const sx = axisScale(clo.scale.x, 0);
  const sy = axisScale(clo.scale.y, 1);
  const sz = axisScale(clo.scale.z, 2);
  const out = new Float32Array(clo.refs.length * 3);
  clo.refs.forEach((r, i) => {
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] =
        r.w[0] * base[r.v[0] * 3 + k] + r.w[1] * base[r.v[1] * 3 + k] + r.w[2] * base[r.v[2] * 3 + k];
    }
    out[i * 3] += r.d[0] * sx;
    out[i * 3 + 1] += r.d[1] * sy;
    out[i * 3 + 2] += r.d[2] * sz;
  });
  return out;
}

export const loadTarget = (name: string) => parseTarget(`targets/${name}.target`);
