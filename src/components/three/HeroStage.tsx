"use client";
/**
 * Plateau 3D "studio de héros" : éclairage clé + rim coloré par la classe,
 * environnement procédural (Lightformers, aucun HDR à télécharger),
 * socle lumineux, post-processing selon le préréglage graphique.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { QUALITY, type Quality } from "@/lib/settings";

interface Props {
  children: ReactNode;
  classColor: string;
  quality: Quality;
  reducedMotion?: boolean;
  /** Cible de caméra (y) et distance. */
  focus?: { y: number; distance: number };
  autoRotate?: boolean;
  onFps?: (fps: number) => void;
}

function Pedestal({ color }: { color: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    // Sol : dégradé radial + grille fine, généré en canvas.
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, "#26304a");
    grad.addColorStop(0.6, "#121a2c");
    grad.addColorStop(1, "#070b14");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(232,210,170,0.07)";
    g.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame(({ clock }) => {
    if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });
  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(3), [color]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} envMapIntensity={0.15} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.003}>
        <ringGeometry args={[0.82, 0.86, 96]} />
        <meshBasicMaterial color={glow} transparent toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
        <ringGeometry args={[0.9, 0.905, 96]} />
        <meshBasicMaterial color={glow} transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Lights({ color, quality }: { color: string; quality: Quality }) {
  const q = QUALITY[quality];
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[2.2, 3.6, 2.8]}
        intensity={2.6}
        color="#ffe8d0"
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMapSize, q.shadowMapSize]}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={2.4}
        shadow-camera-bottom={-0.2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Rim lights : couleur de classe, derrière le héros. */}
      <directionalLight position={[-2.5, 2.4, -2.6]} intensity={2.2} color={color} />
      <directionalLight position={[2.8, 1.6, -2.2]} intensity={1.4} color="#7ea2ff" />
      <pointLight position={[0, 0.25, 0.9]} intensity={0.25} color={color} distance={1.6} />
    </>
  );
}

function CameraRig({ focus, autoRotate, reducedMotion }: Required<Pick<Props, "focus">> & { autoRotate?: boolean; reducedMotion?: boolean }) {
  const { camera, size } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const target = useRef(new THREE.Vector3(0, focus.y, 0));
  // Transition de caméra douce quand la zone d'intérêt change (visage, corps...).
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const k = 1 - Math.exp(-dt * 3);
    target.current.set(0, focus.y, 0);
    // Écran portrait : on recule la caméra et on décale l'image vers le haut
    // (le panneau de contrôle occupe le bas de l'écran).
    const aspect = size.width / size.height;
    const portrait = aspect < 0.85;
    const cam = camera as THREE.PerspectiveCamera;
    if (portrait) cam.setViewOffset(size.width, size.height, 0, size.height * 0.2, size.width, size.height);
    else if (cam.view) cam.clearViewOffset();
    const wanted = focus.distance * (portrait ? Math.min(2.2, 0.85 / aspect) * 0.8 : 1);
    c.target.lerp(target.current, k);
    const dir = camera.position.clone().sub(c.target);
    const len = dir.length();
    dir.setLength(len + (wanted - len) * k);
    camera.position.copy(c.target).add(dir);
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      minDistance={0.5}
      maxDistance={6}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 - 0.02}
      autoRotate={autoRotate && !reducedMotion}
      autoRotateSpeed={0.6}
    />
  );
}

function FpsProbe({ onFps }: { onFps?: (fps: number) => void }) {
  const acc = useRef({ t: 0, n: 0 });
  useFrame((_, dt) => {
    acc.current.t += dt;
    acc.current.n++;
    if (acc.current.t > 0.5) {
      onFps?.(Math.round(acc.current.n / acc.current.t));
      acc.current = { t: 0, n: 0 };
    }
  });
  return null;
}

export function HeroStage({ children, classColor, quality, reducedMotion, focus = { y: 1.0, distance: 3.6 }, autoRotate, onFps }: Props) {
  const q = QUALITY[quality];
  const [dpr, setDpr] = useState(q.dpr[1]);
  return (
    <Canvas
      shadows={q.shadows ? { type: THREE.PCFShadowMap } : false}
      dpr={dpr}
      camera={{ position: [0.9, 1.35, 3.4], fov: 32, near: 0.05, far: 40 }}
      gl={{ antialias: q.multisampling === 0, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      {/* DPR adaptatif : on dégrade la résolution si le framerate s'effondre. */}
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(q.dpr[0], d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(q.dpr[1], d + 0.25))}
      />
      <color attach="background" args={["#0b1120"]} />
      <fog attach="fog" args={["#0b1120", 5, 11]} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[2.5, 3, 3]} scale={[3, 2, 1]} color="#ffe2c4" />
        <Lightformer form="rect" intensity={1.1} position={[-3, 2.5, -2]} scale={[1.5, 3, 1]} color={classColor} />
        <Lightformer form="ring" intensity={1.2} position={[0, 4, 0]} scale={2} color="#9fb6ff" />
        <Lightformer form="rect" intensity={0.6} position={[0, -1, 2]} scale={[6, 1, 1]} color="#e8d2aa" />
      </Environment>
      <Lights color={classColor} quality={quality} />
      <Suspense fallback={null}>{children}</Suspense>
      <Pedestal color={classColor} />
      <CameraRig focus={focus} autoRotate={autoRotate} reducedMotion={reducedMotion} />
      <FpsProbe onFps={onFps} />
      {quality === "low" ? (
        <EffectComposer multisampling={0}>
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={q.multisampling}>
          {q.ao ? <N8AO aoRadius={0.35} intensity={2.2} distanceFalloff={0.6} halfRes /> : <></>}
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.95} luminanceSmoothing={0.2} />
          <Vignette offset={0.22} darkness={0.8} />
          {q.grain ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} /> : <></>}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
