"use client";
/**
 * Chargement du GLB du héros.
 * - App Next : fichier .glb (meshopt) via useGLTF.
 * - Version artefact autonome : l'hébergeur ne sert pas les .glb, le modèle est
 *   livré en base64 dans un .txt, décodé en mémoire puis parsé par GLTFLoader
 *   (aucun fetch de data:/blob: URL, compatible avec une CSP stricte).
 */
import { useGLTF } from "@react-three/drei";
import { suspend } from "suspend-react";
import type { AnimationClip, Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type BodyBase, heroModelUrl } from "./contract";

export interface HeroGLTF {
  scene: Group;
  animations: AnimationClip[];
}

const FORMAT = process.env.NEXT_PUBLIC_MODEL_FORMAT ?? "glb";

async function loadBase64(url: string): Promise<HeroGLTF> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Modèle introuvable : ${url} (${res.status})`);
  const b64 = (await res.text()).trim();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer, "", (g) => resolve(g), reject));
}

function useHeroModelGlb(base: BodyBase): HeroGLTF {
  return useGLTF(heroModelUrl(base), false, true);
}

function useHeroModelBase64(base: BodyBase): HeroGLTF {
  const url = heroModelUrl(base).replace(/\.glb$/, ".glb.txt");
  return suspend(() => loadBase64(url), ["hero-b64", url]);
}

export const useHeroModel = FORMAT === "base64" ? useHeroModelBase64 : useHeroModelGlb;

export function preloadHeroModels() {
  if (FORMAT !== "glb") return;
  useGLTF.preload(heroModelUrl("m"), false, true);
  useGLTF.preload(heroModelUrl("f"), false, true);
}
