/**
 * Assemblage des meshes du héros à partir du corps MakeHuman :
 * corps, cils, yeux, et "coques" dérivées du corps (cheveux, barbes,
 * vêtements, chaussures). Les coques réutilisent les sommets du corps,
 * donc suivent automatiquement les mêmes morph targets et le même skinning.
 */
import { MUSCLE_GROUPS } from "../../../src/avatar/contract";
import type { BodyBuild } from "./body";
import { boundaryEdges, computeNormals } from "./geometry";
import { fitProxy, parseMhclo, parseObj } from "./makehuman";
import type { MeshData } from "./gltf";

export interface Shared {
  build: BodyBuild;
  joints: Uint16Array;
  weights: Float32Array;
  /** Positions de chaque état de morph (base + delta). */
  states: Map<string, Float32Array>;
  /** Normales du corps pour chaque état. */
  stateNormals: Map<string, Float32Array>;
}

const MORPH_EPS = 2e-5;

export function makeShared(build: BodyBuild, joints: Uint16Array, weights: Float32Array): Shared {
  const states = new Map<string, Float32Array>();
  const stateNormals = new Map<string, Float32Array>();
  const N = build.base.length / 3;
  for (const [name, d] of build.morphs) {
    const p = new Float32Array(build.base.length);
    for (let i = 0; i < p.length; i++) p[i] = build.base[i] + d[i];
    states.set(name, p);
    stateNormals.set(name, computeNormals(p, build.bodyTris, N));
  }
  return { build, joints, weights, states, stateNormals };
}

/** Faces (MakeHuman) → triangles + sommets uniques (v, vt). */
function uniqueVertices(faces: { v: number[]; vt: number[] }[]) {
  const key = new Map<string, number>();
  const src: number[] = [];
  const srcUv: number[] = [];
  const tris: number[] = [];
  const idx = (v: number, vt: number) => {
    const k = `${v}/${vt}`;
    let i = key.get(k);
    if (i === undefined) {
      i = src.length;
      key.set(k, i);
      src.push(v);
      srcUv.push(vt);
    }
    return i;
  };
  for (const f of faces) {
    const ids = f.v.map((v, k) => idx(v, f.vt[k]));
    for (let k = 1; k + 1 < ids.length; k++) tris.push(ids[0], ids[k], ids[k + 1]);
  }
  return { src: Uint32Array.from(src), srcUv: Int32Array.from(srcUv), tris: Uint32Array.from(tris) };
}

const gather = (arr: Float32Array | Uint16Array, src: Uint32Array, size: number) => {
  const out = new (arr.constructor as Float32ArrayConstructor)(src.length * size);
  src.forEach((v, i) => {
    for (let k = 0; k < size; k++) out[i * size + k] = arr[v * size + k];
  });
  return out;
};

function muscleAttributes(build: BodyBuild, src: Uint32Array): MeshData["extra"] {
  const ch = [...MUSCLE_GROUPS.map((m) => build.muscleMask.get(m)!), new Float32Array(build.base.length / 3)];
  const out: NonNullable<MeshData["extra"]> = {};
  ["_MUSCLEA", "_MUSCLEB", "_MUSCLEC"].forEach((name, a) => {
    const arr = new Float32Array(src.length * 4);
    src.forEach((v, i) => {
      for (let k = 0; k < 4; k++) arr[i * 4 + k] = Math.min(1, ch[a * 4 + k][v]);
    });
    out[name] = [arr, 4];
  });
  return out;
}

/** Morphs d'un sous-mesh qui partage les sommets MakeHuman (corps, cils). */
function directMorphs(shared: Shared, src: Uint32Array, tris: Uint32Array, ownNormals: boolean) {
  const { build } = shared;
  const baseN = ownNormals ? computeNormals(gather(build.base, src, 3), tris, src.length) : gather(build.normals, src, 3);
  const morphs: MeshData["morphs"] = [];
  for (const [name, d] of build.morphs) {
    const dp = gather(d, src, 3);
    let max = 0;
    for (const x of dp) max = Math.max(max, Math.abs(x));
    if (max < MORPH_EPS) continue;
    const n = ownNormals
      ? computeNormals(gather(shared.states.get(name)!, src, 3), tris, src.length)
      : gather(shared.stateNormals.get(name)!, src, 3);
    const dn = new Float32Array(n.length);
    for (let i = 0; i < n.length; i++) dn[i] = n[i] - baseN[i];
    morphs.push({ name, position: dp, normal: dn });
  }
  return { baseN, morphs };
}

export function bodyMesh(shared: Shared): MeshData {
  const { build } = shared;
  const { src, srcUv, tris } = uniqueVertices(build.obj.faces.filter((f) => f.group === "body"));
  const { baseN, morphs } = directMorphs(shared, src, tris, false);
  const uvs = new Float32Array(src.length * 2);
  srcUv.forEach((t, i) => {
    uvs[i * 2] = build.obj.uvs[t * 2];
    uvs[i * 2 + 1] = 1 - build.obj.uvs[t * 2 + 1];
  });
  return {
    name: "Body",
    material: "Skin",
    positions: gather(build.base, src, 3),
    normals: baseN,
    uvs,
    indices: tris,
    joints: gather(shared.joints, src, 4) as unknown as Uint16Array,
    weights: gather(shared.weights, src, 4),
    extra: { ...muscleAttributes(build, src), _PAINT: [gather(build.paint, src, 4), 4] },
    morphs,
  };
}

export function lashesMesh(shared: Shared): MeshData {
  const { build } = shared;
  const { src, tris } = uniqueVertices(build.obj.faces.filter((f) => f.group.endsWith("eyelashes-2"))); // cils supérieurs uniquement
  const { baseN, morphs } = directMorphs(shared, src, tris, true);
  return {
    name: "Lashes",
    material: "Lashes",
    positions: gather(build.base, src, 3),
    normals: baseN,
    indices: tris,
    joints: gather(shared.joints, src, 4) as unknown as Uint16Array,
    weights: gather(shared.weights, src, 4),
    morphs,
  };
}

/** Yeux : proxy MakeHuman "high-poly" ajusté, rattaché aux os LeftEye/RightEye. */
export function eyesMesh(shared: Shared, boneIndex: (n: string) => number): MeshData {
  const { build } = shared;
  const obj = parseObj("eyes/high-poly/high-poly.obj");
  const clo = parseMhclo("eyes/high-poly/high-poly.mhclo");
  // Les positions de base sont déjà à l'échelle : on ajuste directement.
  const fitted = fitProxy(clo, build.base);
  // La cornée (coque transparente) échantillonne le disque bleu en bas à droite
  // de la texture MakeHuman : on la retire, l'iris est peint sur le globe.
  const isCornea = (f: { vt: number[] }) => {
    const u = f.vt.reduce((a, t) => a + obj.uvs[t * 2], 0) / f.vt.length;
    const v = f.vt.reduce((a, t) => a + obj.uvs[t * 2 + 1], 0) / f.vt.length;
    return u > 0.85 && v < 0.15;
  };
  const { src, srcUv, tris } = uniqueVertices(obj.faces.filter((f) => !isCornea(f)));
  const positions = gather(fitted, src, 3);
  const normals = computeNormals(positions, tris, src.length);
  const uvs = new Float32Array(src.length * 2);
  srcUv.forEach((t, i) => {
    uvs[i * 2] = obj.uvs[t * 2];
    uvs[i * 2 + 1] = 1 - obj.uvs[t * 2 + 1];
  });
  const joints = new Uint16Array(src.length * 4);
  const weights = new Float32Array(src.length * 4);
  const l = boneIndex("LeftEye"),
    r = boneIndex("RightEye");
  for (let i = 0; i < src.length; i++) {
    joints[i * 4] = positions[i * 3] >= 0 ? l : r;
    weights[i * 4] = 1;
  }
  const morphs: MeshData["morphs"] = [];
  for (const [name, state] of shared.states) {
    const p = gather(fitProxy(clo, state), src, 3);
    const dp = new Float32Array(p.length);
    let max = 0;
    for (let i = 0; i < p.length; i++) {
      dp[i] = p[i] - positions[i];
      max = Math.max(max, Math.abs(dp[i]));
    }
    if (max < MORPH_EPS) continue;
    morphs.push({ name, position: dp, normal: new Float32Array(p.length) });
  }
  return { name: "Eyes", material: "Eye", positions, normals, uvs, indices: tris, joints, weights, morphs };
}

// ─────────────────────────────────────────────────────────────────────────
// Coques dérivées du corps
// ─────────────────────────────────────────────────────────────────────────

export interface ShellSpec {
  name: string;
  material: string;
  /** Sommet MakeHuman inclus ? (une face est gardée si ses 3 sommets le sont) */
  include: (v: number) => boolean;
  /**
   * Position de la coque pour un sommet, à partir de la position et de la
   * normale du corps dans l'état courant.
   */
  place: (v: number, p: [number, number, number], n: [number, number, number]) => [number, number, number];
  /** Itérations de lissage Taubin (tissu qui "efface" l'anatomie fine). */
  smooth?: number;
  /** Ourlet : épaisseur rentrée vers le corps au bord (m). */
  hem?: number;
  visible?: boolean;
}

function taubin(pos: Float32Array, adj: number[][], iterations: number, pinned: Uint8Array) {
  const tmp = new Float32Array(pos.length);
  const step = (lambda: number) => {
    for (let i = 0; i < adj.length; i++) {
      const a = adj[i];
      if (pinned[i] || a.length === 0) {
        tmp[i * 3] = pos[i * 3];
        tmp[i * 3 + 1] = pos[i * 3 + 1];
        tmp[i * 3 + 2] = pos[i * 3 + 2];
        continue;
      }
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (const j of a) s += pos[j * 3 + k];
        const avg = s / a.length;
        tmp[i * 3 + k] = pos[i * 3 + k] + lambda * (avg - pos[i * 3 + k]);
      }
    }
    pos.set(tmp);
  };
  for (let it = 0; it < iterations; it++) {
    step(0.5);
    step(-0.53);
  }
}

export function shellMesh(shared: Shared, spec: ShellSpec): MeshData | null {
  const { build } = shared;
  const faces = build.obj.faces.filter((f) => f.group === "body" && f.v.every(spec.include));
  if (!faces.length) return null;
  const { src, srcUv, tris } = uniqueVertices(faces);
  // Soudure par sommet MakeHuman pour le lissage / les ourlets.
  const weld = new Map<number, number>();
  const weldOf = new Uint32Array(src.length);
  const weldSrc: number[] = [];
  src.forEach((v, i) => {
    let w = weld.get(v);
    if (w === undefined) {
      w = weldSrc.length;
      weld.set(v, w);
      weldSrc.push(v);
    }
    weldOf[i] = w;
  });
  const W = weldSrc.length;
  const wTris = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) wTris[i] = weldOf[tris[i]];
  const adjSet: Set<number>[] = Array.from({ length: W }, () => new Set());
  for (let f = 0; f < wTris.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const a = wTris[f + e],
        b = wTris[f + ((e + 1) % 3)];
      adjSet[a].add(b);
      adjSet[b].add(a);
    }
  }
  const adj = adjSet.map((s) => [...s]);
  const edges = boundaryEdges(wTris);
  const pinned = new Uint8Array(W);
  for (const [a, b] of edges) {
    pinned[a] = 1;
    pinned[b] = 1;
  }

  const rimAdj = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!rimAdj.has(a)) rimAdj.set(a, []);
    if (!rimAdj.has(b)) rimAdj.set(b, []);
    rimAdj.get(a)!.push(b);
    rimAdj.get(b)!.push(a);
  }
  /** Positions soudées de la coque pour un état donné. */
  const shellState = (state: Float32Array, normals: Float32Array) => {
    const out = new Float32Array(W * 3);
    weldSrc.forEach((v, i) => {
      const q = spec.place(
        v,
        [state[v * 3], state[v * 3 + 1], state[v * 3 + 2]],
        [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]],
      );
      out.set(q, i * 3);
    });
    if (spec.smooth) taubin(out, adj, spec.smooth, new Uint8Array(W));
    // Lissage 1D du bord : efface l'escalier des quads coupés.
    if (rimAdj.size) {
      const tmp = new Float32Array(out);
      for (let it = 0; it < 8; it++) {
        for (const [w, nb] of rimAdj) {
          for (let k = 0; k < 3; k++) {
            let s = 0;
            for (const j of nb) s += out[j * 3 + k];
            tmp[w * 3 + k] = out[w * 3 + k] * 0.4 + (s / nb.length) * 0.6;
          }
        }
        out.set(tmp);
      }
    }
    return out;
  };
  // Ourlet : anneau intérieur sous chaque sommet de bord.
  const rimVerts = [...new Set(edges.flat())];
  const rimIndex = new Map(rimVerts.map((w, i) => [w, i]));
  const hem = spec.hem ?? 0;
  const withHem = (shell: Float32Array, normals: Float32Array) => {
    if (!hem) return shell;
    const out = new Float32Array((W + rimVerts.length) * 3);
    out.set(shell);
    rimVerts.forEach((w, i) => {
      const v = weldSrc[w];
      for (let k = 0; k < 3; k++) out[(W + i) * 3 + k] = shell[w * 3 + k] - normals[v * 3 + k] * hem;
    });
    return out;
  };
  const allTris: number[] = [...wTris];
  if (hem) {
    for (const [a, b] of edges) {
      const ia = W + rimIndex.get(a)!,
        ib = W + rimIndex.get(b)!;
      // Le bord (a→b) appartient à une face orientée ; la bande se referme vers l'intérieur.
      allTris.push(b, a, ia, b, ia, ib);
    }
  }
  const T = Uint32Array.from(allTris);
  const total = W + (hem ? rimVerts.length : 0);
  const basePos = withHem(shellState(build.base, build.normals), build.normals);
  const baseN = computeNormals(basePos, T, total);
  const srcAll = Uint32Array.from([...weldSrc, ...(hem ? rimVerts.map((w) => weldSrc[w]) : [])]);
  const morphs: MeshData["morphs"] = [];
  for (const [name, state] of shared.states) {
    const sn = shared.stateNormals.get(name)!;
    const p = withHem(shellState(state, sn), sn);
    const dp = new Float32Array(p.length);
    let max = 0;
    for (let i = 0; i < p.length; i++) {
      dp[i] = p[i] - basePos[i];
      max = Math.max(max, Math.abs(dp[i]));
    }
    if (max < MORPH_EPS) continue;
    const n = computeNormals(p, T, total);
    const dn = new Float32Array(n.length);
    for (let i = 0; i < n.length; i++) dn[i] = n[i] - baseN[i];
    morphs.push({ name, position: dp, normal: dn });
  }
  const uvs = new Float32Array(total * 2);
  // UV approximatives (première UV rencontrée par sommet soudé).
  srcUv.forEach((t, i) => {
    const w = weldOf[i];
    uvs[w * 2] = build.obj.uvs[t * 2];
    uvs[w * 2 + 1] = 1 - build.obj.uvs[t * 2 + 1];
  });
  return {
    name: spec.name,
    material: spec.material,
    positions: basePos,
    normals: baseN,
    uvs,
    indices: T,
    joints: gather(shared.joints, srcAll, 4) as unknown as Uint16Array,
    weights: gather(shared.weights, srcAll, 4),
    extra: muscleAttributes(build, srcAll),
    morphs,
    visible: spec.visible,
  };
}

/** Mesh rigide simple (prop, chignon) rattaché à un os unique. */
export function rigidMesh(
  name: string,
  material: string,
  positions: Float32Array,
  indices: Uint32Array,
  bone: number,
  visible = false,
): MeshData {
  const n = positions.length / 3;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    joints[i * 4] = bone;
    weights[i * 4] = 1;
  }
  return {
    name,
    material,
    positions,
    normals: computeNormals(positions, indices, n),
    indices,
    joints,
    weights,
    morphs: [],
    visible,
  };
}
