/**
 * Contrat partagé entre le pipeline de génération du personnage
 * (scripts/character/*) et le moteur de rendu (src/avatar/*).
 *
 * Tout modèle GLB du héros — le placeholder procédural généré à partir de
 * MakeHuman OU un futur modèle exporté de Blender/MPFB2 — DOIT respecter
 * ces noms : morph targets, clips d'animation, os et meshes.
 * C'est ce qui permet de remplacer le modèle sans toucher au reste de l'app.
 */

/** Les 11 groupes musculaires suivis par le moteur d'évolution. */
export const MUSCLE_GROUPS = [
  "pecs",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "quads",
  "hamstrings",
  "calves",
  "glutes",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Libellés FR affichés dans l'UI. */
export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecs: "Pectoraux",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Avant-bras",
  abs: "Abdos",
  quads: "Quadriceps",
  hamstrings: "Ischios",
  calves: "Mollets",
  glutes: "Fessiers",
};

/** Morph targets "muscle" : un par groupe, préfixé pour éviter les collisions. */
export const muscleMorph = (g: MuscleGroup) => `muscle_${g}` as const;

/** Morph targets de composition corporelle et d'état. */
export const BODY_MORPHS = [
  "lean", // sécheresse : taille affinée, graisse sous-cutanée réduite
  "fat", // masse grasse élevée
  "cut", // interaction muscle × sécheresse (abdos dessinés, séparations)
  "breath", // inspiration (piloté en code, pas dans les clips)
  "fatigue", // paupières lourdes, sourcils tombants (reste sympathique)
  "smile", // sourire (victoire, level-up)
  "blink", // clignement
  "cheeks_hollow", // joues creusées (suit la définition)
] as const;
export type BodyMorph = (typeof BODY_MORPHS)[number];

/** Morph targets de visage pour le créateur de personnage. */
export const FACE_MORPHS = [
  "face_square",
  "face_round",
  "face_long",
  "jaw_wide",
  "cheekbones",
  "nose_wide",
  "nose_long",
  "brow_heavy",
] as const;
export type FaceMorph = (typeof FACE_MORPHS)[number];

export const ALL_MORPHS: readonly string[] = [
  ...MUSCLE_GROUPS.map(muscleMorph),
  ...BODY_MORPHS,
  ...FACE_MORPHS,
];

/** Clips d'animation embarqués dans le GLB. */
export const CLIPS = [
  "idle",
  "idle_tired",
  "flex",
  "victory",
  "squat",
  "press",
  "deadlift",
  "punch",
  "run",
  "level_up",
] as const;
export type ClipName = (typeof CLIPS)[number];

/** Clips joués une seule fois (puis retour à l'idle). Les autres bouclent. */
export const ONE_SHOT_CLIPS: readonly ClipName[] = ["flex", "victory", "level_up"];

/** Clips qui affichent la barre olympique (prop). */
export const BARBELL_CLIPS: readonly ClipName[] = ["squat", "press", "deadlift"];

/** Libellés FR des clips. */
export const CLIP_LABELS: Record<ClipName, string> = {
  idle: "Idle respirant",
  idle_tired: "Idle fatigué",
  flex: "Flex biceps",
  victory: "Victoire",
  squat: "Squat",
  press: "Développé militaire",
  deadlift: "Soulevé de terre",
  punch: "Jab – cross",
  run: "Course",
  level_up: "Level-up",
};

/**
 * Squelette : noms compatibles Mixamo (sans le préfixe "mixamorig:") pour
 * faciliter le retarget d'animations Mixamo / Quaternius plus tard.
 */
export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;
export const SIDES = ["Left", "Right"] as const;

/** Noms des meshes dans le GLB (préfixes pour l'apparence). */
export const MESH = {
  body: "Body",
  eyes: "Eyes",
  brows: "Brows",
  lashes: "Lashes",
  hairPrefix: "Hair_", // Hair_buzz, Hair_short, ...
  beardPrefix: "Beard_", // Beard_stubble, ...
  topPrefix: "Top_", // Top_tank, Top_tee, Top_hoodie
  bottomPrefix: "Bottom_", // Bottom_shorts, Bottom_joggers
  shoesPrefix: "Shoes_", // Shoes_sneakers
  barbell: "Prop_Barbell",
} as const;

export const HAIR_STYLES = ["none", "buzz", "short", "quiff", "afro", "bun"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_LABELS: Record<HairStyle, string> = {
  none: "Crâne rasé",
  buzz: "Boule à zéro",
  short: "Court dégradé",
  quiff: "Banane",
  afro: "Afro",
  bun: "Chignon",
};

export const BEARD_STYLES = ["none", "stubble", "short", "full", "goatee"] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number];
export const BEARD_LABELS: Record<BeardStyle, string> = {
  none: "Aucune",
  stubble: "3 jours",
  short: "Courte",
  full: "Fournie",
  goatee: "Bouc",
};

export const TOPS = ["tank", "tee", "hoodie"] as const;
export type TopStyle = (typeof TOPS)[number];
export const TOP_LABELS: Record<TopStyle, string> = {
  tank: "Débardeur",
  tee: "T-shirt",
  hoodie: "Sweat zippé",
};

export const BOTTOMS = ["shorts", "joggers"] as const;
export type BottomStyle = (typeof BOTTOMS)[number];
export const BOTTOM_LABELS: Record<BottomStyle, string> = {
  shorts: "Short",
  joggers: "Jogging",
};

/** Attributs de sommet custom (masques par groupe musculaire, 0→1). */
export const MUSCLE_MASK_ATTRIBUTES = ["_MUSCLEA", "_MUSCLEB", "_MUSCLEC"] as const;

/** Genres de base : un GLB par morphologie de base (squelette ajusté). */
export const BODY_BASES = ["m", "f"] as const;
export type BodyBase = (typeof BODY_BASES)[number];
/** Dossier des modèles : "/models" dans l'app, relatif ("models") dans la version artefact autonome. */
const MODEL_BASE = process.env.NEXT_PUBLIC_MODEL_BASE ?? "/models";
export const heroModelUrl = (base: BodyBase) => `${MODEL_BASE}/hero-${base}.glb`;
