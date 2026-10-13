/** Géométries procédurales simples : barre olympique et chignon. */

interface Geo {
  positions: number[];
  indices: number[];
}

/** Cylindre le long de l'axe X, centré en (cx, 0, 0). */
function cylinderX(g: Geo, cx: number, length: number, radius: number, seg = 20, cap = true) {
  const start = g.positions.length / 3;
  const x0 = cx - length / 2,
    x1 = cx + length / 2;
  for (const x of [x0, x1]) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      g.positions.push(x, Math.cos(a) * radius, Math.sin(a) * radius);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = start + i,
      b = start + ((i + 1) % seg),
      c = start + seg + i,
      d = start + seg + ((i + 1) % seg);
    g.indices.push(a, c, b, b, c, d);
  }
  if (cap) {
    for (const [ring, dir] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const center = g.positions.length / 3;
      g.positions.push(ring ? x1 : x0, 0, 0);
      for (let i = 0; i < seg; i++) {
        const a = start + ring * seg + i,
          b = start + ring * seg + ((i + 1) % seg);
        if (dir > 0) g.indices.push(center, a, b);
        else g.indices.push(center, b, a);
      }
    }
  }
}

/** Barre olympique 20 kg + 2 disques de chaque côté, centrée à l'origine (axe X). */
export function barbell() {
  const bar: Geo = { positions: [], indices: [] };
  const plates: Geo = { positions: [], indices: [] };
  cylinderX(bar, 0, 1.31, 0.0145, 16, false); // manche
  for (const s of [-1, 1]) {
    cylinderX(bar, s * 0.68, 0.05, 0.03, 16); // bague
    cylinderX(bar, s * 0.92, 0.42, 0.025, 16); // manchon
    cylinderX(plates, s * 0.745, 0.055, 0.225, 32); // disque 20 kg
    cylinderX(plates, s * 0.795, 0.04, 0.2, 32); // disque 15 kg
  }
  return {
    bar: { positions: Float32Array.from(bar.positions), indices: Uint32Array.from(bar.indices) },
    plates: { positions: Float32Array.from(plates.positions), indices: Uint32Array.from(plates.indices) },
  };
}

/** Sphère UV légèrement aplatie (chignon). */
export function bun(center: [number, number, number], radius: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 14,
    seg = 20;
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      // Légères torsions pour suggérer l'enroulement des cheveux.
      const twist = 1 + 0.06 * Math.sin(th * 3 + phi * 4);
      positions.push(
        center[0] + Math.sin(phi) * Math.cos(th) * radius * twist,
        center[1] + Math.cos(phi) * radius * 0.85,
        center[2] + Math.sin(phi) * Math.sin(th) * radius * twist * 0.9,
      );
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s,
        b = r * seg + ((s + 1) % seg),
        c = (r + 1) * seg + s,
        d = (r + 1) * seg + ((s + 1) % seg);
      indices.push(a, b, c, b, d, c);
    }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}
