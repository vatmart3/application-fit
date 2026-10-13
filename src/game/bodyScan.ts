"use client";
/**
 * Scan corporel : Claude analyse ta photo (face, et dos si tu en donnes une)
 * pour fixer ton point de départ — niveau de chaque groupe musculaire sur
 * l'échelle du jeu, % de masse grasse, et quelques traits pour ton avatar.
 * Sans photo (ou si l'analyse est indisponible) : estimation par questionnaire.
 */
import { BEARD_STYLES, HAIR_STYLES, MUSCLE_GROUPS, MUSCLE_LABELS, type BeardStyle, type HairStyle, type MuscleGroup } from "@/avatar/contract";
import { HAIR_COLORS, SKIN_TONES } from "@/avatar/params";
import { bodyFatFromBmi } from "@/engine/nutrition";
import { estimateLevels } from "@/engine/physiology";
import { getCapability, type SampleFn } from "./claude";
import type { BodyScan, Profile } from "./types";

export interface ScanResult extends BodyScan {
  appearance: { skin?: string; hair?: HairStyle; hairColor?: string; beard?: BeardStyle };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Réduit une photo (≤ 1600 px, JPEG) avant envoi / stockage. */
export async function compressPhoto(file: Blob, maxSide = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.86));
  } catch {
    return file;
  }
}

/** La page peut-elle envoyer des images à Claude ? */
export async function canAnalyzePhotos(): Promise<boolean> {
  const sample = await getCapability<SampleFn>("sample");
  if (!sample) return false;
  const limits = await sample.limits().catch(() => null);
  return !!limits?.images;
}

function prompt(p: Profile, hasBack: boolean): string {
  return `Tu es coach sportif et évaluateur de composition corporelle pour un jeu de fitness.
On te donne ${hasBack ? "deux photos (1 : de face, 2 : de dos)" : "une photo de face"} d'une personne en tenue de sport.
Infos déclarées : ${p.sex === "m" ? "homme" : "femme"}, ${p.age} ans, ${p.heightCm} cm, ${p.weightKg} kg, niveau d'entraînement déclaré : ${p.training}${p.measuredBodyFat ? `, % de masse grasse mesuré : ${p.measuredBodyFat}` : ""}.

Estime son point de départ, honnêtement, sans flatter ni juger. Ne commente jamais l'attractivité.
Échelle des niveaux musculaires (0-100) :
- 15 = peu de muscle visible, sédentaire
- 25 = adulte moyen non entraîné
- 35 = pratique régulière depuis ~1 an
- 50 = clairement musclé et athlétique
- 60 = très musclé (pratiquant compétitif amateur)
- 80 = niveau élite / culturiste
- 100 = sommet professionnel
Groupes : ${MUSCLE_GROUPS.map((g) => `${g} (${MUSCLE_LABELS[g]})`).join(", ")}.
Pour un groupe peu visible sur les photos, déduis-le de l'ensemble et baisse "confidence".

Réponds UNIQUEMENT avec un objet JSON de cette forme :
{"bodyFatPercent": 18, "muscles": {${MUSCLE_GROUPS.map((g) => `"${g}": 30`).join(", ")}},
 "confidence": 0.7,
 "summary": "2 phrases en français, tutoiement, factuelles et encourageantes",
 "strengths": ["2 à 3 points forts courts"],
 "focus": ["2 à 3 priorités courtes"],
 "appearance": {"skinTone": 0-5 (0 très clair → 5 très foncé), "hair": "${HAIR_STYLES.join("|")}", "hairColor": 0-7 (0 noir, 1 brun foncé, 2 châtain, 3 blond foncé, 4 blond, 5 gris, 6 roux, 7 coloré), "beard": "${BEARD_STYLES.join("|")}"}}`;
}

interface RawScan {
  bodyFatPercent?: number;
  muscles?: Partial<Record<MuscleGroup, number>>;
  confidence?: number;
  summary?: string;
  strengths?: string[];
  focus?: string[];
  appearance?: { skinTone?: number; hair?: string; hairColor?: number; beard?: string };
}

/** Analyse par Claude. Rejette avec l'erreur `sample` en cas d'échec. */
export async function analyzePhotos(p: Profile, front: Blob, back: Blob | null, signal?: AbortSignal): Promise<ScanResult> {
  const sample = await getCapability<SampleFn>("sample");
  if (!sample) throw { code: "not_granted" };
  const images = back ? [front, back] : [front];
  const raw = await sample.json<RawScan>(prompt(p, !!back), { images, signal, modelTier: "default" });
  const fallback = estimateLevels(p.training, p.sex, p.weightKg / (p.heightCm / 100) ** 2);
  const muscles = Object.fromEntries(
    MUSCLE_GROUPS.map((g) => {
      const v = Number(raw.muscles?.[g]);
      return [g, Number.isFinite(v) ? clamp(Math.round(v), 5, 100) : fallback[g]];
    }),
  ) as Record<MuscleGroup, number>;
  const bf = Number(raw.bodyFatPercent);
  const a = raw.appearance ?? {};
  return {
    date: new Date().toISOString(),
    source: "photo",
    // Une mesure réelle (balance / InBody) prime sur l'estimation visuelle.
    bodyFat: p.measuredBodyFat ?? (Number.isFinite(bf) ? clamp(bf, 4, 55) : bodyFatFromBmi(p.sex, p.weightKg, p.heightCm, p.age)),
    muscles,
    confidence: clamp(Number(raw.confidence) || 0.5, 0, 1),
    summary: String(raw.summary ?? "").slice(0, 400),
    strengths: (raw.strengths ?? []).map(String).slice(0, 3),
    focus: (raw.focus ?? []).map(String).slice(0, 3),
    photoIds: [],
    appearance: {
      skin: Number.isInteger(a.skinTone) ? SKIN_TONES[clamp(a.skinTone!, 0, SKIN_TONES.length - 1)] : undefined,
      hair: HAIR_STYLES.includes(a.hair as HairStyle) ? (a.hair as HairStyle) : undefined,
      hairColor: Number.isInteger(a.hairColor) ? HAIR_COLORS[clamp(a.hairColor!, 0, HAIR_COLORS.length - 1)] : undefined,
      beard: BEARD_STYLES.includes(a.beard as BeardStyle) ? (a.beard as BeardStyle) : undefined,
    },
  };
}

/** Point de départ sans photo. */
export function questionnaireScan(p: Profile): ScanResult {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  return {
    date: new Date().toISOString(),
    source: "questionnaire",
    bodyFat: p.measuredBodyFat ?? Math.round(bodyFatFromBmi(p.sex, p.weightKg, p.heightCm, p.age) * 10) / 10,
    muscles: estimateLevels(p.training, p.sex, bmi),
    confidence: 0.35,
    summary: "Estimation à partir de tes réponses. Un scan photo affinera ton point de départ.",
    strengths: [],
    focus: [],
    photoIds: [],
    appearance: {},
  };
}
