/**
 * Matériaux "PBR stylisé héroïque" : MeshStandard/Physical de three.js
 * enrichis par onBeforeCompile :
 *  - rim light coloré selon la classe du joueur
 *  - faux subsurface (teinte chaude au terminateur) pour la peau
 *  - peinture du visage (sourcils, barbe de 3 jours, lèvres, cuir chevelu)
 *  - lueur par groupe musculaire (pulsation pendant la séance)
 *  - désaturation pilotée par l'énergie (avatar fatigué = couleurs ternes)
 */
import * as THREE from "three";

/** Uniforms partagés par tous les matériaux d'UN avatar. */
export interface AvatarUniforms {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uSaturation: { value: number };
  uGlowColor: { value: THREE.Color };
  uGlowA: { value: THREE.Vector4 };
  uGlowB: { value: THREE.Vector4 };
  uGlowC: { value: THREE.Vector4 };
  uBrowColor: { value: THREE.Color };
  uStubble: { value: number };
  uStubbleColor: { value: THREE.Color };
  uScalp: { value: number };
  uLipColor: { value: THREE.Color };
  uTime: { value: number };
}

export function createAvatarUniforms(): AvatarUniforms {
  return {
    uRimColor: { value: new THREE.Color("#b6ff2e") },
    uRimStrength: { value: 1 },
    uSaturation: { value: 1 },
    uGlowColor: { value: new THREE.Color("#ff8a1f") },
    uGlowA: { value: new THREE.Vector4() },
    uGlowB: { value: new THREE.Vector4() },
    uGlowC: { value: new THREE.Vector4() },
    uBrowColor: { value: new THREE.Color("#2a1a10") },
    uStubble: { value: 0.5 },
    uStubbleColor: { value: new THREE.Color("#2a1a10") },
    uScalp: { value: 0 },
    uLipColor: { value: new THREE.Color("#b5645a") },
    uTime: { value: 0 },
  };
}

interface Features {
  muscles?: boolean;
  paint?: boolean;
  skin?: boolean;
  /** Reflet "bande" des cheveux stylisés. */
  hair?: boolean;
}

function patch<T extends THREE.MeshStandardMaterial>(material: T, u: AvatarUniforms, f: Features): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const defs = [
      f.muscles ? "#define AV_MUSCLES" : "",
      f.paint ? "#define AV_PAINT" : "",
      f.skin ? "#define AV_SKIN" : "",
      f.hair ? "#define AV_HAIR" : "",
    ].join("\n");

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `${defs}
#include <common>
#ifdef AV_MUSCLES
attribute vec4 _musclea; attribute vec4 _muscleb; attribute vec4 _musclec;
uniform vec4 uGlowA; uniform vec4 uGlowB; uniform vec4 uGlowC;
varying float vGlow;
#endif
#ifdef AV_PAINT
attribute vec4 _paint; varying vec4 vPaint;
#endif
varying vec3 vObjPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef AV_MUSCLES
vGlow = dot(_musclea, uGlowA) + dot(_muscleb, uGlowB) + dot(_musclec, uGlowC);
#endif
#ifdef AV_PAINT
vPaint = _paint;
#endif
vObjPos = position;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `${defs}
#include <common>
uniform vec3 uRimColor; uniform float uRimStrength; uniform float uSaturation; uniform float uTime;
uniform vec3 uGlowColor; uniform vec3 uBrowColor; uniform float uStubble; uniform vec3 uStubbleColor;
uniform float uScalp; uniform vec3 uLipColor;
#ifdef AV_MUSCLES
varying float vGlow;
#endif
#ifdef AV_PAINT
varying vec4 vPaint;
#endif
varying vec3 vObjPos;
float avHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
#ifdef AV_PAINT
{
  // Grain fin pour suggérer les poils (barbe de 3 jours, cuir chevelu rasé).
  float grain = avHash(floor(vObjPos * 900.0));
  float stub = vPaint.y * uStubble * (0.55 + 0.45 * grain);
  diffuseColor.rgb = mix(diffuseColor.rgb, uStubbleColor, clamp(stub * 0.75, 0.0, 0.85));
  float scalp = vPaint.w * uScalp * (0.6 + 0.4 * grain);
  diffuseColor.rgb = mix(diffuseColor.rgb, uStubbleColor, clamp(scalp * 0.8, 0.0, 0.85));
  diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, vPaint.z * 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBrowColor, smoothstep(0.15, 0.7, vPaint.x) * 0.92);
}
#endif`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(normal, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 4.0);
#ifdef AV_SKIN
  // Faux subsurface : lumière "qui passe" en rasant, teinte chaude.
  outgoingLight += diffuseColor.rgb * vec3(1.0, 0.35, 0.25) * pow(1.0 - ndv, 2.0) * 0.18;
#endif
#ifdef AV_HAIR
  float band = pow(clamp(1.0 - abs(normal.y - 0.35) * 2.2, 0.0, 1.0), 3.0);
  outgoingLight += diffuseColor.rgb * band * 0.6 + vec3(band * 0.06);
#endif
  outgoingLight += uRimColor * fres * uRimStrength * 0.45;
#ifdef AV_MUSCLES
  float g = clamp(vGlow, 0.0, 1.5);
  outgoingLight += uGlowColor * g * (0.55 + 0.45 * fres) * 1.6;
#endif
  float l = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  outgoingLight = mix(vec3(l), outgoingLight, uSaturation);
}
#include <opaque_fragment>`,
      );
  };
  // Clé de cache distincte par combinaison de fonctionnalités.
  material.customProgramCacheKey = () => `avatar-${f.muscles ? 1 : 0}${f.paint ? 1 : 0}${f.skin ? 1 : 0}${f.hair ? 1 : 0}`;
  return material;
}

export function skinMaterial(u: AvatarUniforms, color: string) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.52,
    metalness: 0,
    sheen: 0.35,
    sheenColor: new THREE.Color("#ffc9b0"),
    sheenRoughness: 0.6,
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
  });
  return patch(m, u, { muscles: true, paint: true, skin: true });
}

export function clothMaterial(u: AvatarUniforms, color: string, roughness = 0.82) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    sheen: 0.6,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.4),
    sheenRoughness: 0.8,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  return patch(m, u, { muscles: true });
}

export function hairMaterial(u: AvatarUniforms, color: string) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  return patch(m, u, { hair: true });
}

export function plainMaterial(u: AvatarUniforms, params: THREE.MeshStandardMaterialParameters) {
  return patch(new THREE.MeshStandardMaterial(params), u, {});
}

/** Texture d'œil procédurale (disposition UV du proxy MakeHuman "high-poly"). */
export function eyeTexture(irisColor: string): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const s = size / 1024;
  g.fillStyle = "#efe8e2";
  g.fillRect(0, 0, size, size);
  const iris = new THREE.Color(irisColor);
  const dark = iris.clone().multiplyScalar(0.35);
  const light = iris.clone().lerp(new THREE.Color("#ffffff"), 0.35);
  for (const [cx, cy] of [
    [295, 725],
    [722, 305],
  ]) {
    const x = cx * s,
      y = cy * s;
    const r = 120 * s;
    const sclera = g.createRadialGradient(x, y, r, x, y, r * 2.6);
    sclera.addColorStop(0, "rgba(255,255,255,0)");
    sclera.addColorStop(1, "rgba(214,170,160,0.55)");
    g.fillStyle = sclera;
    g.beginPath();
    g.arc(x, y, r * 2.6, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(x, y, r * 0.25, x, y, r);
    grad.addColorStop(0, `#${light.getHexString()}`);
    grad.addColorStop(0.7, `#${iris.getHexString()}`);
    grad.addColorStop(1, `#${dark.getHexString()}`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // Stries radiales stylisées.
    g.strokeStyle = `#${dark.getHexString()}55`;
    g.lineWidth = 2 * s;
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(t) * r * 0.4, y + Math.sin(t) * r * 0.4);
      g.lineTo(x + Math.cos(t) * r * 0.95, y + Math.sin(t) * r * 0.95);
      g.stroke();
    }
    g.fillStyle = "#050505";
    g.beginPath();
    g.arc(x, y, r * 0.36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(x - r * 0.35, y - r * 0.35, r * 0.16, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
