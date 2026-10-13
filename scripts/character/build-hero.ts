/**
 * Génère public/models/hero-m.glb et hero-f.glb : personnage riggé
 * (squelette Mixamo), morph targets musculaires, apparence (cheveux, barbes,
 * tenues), barre olympique et animations.
 *
 * Usage : npm run character:build   (après npm run character:fetch)
 */
import fs from "node:fs";
import path from "node:path";
import { dedup, prune, sparse } from "@gltf-transform/functions";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import { meshopt } from "@gltf-transform/functions";
import { CACHE_DIR, OUT_DIR } from "./config";
import { buildBody, type Gender } from "./lib/body";
import { mergeWeights } from "./lib/skeleton";
import { bodyMesh, eyesMesh, lashesMesh, makeShared, rigidMesh, shellMesh } from "./lib/assemble";
import { HeroDocument } from "./lib/gltf";
import { shellSpecs, skullCenter } from "./lib/styles";
import { barbell, bun } from "./lib/props";
import { buildClips } from "./lib/animation/clips";

const args = new Set(process.argv.slice(2));

async function buildGender(gender: Gender) {
  const t0 = Date.now();
  const build = buildBody(gender);
  const N = build.base.length / 3;
  const { joints, weights } = mergeWeights(build.mhWeights, build.bones, N);
  const shared = makeShared(build, joints, weights);
  const boneIndex = (n: string) => build.bones.findIndex((b) => b.name === n);

  const hero = new HeroDocument();
  hero.addSkeleton(build.bones);
  // Matériaux "neutres" : l'app les remplace par ses shaders stylisés (par nom).
  const mats: [string, [number, number, number], number, number, boolean?][] = [
    ["Skin", [0.8, 0.55, 0.42], 0.55, 0],
    ["Eye", [1, 1, 1], 0.2, 0],
    ["Lashes", [0.05, 0.03, 0.02], 0.8, 0, true],
    ["Hair", [0.08, 0.05, 0.03], 0.6, 0, true],
    ["Beard", [0.08, 0.05, 0.03], 0.7, 0, true],
    ["Top_tank", [0.92, 0.42, 0.12], 0.75, 0, true],
    ["Top_tee", [0.1, 0.14, 0.24], 0.8, 0, true],
    ["Top_hoodie", [0.85, 0.78, 0.62], 0.85, 0, true],
    ["Bottom_shorts", [0.06, 0.08, 0.14], 0.7, 0, true],
    ["Bottom_joggers", [0.2, 0.22, 0.26], 0.85, 0, true],
    ["Shoes", [0.95, 0.95, 0.92], 0.5, 0, true],
    ["Metal", [0.7, 0.72, 0.75], 0.3, 1],
    ["Plate", [0.08, 0.08, 0.1], 0.6, 0.1],
  ];
  for (const [name, c, roughness, metalness, doubleSided] of mats)
    hero.addMaterial({ name, color: [...c, 1], roughness, metalness, doubleSided });

  hero.addMesh(bodyMesh(shared));
  hero.addMesh(lashesMesh(shared));
  hero.addMesh(eyesMesh(shared, boneIndex));
  for (const spec of shellSpecs(build)) {
    const mesh = shellMesh(shared, spec);
    if (mesh) hero.addMesh(mesh);
    else console.warn(`  ⚠ coque vide : ${spec.name}`);
  }
  // Chignon : sphère rattachée à la tête (visible avec Hair_bun).
  const sc = skullCenter(build);
  const b = bun([0, sc[1] + 0.06, sc[2] - 0.075], 0.042);
  hero.addMesh(rigidMesh("Hair_bun_knot", "Hair", b.positions, b.indices, boneIndex("Head")));
  const bb = barbell();
  hero.addMesh(rigidMesh("Prop_Barbell", "Metal", bb.bar.positions, bb.bar.indices, boneIndex("Prop")));
  hero.addMesh(rigidMesh("Prop_Barbell_plates", "Plate", bb.plates.positions, bb.plates.indices, boneIndex("Prop")));

  if (!args.has("--no-anim")) for (const clip of buildClips(build.bones)) hero.addClip(clip);

  // Métadonnées utiles au runtime.
  hero.root.setExtras({
    heroHeight: build.base.reduce((m, v, i) => (i % 3 === 1 && i / 3 < 13380 ? Math.max(m, v) : m), 0),
    gender,
    source: "MakeHuman 1.x (CC0) — pipeline MUE",
  });

  await hero.doc.transform(dedup(), prune({ keepAttributes: true, keepExtras: true }), sparse({ ratio: 1 / 3 }));
  if (!args.has("--raw")) {
    await MeshoptEncoder.ready;
    await hero.doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  }
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `hero-${gender}.glb`);
  await io.write(out, hero.doc);
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`✔ ${path.relative(process.cwd(), out)} — ${kb} Ko — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function main() {
  const genders: Gender[] = args.has("--m") ? ["m"] : args.has("--f") ? ["f"] : ["m", "f"];
  for (const g of genders) await buildGender(g);
  // Les modèles dérivent d'assets MakeHuman CC0 : on livre la licence avec eux.
  fs.copyFileSync(path.join(CACHE_DIR, "LICENSE.ASSETS.md"), path.join(OUT_DIR, "LICENSE-MakeHuman-CC0.md"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
