/** Utilitaires géométriques du pipeline (pas de dépendance à three pour rester rapide). */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Normales lissées par accumulation des normales de faces (pondérées par l'aire).
 * `tris` indexe directement `positions`.
 */
export function computeNormals(positions: Float32Array, tris: Uint32Array, vertexCount: number): Float32Array {
  const n = new Float32Array(vertexCount * 3);
  for (let f = 0; f < tris.length; f += 3) {
    const a = tris[f] * 3,
      b = tris[f + 1] * 3,
      c = tris[f + 2] * 3;
    const abx = positions[b] - positions[a],
      aby = positions[b + 1] - positions[a + 1],
      abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a],
      acy = positions[c + 1] - positions[a + 1],
      acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < vertexCount; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    n[i * 3] /= l;
    n[i * 3 + 1] /= l;
    n[i * 3 + 2] /= l;
  }
  return n;
}

/** Bruit de valeur 3D déterministe (pour les mèches de cheveux). */
function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}
export function valueNoise3(x: number, y: number, z: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf),
    v = s(yf),
    w = s(zf);
  let acc = 0;
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = 0; dz <= 1; dz++) {
        const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        acc += wt * hash3(xi + dx, yi + dy, zi + dz);
      }
  return acc;
}

/** Arêtes de bord d'un ensemble de triangles (arêtes utilisées par une seule face). */
export function boundaryEdges(tris: Uint32Array): [number, number][] {
  const count = new Map<string, [number, number, number]>();
  for (let f = 0; f < tris.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[f + e],
        b = tris[f + ((e + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const cur = count.get(key);
      if (cur) cur[2]++;
      else count.set(key, [a, b, 1]);
    }
  }
  const out: [number, number][] = [];
  for (const [a, b, c] of count.values()) if (c === 1) out.push([a, b]);
  return out;
}
