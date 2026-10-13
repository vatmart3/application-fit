/**
 * Télécharge les sources MakeHuman (CC0) nécessaires à la génération du héros
 * dans .cache/makehuman/. Idempotent : les fichiers déjà présents sont ignorés.
 *
 * Usage : npm run character:fetch
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, MAKEHUMAN_FILES, MAKEHUMAN_RAW } from "./config";

async function download(rel: string): Promise<"ok" | "skip"> {
  const dest = path.join(CACHE_DIR, rel.replace(/^(\.\.\/)+/, ""));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return "skip";
  const res = await fetch(`${MAKEHUMAN_RAW}/${rel}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${rel}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return "ok";
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let fetched = 0;
  // Téléchargements par paquets de 8 pour rester raisonnable.
  for (let i = 0; i < MAKEHUMAN_FILES.length; i += 8) {
    const batch = MAKEHUMAN_FILES.slice(i, i + 8);
    const results = await Promise.all(batch.map(download));
    fetched += results.filter((r) => r === "ok").length;
  }
  console.log(`MakeHuman : ${fetched} fichier(s) téléchargé(s), ${MAKEHUMAN_FILES.length - fetched} déjà en cache → ${CACHE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
