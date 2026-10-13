"use client";
/* eslint-disable react-hooks/immutability --
 * Idiome R3F : le graphe three.js (matériaux, uniforms, influences de morphs)
 * est muté impérativement dans useFrame / les effets, hors du cycle de rendu React. */
/**
 * HeroAvatar : implémentation R3F de AvatarRenderer à partir du GLB riggé.
 * - morph targets interpolés (évolution fluide, jamais instantanée)
 * - AnimationMixer + crossFade entre clips, retour automatique à l'idle
 * - pulsations musculaires (gonflement + lueur), clignements, respiration
 * - apparence (cheveux, barbe, tenue, couleurs) et rim light de classe
 */
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AvatarRenderer, PlayOptions } from "./AvatarRenderer";
import {
  BARBELL_CLIPS,
  CLIPS,
  type ClipName,
  MUSCLE_GROUPS,
  type MuscleGroup,
  MESH,
  ONE_SHOT_CLIPS,
  heroModelUrl,
} from "./contract";
import {
  clothMaterial,
  createAvatarUniforms,
  eyeTexture,
  hairMaterial,
  plainMaterial,
  skinMaterial,
} from "./materials";
import { type Appearance, type AvatarState, CLASS_INFO, computeMorphFrame } from "./params";

interface Props {
  state: AvatarState;
  appearance: Appearance;
  /** Taper sur l'avatar déclenche un flex. */
  interactive?: boolean;
  /** Clip de départ. */
  initialClip?: ClipName;
  /** Atténue les micro-mouvements (prefers-reduced-motion). */
  reducedMotion?: boolean;
  ref?: Ref<AvatarRenderer>;
  onClipChange?: (clip: ClipName) => void;
}

const SMILE_CLIPS: readonly ClipName[] = ["flex", "victory", "level_up"];

export function HeroAvatar({ state, appearance, interactive = true, initialClip = "idle", reducedMotion, ref, onClipChange }: Props) {
  const gltf = useGLTF(heroModelUrl(appearance.base), false, true);

  // Clone indépendant (plusieurs avatars possibles : salle du clan).
  const { root, meshes, uniforms, mixer, actions, materials } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Group;
    const uniforms = createAvatarUniforms();
    const meshes: THREE.SkinnedMesh[] = [];
    const materials = {
      skin: skinMaterial(uniforms, "#d79f78"),
      hair: hairMaterial(uniforms, "#3b2416"),
      top: clothMaterial(uniforms, "#ff6a1a"),
      bottom: clothMaterial(uniforms, "#141a2e", 0.7),
      shoes: clothMaterial(uniforms, "#f2efe6", 0.5),
      eyes: new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      lashes: plainMaterial(uniforms, { color: "#120b08", roughness: 0.9, side: THREE.DoubleSide }),
      metal: plainMaterial(uniforms, { color: "#c9ccd2", metalness: 1, roughness: 0.28 }),
      plates: plainMaterial(uniforms, { color: "#1a1d26", metalness: 0.2, roughness: 0.55 }),
    };
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.frustumCulled = false; // les bounding boxes ne suivent pas le skinning
      m.castShadow = true;
      m.receiveShadow = true;
      const n = m.name;
      if (n === MESH.body) m.material = materials.skin;
      else if (n === MESH.eyes) m.material = materials.eyes;
      else if (n === MESH.lashes) m.material = materials.lashes;
      else if (n.startsWith(MESH.hairPrefix) || n.startsWith(MESH.beardPrefix)) m.material = materials.hair;
      else if (n.startsWith(MESH.topPrefix)) m.material = materials.top;
      else if (n.startsWith(MESH.bottomPrefix)) m.material = materials.bottom;
      else if (n.startsWith(MESH.shoesPrefix)) m.material = materials.shoes;
      else if (n === "Prop_Barbell") m.material = materials.metal;
      else if (n === "Prop_Barbell_plates") m.material = materials.plates;
      if (m.morphTargetDictionary) meshes.push(m);
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<ClipName, THREE.AnimationAction>();
    for (const name of CLIPS) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (ONE_SHOT_CLIPS.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions.set(name, a);
    }
    return { root, meshes, uniforms, mixer, actions, materials };
  }, [gltf]);

  // ── État runtime (refs : rien ne re-rend React à 60 i/s) ───────────────
  const rt = useRef({
    targets: {} as Record<string, number>,
    current: {} as Record<string, number>,
    smoothing: 0.6,
    tiredness: 0,
    energy: 0.7,
    pulse: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>,
    highlight: new Set<MuscleGroup>(),
    clip: initialClip as ClipName,
    blinkAt: 2,
    blink: 0,
    smile: 0,
    time: 0,
  });

  const idleClip = (): ClipName => (rt.current.tiredness > 0.5 ? "idle_tired" : "idle");

  const play = (name: ClipName, opts: PlayOptions = {}) => {
    const next = actions.get(name);
    if (!next) return;
    const prev = actions.get(rt.current.clip);
    next.reset();
    next.setEffectiveTimeScale(opts.speed ?? 1);
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, opts.fade ?? 0.35, false);
    rt.current.clip = name;
    root.traverse((o) => {
      if (o.name.startsWith("Prop_")) o.visible = BARBELL_CLIPS.includes(name);
    });
    onClipChange?.(name);
  };

  // Retour à l'idle après un one-shot.
  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      const name = e.action.getClip().name as ClipName;
      if (ONE_SHOT_CLIPS.includes(name) && rt.current.clip === name) play(idleClip(), { fade: 0.5 });
    };
    mixer.addEventListener("finished", onFinished as never);
    return () => mixer.removeEventListener("finished", onFinished as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer]);

  // Clip initial.
  useEffect(() => {
    rt.current.clip = initialClip;
    const a = actions.get(initialClip);
    a?.reset().play();
    root.traverse((o) => {
      if (o.name.startsWith("Prop_")) o.visible = BARBELL_CLIPS.includes(initialClip);
    });
    return () => {
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // ── État de jeu → cibles de morphs ─────────────────────────────────────
  useEffect(() => {
    const frame = computeMorphFrame(state, appearance);
    rt.current.targets = frame.weights;
    rt.current.tiredness = frame.tiredness;
    rt.current.energy = state.energy / 100;
    uniforms.uSaturation.value = 1 - frame.tiredness * 0.55;
    uniforms.uRimStrength.value = 0.25 + (state.energy / 100) * 0.75;
    uniforms.uRimColor.value.set(CLASS_INFO[state.playerClass].color);
    uniforms.uGlowColor.value.set(CLASS_INFO[state.playerClass].color);
    // Bascule idle ↔ idle fatigué si on est au repos.
    const c = rt.current.clip;
    if ((c === "idle" || c === "idle_tired") && c !== idleClip()) play(idleClip(), { fade: 1.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, appearance.face]);

  // ── Apparence ──────────────────────────────────────────────────────────
  useEffect(() => {
    const a = appearance;
    materials.skin.color.set(a.skin);
    materials.hair.color.set(a.hairColor);
    materials.top.color.set(a.outfitColor);
    materials.top.sheenColor.set(a.outfitColor).lerp(new THREE.Color("#ffffff"), 0.4);
    uniforms.uBrowColor.value.set(a.hairColor).multiplyScalar(0.8);
    uniforms.uStubbleColor.value.set(a.hairColor).multiplyScalar(0.85);
    uniforms.uLipColor.value.set(a.skin).lerp(new THREE.Color("#b04a48"), 0.35);
    const hairMesh = a.hair === "none" || a.hair === "buzz" ? null : `Hair_${a.hair}`;
    uniforms.uScalp.value = a.hair === "buzz" ? 1 : hairMesh ? 0.9 : 0.12;
    const beardMesh = a.beard === "none" || a.beard === "stubble" ? null : `Beard_${a.beard}`;
    uniforms.uStubble.value = a.beard === "none" ? 0 : a.beard === "stubble" ? 1 : 0.7;
    const tex = eyeTexture(a.eyeColor);
    materials.eyes.map?.dispose();
    materials.eyes.map = tex;
    materials.eyes.needsUpdate = true;
    root.traverse((o) => {
      const n = o.name;
      if (!(o as THREE.Mesh).isMesh) return;
      if (n.startsWith(MESH.hairPrefix)) o.visible = n === hairMesh || (n === "Hair_bun_knot" && a.hair === "bun");
      else if (n.startsWith(MESH.beardPrefix)) o.visible = n === beardMesh;
      else if (n.startsWith(MESH.topPrefix)) o.visible = n === `Top_${a.top}`;
      else if (n.startsWith(MESH.bottomPrefix)) o.visible = n === `Bottom_${a.bottom}`;
      else if (n.startsWith(MESH.shoesPrefix)) o.visible = true;
    });
  }, [appearance, materials, root, uniforms]);

  useImperativeHandle(
    ref,
    (): AvatarRenderer => ({
      setState: () => {
        /* piloté par les props */
      },
      setAppearance: () => {},
      play,
      pulse: (g, intensity = 1) => {
        rt.current.pulse[g] = Math.min(1.4, rt.current.pulse[g] + intensity);
      },
      highlight: (groups) => {
        rt.current.highlight = new Set(groups);
      },
      setMorphSmoothing: (s) => {
        rt.current.smoothing = Math.max(0.05, s);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, meshes],
  );

  // ── Boucle par image ───────────────────────────────────────────────────
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = rt.current;
    r.time += dt;
    uniforms.uTime.value = r.time;
    mixer.update(dt);

    // Lissage exponentiel vers les cibles.
    const k = 1 - Math.exp(-dt / r.smoothing);
    for (const [name, target] of Object.entries(r.targets)) {
      const cur = r.current[name] ?? 0;
      r.current[name] = cur + (target - cur) * k;
    }
    // Pulsations musculaires : décroissance rapide.
    const glow = new Array(12).fill(0);
    MUSCLE_GROUPS.forEach((g, i) => {
      r.pulse[g] *= Math.exp(-dt * 2.6);
      glow[i] = Math.max(r.pulse[g] * 0.9, r.highlight.has(g) ? 0.55 + 0.2 * Math.sin(r.time * 4) : 0);
    });
    uniforms.uGlowA.value.set(glow[0], glow[1], glow[2], glow[3]);
    uniforms.uGlowB.value.set(glow[4], glow[5], glow[6], glow[7]);
    uniforms.uGlowC.value.set(glow[8], glow[9], glow[10], 0);

    // Respiration : plus ample et lente quand on est fatigué.
    const rate = 1.6 - r.tiredness * 0.5;
    const amp = (reducedMotion ? 0.25 : 0.55) * (1 - r.tiredness * 0.3);
    const breath = (Math.sin(r.time * rate * Math.PI) * 0.5 + 0.5) * amp;
    // Clignements aléatoires (plus lents quand fatigué).
    if (r.time > r.blinkAt) {
      r.blink = 1;
      r.blinkAt = r.time + 2 + Math.random() * 3.5;
    }
    r.blink = Math.max(0, r.blink - dt * (r.tiredness > 0.5 ? 5 : 8));
    const blinkW = r.blink > 0 ? Math.sin(r.blink * Math.PI) : 0;
    r.smile += ((SMILE_CLIPS.includes(r.clip) ? 0.9 : r.energy > 0.75 ? 0.15 : 0) - r.smile) * Math.min(1, dt * 4);

    for (const m of meshes) {
      const dict = m.morphTargetDictionary!;
      const inf = m.morphTargetInfluences!;
      for (const name in dict) {
        let w = r.current[name] ?? 0;
        if (name.startsWith("muscle_")) {
          const g = name.slice(7) as MuscleGroup;
          w += r.pulse[g] * 0.22;
        } else if (name === "breath") w = breath;
        else if (name === "blink") w = blinkW;
        else if (name === "smile") w = r.smile;
        inf[dict[name]] = w;
      }
    }
  });

  return (
    <primitive
      object={root}
      onPointerDown={
        interactive
          ? (e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              if (!ONE_SHOT_CLIPS.includes(rt.current.clip) && !BARBELL_CLIPS.includes(rt.current.clip)) play("flex");
            }
          : undefined
      }
    />
  );
}

useGLTF.preload(heroModelUrl("m"), false, true);
useGLTF.preload(heroModelUrl("f"), false, true);
