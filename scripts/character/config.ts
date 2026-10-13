/**
 * Configuration du pipeline personnage.
 * Sources : MakeHuman 1.x (assets CC0 depuis septembre 2020), commit épinglé
 * pour que la génération soit reproductible.
 */
import path from "node:path";

export const MAKEHUMAN_COMMIT = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482";
export const MAKEHUMAN_RAW = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${MAKEHUMAN_COMMIT}/makehuman/data`;

export const ROOT = path.resolve(__dirname, "../..");
export const CACHE_DIR = path.join(ROOT, ".cache/makehuman");
export const OUT_DIR = path.join(ROOT, "public/models");

const macro = (g: "male" | "female", muscle: string, weight: string) =>
  `targets/macrodetails/universal-${g}-young-${muscle}muscle-${weight}weight.target`;

const both = (p: string) => [p.replace("{s}", "l"), p.replace("{s}", "r")];

/** Fichiers MakeHuman nécessaires (chemins relatifs à makehuman/data). */
export const MAKEHUMAN_FILES: string[] = [
  "3dobjs/base.obj",
  "rigs/default.mhskel",
  "rigs/default_weights.mhw",
  "eyes/high-poly/high-poly.obj",
  "eyes/high-poly/high-poly.mhclo",
  ...(["male", "female"] as const).flatMap((g) => [
    macro(g, "average", "average"),
    macro(g, "max", "average"),
    macro(g, "min", "average"),
    macro(g, "average", "min"),
    macro(g, "average", "max"),
    macro(g, "max", "min"),
    `targets/macrodetails/proportions/${g}-young-averagemuscle-averageweight-idealproportions.target`,
    ...["african", "asian", "caucasian"].map((r) => `targets/macrodetails/${r}-${g}-young.target`),
  ]),
  ...both("targets/armslegs/{s}-upperarm-muscle-incr.target"),
  ...both("targets/armslegs/{s}-upperarm-shoulder-muscle-incr.target"),
  ...both("targets/armslegs/{s}-lowerarm-muscle-incr.target"),
  ...both("targets/armslegs/{s}-upperleg-muscle-incr.target"),
  ...both("targets/armslegs/{s}-lowerleg-muscle-incr.target"),
  ...both("targets/armslegs/{s}-hand-scale-incr.target"),
  ...both("targets/armslegs/{s}-foot-scale-incr.target"),
  "targets/armslegs/upperlegs-height-incr.target",
  "targets/armslegs/lowerlegs-height-incr.target",
  "targets/torso/torso-muscle-pectoral-incr.target",
  "targets/torso/torso-muscle-dorsi-incr.target",
  "targets/torso/torso-vshape-incr.target",
  "targets/torso/torso-scale-depth-incr.target",
  "targets/torso/torso-scale-horiz-incr.target",
  "targets/buttocks/buttocks-volume-incr.target",
  "targets/stomach/stomach-pregnant-decr.target",
  "targets/stomach/stomach-pregnant-incr.target",
  "targets/neck/neck-scale-horiz-incr.target",
  "targets/head/head-scale-horiz-decr.target",
  "targets/head/head-scale-vert-decr.target",
  "targets/head/head-square.target",
  "targets/head/head-round.target",
  "targets/head/head-oval.target",
  "targets/head/head-scale-vert-incr.target",
  "targets/chin/chin-width-incr.target",
  "targets/chin/chin-bones-incr.target",
  "targets/chin/chin-prominent-incr.target",
  ...both("targets/cheek/{s}-cheek-bones-incr.target"),
  ...both("targets/cheek/{s}-cheek-volume-decr.target"),
  "targets/nose/nose-scale-horiz-incr.target",
  "targets/nose/nose-scale-vert-incr.target",
  "targets/eyebrows/eyebrows-trans-forward.target",
  "targets/eyebrows/eyebrows-angle-down.target",
  ...["eye-left-closure", "eye-right-closure", "eyebrows-left-inner-up", "eyebrows-right-inner-up", "mouth-corner-puller", "eyebrows-left-down", "eyebrows-right-down"].map(
    (u) => `targets/expression/units/caucasian/${u}.target`,
  ),
  "../../LICENSE.ASSETS.md",
];

/** Taille de référence du héros généré (m). L'app la remet à l'échelle de l'utilisateur. */
export const HERO_HEIGHT = { m: 1.8, f: 1.68 } as const;
