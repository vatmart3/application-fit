"use client";
/**
 * LABO DU PERSONNAGE — scène de test de l'étape 1 :
 * pipeline personnage (GLB + morph targets + animations) piloté en direct.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { HeroAvatar } from "@/avatar/HeroAvatar";
import { Avatar2DFallback } from "@/avatar/Avatar2DFallback";
import type { AvatarRenderer } from "@/avatar/AvatarRenderer";
import {
  BEARD_LABELS,
  BEARD_STYLES,
  BOTTOMS,
  BOTTOM_LABELS,
  CLIPS,
  CLIP_LABELS,
  type ClipName,
  FACE_MORPHS,
  HAIR_LABELS,
  HAIR_STYLES,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type MuscleGroup,
  TOPS,
  TOP_LABELS,
} from "@/avatar/contract";
import {
  type Appearance,
  type AvatarState,
  CLASS_INFO,
  DEFAULT_APPEARANCE,
  EYE_COLORS,
  HAIR_COLORS,
  type PlayerClass,
  SKIN_TONES,
  uniformMuscles,
} from "@/avatar/params";
import { HeroStage } from "@/components/three/HeroStage";
import { Chip, GameButton, GameSlider, Panel, SectionTitle, Tabs } from "@/components/ui/game";
import { buildDemoHistory, gainsBetween } from "@/data/demo/history";
import { hasWebGL, type Quality, useQuality, usePrefersReducedMotion, useSettings } from "@/lib/settings";

type Tab = "evo" | "corps" | "look" | "anims";

const FACE_LABELS: Record<(typeof FACE_MORPHS)[number], string> = {
  face_square: "Visage carré",
  face_round: "Visage rond",
  face_long: "Visage long",
  jaw_wide: "Mâchoire",
  cheekbones: "Pommettes",
  nose_wide: "Nez large",
  nose_long: "Nez long",
  brow_heavy: "Arcade",
};
const OUTFIT_COLORS = ["#ff6a1a", "#e8d2aa", "#1c2742", "#ff3b5c", "#22d3ee", "#b6ff2e", "#f2efe6"];

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function LabClient() {
  const mounted = useMounted();
  const demo = useMemo(() => buildDemoHistory(), []);
  const avatar = useRef<AvatarRenderer>(null);
  const quality = useQuality();
  const setQuality = useSettings((s) => s.setQuality);
  const reducedMotion = usePrefersReducedMotion();
  const [fps, setFps] = useState(0);
  const [tab, setTab] = useState<Tab>("evo");
  const [clip, setClip] = useState<ClipName>("idle");
  const [week, setWeek] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [state, setState] = useState<AvatarState>(() => ({
    muscles: demo.weeks[8].levels,
    definition: demo.weeks[8].definition,
    energy: demo.weeks[8].energy,
    playerClass: "hybride",
  }));
  const [focusHead, setFocusHead] = useState(false);
  const [pulsing, setPulsing] = useState<MuscleGroup | null>(null);

  const classColor = CLASS_INFO[state.playerClass].color;
  useEffect(() => {
    document.documentElement.style.setProperty("--class", classColor);
  }, [classColor]);

  /** Applique un instantané de la démo (semaine w). */
  const applyWeek = (w: number) => {
    const s = demo.weeks[w];
    setWeek(w);
    setState((prev) => ({ ...prev, muscles: s.levels, definition: s.definition, energy: s.energy }));
  };

  // "Rejouer 8 semaines" : transformation fluide semaine par semaine.
  useEffect(() => {
    if (!playing) return;
    let w = 0;
    const id = window.setInterval(() => {
      w++;
      if (w > 8) {
        window.clearInterval(id);
        setPlaying(false);
        avatar.current?.setMorphSmoothing(0.6);
        avatar.current?.highlight(Object.keys(gainsBetween(demo.weeks[0].levels, demo.weeks[8].levels)) as MuscleGroup[]);
        avatar.current?.play("victory");
        window.setTimeout(() => avatar.current?.highlight([]), 3500);
        return;
      }
      applyWeek(w);
    }, 900);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const presets: { label: string; apply: () => void }[] = [
    { label: "Jour 1", apply: () => applyWeek(0) },
    { label: "Sam · S8", apply: () => applyWeek(8) },
    {
      label: "Titan · 1 an",
      apply: () => setState({ muscles: { ...uniformMuscles(88), abs: 80, calves: 75 }, definition: 82, energy: 95, playerClass: "titan" }),
    },
    { label: "5 jours sans", apply: () => setState((s) => ({ ...s, energy: 12 })) },
  ];

  const pulse = (g: MuscleGroup) => {
    avatar.current?.pulse(g, 1);
    setPulsing(g);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(18);
    window.setTimeout(() => setPulsing(null), 400);
  };

  const webgl = mounted && hasWebGL();
  const cur = demo.weeks[week];
  const gains = gainsBetween(demo.weeks[0].levels, cur.levels);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-night-950">
      {/* ── Scène ── */}
      <div className="absolute inset-0">
        {mounted && webgl ? (
          <HeroStage
            classColor={classColor}
            quality={quality}
            reducedMotion={reducedMotion}
            autoRotate={false}
            focus={focusHead ? { y: 1.6, distance: 1.05 } : { y: 0.95, distance: 4.4 }}
            onFps={setFps}
          >
            <HeroAvatar
              key={appearance.base}
              ref={avatar}
              state={state}
              appearance={appearance}
              reducedMotion={reducedMotion}
              onClipChange={setClip}
            />
          </HeroStage>
        ) : mounted ? (
          <div className="mx-auto h-full max-w-md p-10">
            <Avatar2DFallback state={state} appearance={appearance} pulsing={pulsing} />
            <p className="text-center text-sm text-sand-300">WebGL indisponible : mode 2D.</p>
          </div>
        ) : null}
      </div>
      <div className="scanlines pointer-events-none absolute inset-0" />

      {/* ── En-tête ── */}
      <header className="pointer-events-none absolute left-4 top-4 z-10 max-w-[60vw] md:left-6 md:top-6">
        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-class">Étape 1 · pipeline personnage</p>
        <h1 className="title-slab text-3xl leading-none text-sand-100 md:text-5xl">
          LABO <span className="text-class">{"//"}</span> HÉROS
        </h1>
        <p className="mt-1 text-xs text-sand-300 md:text-sm">Tape sur ton héros pour qu&apos;il contracte.</p>
      </header>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 md:right-6 md:top-6">
        <span className="font-display text-xs tabular-nums text-sand-300" aria-label="images par seconde">
          {fps} FPS
        </span>
        {(["low", "medium", "ultra"] as Quality[]).map((q) => (
          <Chip key={q} active={quality === q} onClick={() => setQuality(q)}>
            {{ low: "Bas", medium: "Moyen", ultra: "Ultra" }[q]}
          </Chip>
        ))}
      </div>

      {/* ── HUD bas-gauche : état courant ── */}
      <div className="pointer-events-none absolute bottom-[47vh] left-4 z-10 md:bottom-6 md:left-6">
        <Panel className="w-56 p-3">
          <p className="font-display text-[10px] uppercase text-sand-300">
            Classe · <span style={{ color: classColor }}>{CLASS_INFO[state.playerClass].label}</span>
          </p>
          <Meter label="Énergie" value={state.energy} color={state.energy < 30 ? "#ff3b5c" : classColor} />
          <Meter label="Définition" value={state.definition} color="#e8d2aa" />
          <p className="mt-2 text-[11px] text-sand-300">
            Anim : <span className="text-sand-100">{CLIP_LABELS[clip]}</span>
          </p>
        </Panel>
      </div>

      {/* ── Panneau de contrôle ── */}
      <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[45vh] md:inset-x-auto md:bottom-6 md:right-6 md:top-20 md:max-h-none md:w-[380px]">
        <Panel className="flex h-full max-h-[45vh] flex-col p-3 md:max-h-full">
          <Tabs<Tab>
            value={tab}
            onChange={(t) => {
              setTab(t);
              setFocusHead(false);
            }}
            tabs={[
              { id: "evo", label: "Évolution" },
              { id: "corps", label: "Corps" },
              { id: "look", label: "Look" },
              { id: "anims", label: "Anims" },
            ]}
          />
          <div className="mt-3 flex-1 overflow-y-auto pr-1">
            {tab === "evo" && (
              <>
                <SectionTitle>Démo · {demo.user.name}, 8 semaines</SectionTitle>
                <GameSlider label="Semaine" value={week} min={0} max={8} onChange={applyWeek} />
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Poids 7 j" value={`${cur.weightKg.toFixed(1)}`} unit="kg" />
                  <Stat label="1RM couché" value={cur.bench1RM ? cur.bench1RM.toFixed(0) : "—"} unit="kg" />
                  <Stat label="Séances" value={`${cur.sessionsDone}/${cur.sessionsPlanned}`} />
                </div>
                <GameButton
                  className="mt-3 w-full"
                  disabled={playing}
                  onClick={() => {
                    avatar.current?.setMorphSmoothing(0.45);
                    applyWeek(0);
                    setPlaying(true);
                  }}
                >
                  {playing ? "Transformation…" : "▶ Rejouer les 8 semaines"}
                </GameButton>
                <SectionTitle>Ce qui a progressé</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(gains).map(([g, d]) => (
                    <span key={g} className="chip bg-night-700 px-2 py-1 text-[11px] text-sand-100">
                      {MUSCLE_LABELS[g as MuscleGroup]} <b className="text-class">+{d}</b>
                    </span>
                  ))}
                  {!Object.keys(gains).length && <span className="text-xs text-sand-300">Semaine 0 : point de départ.</span>}
                </div>
                <SectionTitle>Préréglages</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <Chip key={p.label} onClick={p.apply}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </>
            )}

            {tab === "corps" && (
              <>
                <SectionTitle>Classe</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CLASS_INFO) as PlayerClass[]).map((c) => (
                    <Chip key={c} swatch={CLASS_INFO[c].color} active={state.playerClass === c} onClick={() => setState((s) => ({ ...s, playerClass: c }))}>
                      {CLASS_INFO[c].label}
                    </Chip>
                  ))}
                </div>
                <SectionTitle>État</SectionTitle>
                <GameSlider label="Définition (sèche)" value={state.definition} onChange={(v) => setState((s) => ({ ...s, definition: v }))} />
                <GameSlider label="Énergie" value={state.energy} onChange={(v) => setState((s) => ({ ...s, energy: v }))} />
                <SectionTitle>Niveaux musculaires</SectionTitle>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-1">
                  {MUSCLE_GROUPS.map((g) => (
                    <GameSlider
                      key={g}
                      label={MUSCLE_LABELS[g]}
                      value={state.muscles[g]}
                      onChange={(v) => setState((s) => ({ ...s, muscles: { ...s.muscles, [g]: v } }))}
                    />
                  ))}
                </div>
              </>
            )}

            {tab === "look" && (
              <>
                <SectionTitle>Morphologie</SectionTitle>
                <div className="flex gap-1.5">
                  <Chip active={appearance.base === "m"} onClick={() => setAppearance((a) => ({ ...a, base: "m" }))}>
                    Masculine
                  </Chip>
                  <Chip active={appearance.base === "f"} onClick={() => setAppearance((a) => ({ ...a, base: "f", beard: "none" }))}>
                    Féminine
                  </Chip>
                </div>
                <SectionTitle>Teint</SectionTitle>
                <Swatches colors={SKIN_TONES} value={appearance.skin} onPick={(c) => setAppearance((a) => ({ ...a, skin: c }))} />
                <SectionTitle>Cheveux</SectionTitle>
                <div className="flex flex-wrap gap-1.5" onPointerDown={() => setFocusHead(true)}>
                  {HAIR_STYLES.map((h) => (
                    <Chip key={h} active={appearance.hair === h} onClick={() => setAppearance((a) => ({ ...a, hair: h }))}>
                      {HAIR_LABELS[h]}
                    </Chip>
                  ))}
                </div>
                <div className="mt-2" onPointerDown={() => setFocusHead(true)}>
                  <Swatches colors={HAIR_COLORS} value={appearance.hairColor} onPick={(c) => setAppearance((a) => ({ ...a, hairColor: c }))} />
                </div>
                <SectionTitle>Barbe</SectionTitle>
                <div className="flex flex-wrap gap-1.5" onPointerDown={() => setFocusHead(true)}>
                  {BEARD_STYLES.map((b) => (
                    <Chip key={b} active={appearance.beard === b} onClick={() => setAppearance((a) => ({ ...a, beard: b }))}>
                      {BEARD_LABELS[b]}
                    </Chip>
                  ))}
                </div>
                <SectionTitle>Yeux</SectionTitle>
                <div onPointerDown={() => setFocusHead(true)}>
                  <Swatches colors={EYE_COLORS} value={appearance.eyeColor} onPick={(c) => setAppearance((a) => ({ ...a, eyeColor: c }))} />
                </div>
                <SectionTitle>Visage</SectionTitle>
                <div onPointerDown={() => setFocusHead(true)}>
                  {FACE_MORPHS.map((f) => (
                    <GameSlider
                      key={f}
                      label={FACE_LABELS[f]}
                      value={appearance.face[f] ?? 0}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => setAppearance((a) => ({ ...a, face: { ...a.face, [f]: v } }))}
                    />
                  ))}
                </div>
                <SectionTitle>Tenue</SectionTitle>
                <div className="flex flex-wrap gap-1.5" onPointerDown={() => setFocusHead(false)}>
                  {TOPS.map((t) => (
                    <Chip key={t} active={appearance.top === t} onClick={() => setAppearance((a) => ({ ...a, top: t }))}>
                      {TOP_LABELS[t]}
                    </Chip>
                  ))}
                  {BOTTOMS.map((b) => (
                    <Chip key={b} active={appearance.bottom === b} onClick={() => setAppearance((a) => ({ ...a, bottom: b }))}>
                      {BOTTOM_LABELS[b]}
                    </Chip>
                  ))}
                </div>
                <div className="mt-2" onPointerDown={() => setFocusHead(false)}>
                  <Swatches colors={OUTFIT_COLORS} value={appearance.outfitColor} onPick={(c) => setAppearance((a) => ({ ...a, outfitColor: c }))} />
                </div>
              </>
            )}

            {tab === "anims" && (
              <>
                <SectionTitle>Clips (crossfade)</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  {CLIPS.map((c) => (
                    <GameButton key={c} variant={clip === c ? "class" : "ghost"} className="text-[11px]" onClick={() => avatar.current?.play(c)}>
                      {CLIP_LABELS[c]}
                    </GameButton>
                  ))}
                </div>
                <SectionTitle>Série validée → pulsation</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {MUSCLE_GROUPS.map((g) => (
                    <Chip key={g} onClick={() => pulse(g)}>
                      {MUSCLE_LABELS[g]}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>
      </aside>
    </main>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-sand-300">
        <span>{label}</span>
        <span className="font-display text-sand-100 tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-2 bg-night-700" style={{ clipPath: "polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)" }}>
        <div className="h-full transition-[width] duration-700" style={{ width: `${value}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-night-900/80 px-1 py-2" style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>
      <div className="font-display text-lg leading-none text-sand-100 tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-sand-300">{unit}</span>}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-widest text-sand-300">{label}</div>
    </div>
  );
}

function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          className="chip h-7 w-9"
          style={{ background: c, outline: value === c ? "2px solid var(--class)" : undefined, outlineOffset: 2 }}
        />
      ))}
    </div>
  );
}
