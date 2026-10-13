"use client";
/**
 * Accès aux capacités de la page quand elle tourne comme artefact claude.ai :
 * `db` (sauvegarde privée), `user` (ton identifiant), `sample` (Claude, avec
 * images) et `assets` (photos privées). Hors artefact (app Next en local),
 * tout résout `null` et l'app se replie sur le stockage du navigateur.
 */

/* Types minimaux des capacités utilisées (contrat runtime 0.2.x). */
export interface DocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface Db {
  doc(path: string): DocRef;
}
export interface UserCap {
  id(): Promise<string | null>;
}
export interface SampleOptions {
  images?: Blob | Blob[];
  modelTier?: "quick" | "default" | "complex";
  signal?: AbortSignal;
  cache?: boolean;
}
export interface SampleFn {
  (input: string, opts?: SampleOptions): Promise<{ text: string }>;
  json<T = unknown>(input: string, opts?: SampleOptions): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>;
}
export interface AssetsCap {
  upload(blob: Blob): Promise<{ id: string; url: string }>;
  delete(id: string): Promise<unknown>;
}
interface ClaudeWindow {
  claude?: { use(name: string): Promise<unknown> };
}

const cache = new Map<string, Promise<unknown>>();

/** `claude.use(name)` mémoïsé ; null si la page n'est pas un artefact. */
export function getCapability<T>(name: "db" | "user" | "sample" | "assets"): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const c = (window as unknown as ClaudeWindow).claude;
  if (!c?.use) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, c.use(name).catch(() => null));
  return cache.get(name) as Promise<T | null>;
}

/** Message lisible pour une erreur de `sample`. */
export function sampleErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case "not_granted":
    case "sampling_disabled":
    case "images_unavailable":
      return "L'analyse par Claude n'est pas autorisée sur cette page. Tu peux estimer ton point de départ à la main.";
    case "rate_limited":
      return "Trop de demandes d'affilée. Réessaie dans un moment.";
    case "image_rejected":
      return "Cette image n'a pas pu être lue. Essaie une photo JPEG ou PNG plus légère.";
    case "refused":
      return "Claude n'a pas pu analyser cette photo. Essaie une photo en tenue de sport, de face, bien éclairée.";
    case "invalid_json":
      return "La réponse de l'analyse était illisible. Réessaie.";
    case "session_expired":
      return "Ta session a expiré : reconnecte-toi à claude.ai.";
    default:
      return "L'analyse a échoué. Vérifie ta connexion et réessaie.";
  }
}
