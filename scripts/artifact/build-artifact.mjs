/**
 * Construit une version autonome du Labo (sans serveur Next) dans
 * .cache/artifact/dist : index.html, bundle.js, style.css, models/*.glb.txt.
 * Les GLB y sont décompressés (sans meshopt ni quantification) : aucun
 * décodeur WebAssembly requis, et les morph targets restent exacts
 * (la quantification fait percer la peau sous les vêtements).
 *
 * Usage : npm run artifact:build
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { dedup, sparse } from "@gltf-transform/functions";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, ".cache/artifact/dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "models"), { recursive: true });

// 1. JavaScript
await build({
  entryPoints: [path.join(root, "src/artifact/main.tsx")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  outfile: path.join(out, "bundle.js"),
  alias: { "@": path.join(root, "src") },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_MODEL_BASE": '"models"',
    "process.env.NEXT_PUBLIC_MODEL_FORMAT": '"base64"',
  },
  logLevel: "warning",
});

// 2. CSS (Tailwind) : globals.css sans les @fontsource (Google Fonts dans la page).
const css = fs
  .readFileSync(path.join(root, "src/app/globals.css"), "utf8")
  .replace(/@import "@fontsource[^\n]*\n/g, "")
  .replace('@import "tailwindcss";', `@import "tailwindcss";\n@source "${path.join(root, "src")}";`);
const tmp = path.join(root, ".cache/artifact/in.css");
fs.writeFileSync(tmp, css);
execFileSync("npx", ["@tailwindcss/cli", "-i", tmp, "-o", path.join(out, "style.css"), "--minify"], { cwd: root, stdio: "inherit" });

// 3. Modèles : meshopt → flottants + accessors creux.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const g of ["m", "f"]) {
  const doc = await io.read(path.join(root, `public/models/hero-${g}.glb`));
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === "EXT_meshopt_compression") ext.dispose();
  await doc.transform(dedup(), sparse({ ratio: 1 / 3 }));
  // L'hébergeur d'artefacts ne sert pas les .glb : base64 dans un .txt.
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(path.join(out, `models/hero-${g}.glb.txt`), Buffer.from(glb).toString("base64"));
}
fs.copyFileSync(path.join(root, "public/models/LICENSE-MakeHuman-CC0.md"), path.join(out, "models/LICENSE-MakeHuman-CC0.md"));

// 4. Page
fs.writeFileSync(
  path.join(out, "index.html"),
  `<title>MUE</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Chakra+Petch:wght@400;500;700&display=swap">
<link rel="stylesheet" href="style.css">
<style>
  /* Univers de jeu sombre assumé : un seul thème, couleurs explicites. */
  :root { color-scheme: dark; --boot-bg: #05080f; --boot-fg: #f6ecd9; --boot-accent: #ff6a1a; }
  html, body { height: 100%; background: var(--boot-bg); color: var(--boot-fg); }
  #boot { position: fixed; inset: 0; display: grid; place-items: center; font: 700 14px "Chakra Petch", system-ui, sans-serif; letter-spacing: .3em; text-transform: uppercase; color: var(--boot-accent); }
</style>
<div id="root"><div id="boot">Chargement du héros…</div></div>
<script type="module" src="bundle.js"></script>
`,
);
for (const f of ["bundle.js", "style.css", "models/hero-m.glb.txt", "models/hero-f.glb.txt"]) {
  console.log(`${f.padEnd(20)} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)} Ko`);
}
