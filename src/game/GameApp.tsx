"use client";
/**
 * MUE — le jeu. Une seule scène 3D persistante (le héros) derrière des écrans
 * qui s'enchaînent : boot → titre → création du héros → accueil.
 */
import { useProgress } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AvatarRenderer } from "@/avatar/AvatarRenderer";
import { HeroAvatar } from "@/avatar/HeroAvatar";
import { Avatar2DFallback } from "@/avatar/Avatar2DFallback";
import { type AvatarState, CLASS_INFO, DEFAULT_APPEARANCE, DEFAULT_STATE } from "@/avatar/params";
import { HeroStage } from "@/components/three/HeroStage";
import { definitionFrom } from "@/engine/evolution";
import { hasWebGL, useQuality, usePrefersReducedMotion } from "@/lib/settings";
import { type AssetsCap, getCapability } from "./claude";
import { pactProjection, startEnergy } from "./projection";
import { suggestedClass } from "./rpg";
import { BootScreen } from "./screens/Boot";
import { HomeScreen } from "./screens/Home";
import { ClassStep, type Draft, IdentityStep, LookStep, PactStep, ScanStep, type Step } from "./screens/Onboarding";
import { TitleScreen } from "./screens/Title";
import { getStorage, type SaveStorage } from "./storage";
import type { SaveData } from "./types";
import { WipeSwitch } from "./ui";

/** `mode` : création complète, nouveau scan, ou retouche de l'apparence. */
type Phase = { id: "boot" } | { id: "title" } | { id: "create"; step: Step; mode: "new" | "rescan" | "look" } | { id: "home" };

const ORDER: Step[] = ["identity", "scan", "look", "class", "pact"];

const newDraft = (): Draft => ({
  profile: {
    heroName: "",
    sex: "m",
    age: 28,
    heightCm: 178,
    weightKg: 78,
    measuredBodyFat: null,
    training: "debutant",
    goal: "maintien",
    activity: "leger",
  },
  scan: null,
  appearance: { ...DEFAULT_APPEARANCE },
  playerClass: "hybride",
  pact: { sessionsPerWeek: 3, sleepHours: 7.5 },
  photos: { front: null, back: null },
  keepPhotos: true,
});

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function GameApp() {
  const mounted = useMounted();
  const quality = useQuality();
  const reducedMotion = usePrefersReducedMotion();
  const avatar = useRef<AvatarRenderer>(null);
  const [phase, setPhase] = useState<Phase>({ id: "boot" });
  const [storage, setStorage] = useState<SaveStorage | null>(null);
  const [save, setSave] = useState<SaveData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [lookZone, setLookZone] = useState<"visage" | "cheveux" | "tenue">("visage");
  const [showFuture, setShowFuture] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const { progress: loaderProgress } = useProgress();

  // Chargement de la sauvegarde.
  useEffect(() => {
    let alive = true;
    (async () => {
      const st = await getStorage();
      const data = await st.load().catch(() => null);
      if (!alive) return;
      setStorage(st);
      setSave(data);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  // ── État affiché par l'avatar ─────────────────────────────────────────
  const creating = phase.id === "create";
  const source = useMemo(
    () =>
      creating
        ? draft
        : save
          ? { profile: save.profile, scan: save.baseline, pact: save.pact, appearance: save.appearance, playerClass: save.playerClass }
          : null,
    [creating, draft, save],
  );
  const projection = useMemo(() => (source?.scan ? pactProjection(source.profile, source.scan, source.pact) : null), [source]);
  const avatarState: AvatarState = useMemo(() => {
    if (!source?.scan || !projection) return { ...DEFAULT_STATE, playerClass: source?.playerClass ?? "hybride" };
    const point = showFuture ? projection[projection.length - 1] : projection[0];
    return {
      muscles: point.muscles,
      definition: showFuture ? point.definition : definitionFrom({ bodyFat7d: source.scan.bodyFat, sex: source.profile.sex }),
      energy: startEnergy(source.pact.sleepHours) + (showFuture ? 8 : 0),
      playerClass: source.playerClass,
    };
  }, [source, projection, showFuture]);
  const appearance = useMemo(() => ({ ...(source?.appearance ?? DEFAULT_APPEARANCE), base: source?.profile.sex ?? "m" }), [source]);
  const classColor = CLASS_INFO[avatarState.playerClass].color;
  useEffect(() => {
    document.documentElement.style.setProperty("--class", classColor);
  }, [classColor]);

  // Transformation lente quand on bascule aujourd'hui ↔ 6 mois.
  useEffect(() => {
    avatar.current?.setMorphSmoothing(showFuture ? 1.1 : 0.6);
    if (showFuture) avatar.current?.play("flex");
  }, [showFuture]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const go = (step: Step) => setPhase((ph) => ({ id: "create", step, mode: ph.id === "create" ? ph.mode : "new" }));
  const nextStep = (cur: Step) => {
    const i = ORDER.indexOf(cur);
    if (phase.id === "create" && phase.mode === "rescan" && cur === "scan") {
      void finishRescan();
      return;
    }
    if (phase.id === "create" && phase.mode === "look" && cur === "look" && save) {
      void persist({ ...save, appearance: { ...draft.appearance, base: save.profile.sex } }).then(() => setPhase({ id: "home" }));
      return;
    }
    if (cur === "look") update({ playerClass: suggestedClass(draft.profile.goal, draft.profile.activity) });
    go(ORDER[Math.min(ORDER.length - 1, i + 1)]);
  };
  const prevStep = (cur: Step) => go(ORDER[Math.max(0, ORDER.indexOf(cur) - 1)]);

  const persist = async (data: SaveData) => {
    setSave(data);
    await storage?.save(data);
  };

  /** Envoie les photos à conserver dans les assets privés de l'artefact. */
  const uploadPhotos = async (): Promise<string[]> => {
    if (!draft.keepPhotos) return [];
    const assets = await getCapability<AssetsCap>("assets");
    if (!assets) return [];
    const ids: string[] = [];
    for (const b of [draft.photos.front, draft.photos.back]) {
      if (!b) continue;
      try {
        ids.push((await assets.upload(b)).id);
      } catch {
        /* photo non conservée : la partie continue */
      }
    }
    return ids;
  };

  const sign = async () => {
    if (!draft.scan) return;
    setSaving("Signature du pacte…");
    const photoIds = await uploadPhotos();
    const { appearance: scanLook, ...scan } = draft.scan;
    void scanLook;
    const data: SaveData = {
      version: 1,
      createdAt: new Date().toISOString(),
      profile: draft.profile,
      baseline: { ...scan, photoIds },
      appearance: { ...draft.appearance, base: draft.profile.sex },
      playerClass: draft.playerClass,
      pact: draft.pact,
      // Progrès offert : le niveau 1 démarre déjà rempli à 20 %.
      xp: { level: 1, progress: 0.2 },
      settings: { hideWeight: false },
    };
    await persist(data);
    setSaving(null);
    setShowFuture(false);
    setPhase({ id: "home" });
    window.setTimeout(() => avatar.current?.play("level_up"), 700);
  };

  const finishRescan = async () => {
    if (!save || !draft.scan) return;
    setSaving("Mise à jour du point de départ…");
    const photoIds = await uploadPhotos();
    const { appearance: scanLook, ...scan } = draft.scan;
    void scanLook;
    await persist({ ...save, profile: draft.profile, baseline: { ...scan, photoIds: [...save.baseline.photoIds, ...photoIds] } });
    setSaving(null);
    setPhase({ id: "home" });
  };

  const startGame = () => {
    if (save) setPhase({ id: "home" });
    else {
      setDraft(newDraft());
      setPhase({ id: "create", step: "identity", mode: "new" });
    }
  };

  // ── Caméra ─────────────────────────────────────────────────────────────
  const focus =
    phase.id === "create" && (phase.step === "look" ? lookZone !== "tenue" : false)
      ? { y: 1.6, distance: 1.1 }
      : phase.id === "title" || phase.id === "boot"
        ? { y: 1.35, distance: 5.4 }
        : { y: 0.95, distance: 4.0 };
  const autoRotate = phase.id === "title" || phase.id === "boot";

  const webgl = mounted && hasWebGL();
  const bootProgress = modelReady ? 1 : Math.min(0.95, loaderProgress / 100 || 0.15);
  const screenKey = phase.id === "create" ? `create-${phase.step}` : phase.id;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-night-950 text-sand-100">
      <div className="absolute inset-0">
        {mounted && webgl ? (
          <HeroStage classColor={classColor} quality={quality} reducedMotion={reducedMotion} autoRotate={autoRotate} focus={focus}>
            <HeroAvatar
              key={appearance.base}
              ref={avatar}
              state={avatarState}
              appearance={appearance}
              reducedMotion={reducedMotion}
              onReady={() => setModelReady(true)}
            />
          </HeroStage>
        ) : mounted ? (
          <div className="mx-auto h-full max-w-md p-10">
            <Avatar2DFallback state={avatarState} appearance={appearance} />
          </div>
        ) : null}
      </div>
      <div className="scanlines pointer-events-none absolute inset-0" />

      {phase.id === "boot" && (
        <BootScreen
          progress={loaded && (modelReady || !webgl) ? 1 : bootProgress}
          onDone={() => setPhase({ id: "title" })}
        />
      )}

      {phase.id !== "boot" && (
        <WipeSwitch id={screenKey}>
          {phase.id === "title" && <TitleScreen heroName={save?.profile.heroName ?? null} onStart={startGame} />}
          {phase.id === "create" && phase.step === "identity" && <IdentityStep draft={draft} update={update} next={() => nextStep("identity")} />}
          {phase.id === "create" && phase.step === "scan" && (
            <ScanStep draft={draft} update={update} next={() => nextStep("scan")} back={phase.mode === "rescan" ? () => setPhase({ id: "home" }) : () => prevStep("scan")} />
          )}
          {phase.id === "create" && phase.step === "look" && (
            <LookStep
              draft={draft}
              update={update}
              onZone={setLookZone}
              next={() => nextStep("look")}
              back={phase.mode === "look" ? () => setPhase({ id: "home" }) : () => prevStep("look")}
            />
          )}
          {phase.id === "create" && phase.step === "class" && <ClassStep draft={draft} update={update} next={() => nextStep("class")} back={() => prevStep("class")} />}
          {phase.id === "create" && phase.step === "pact" && (
            <PactStep draft={draft} update={update} next={() => {}} back={() => prevStep("pact")} onSign={sign} showFuture={showFuture} setShowFuture={setShowFuture} />
          )}
          {phase.id === "home" && save && (
            <HomeScreen
              save={save}
              storageKind={storage?.kind ?? "aucun"}
              showFuture={showFuture}
              setShowFuture={setShowFuture}
              onRescan={() => {
                setDraft({ ...newDraft(), profile: save.profile, appearance: save.appearance, playerClass: save.playerClass, pact: save.pact });
                setPhase({ id: "create", step: "scan", mode: "rescan" });
              }}
              onEditLook={() => {
                setDraft({ ...newDraft(), profile: save.profile, scan: { ...save.baseline, appearance: {} }, appearance: save.appearance, playerClass: save.playerClass, pact: save.pact });
                setPhase({ id: "create", step: "look", mode: "look" });
              }}
              onToggleWeight={() => void persist({ ...save, settings: { ...save.settings, hideWeight: !save.settings.hideWeight } })}
              onReset={async () => {
                await storage?.clear();
                setSave(null);
                setShowFuture(false);
                setDraft(newDraft());
                setPhase({ id: "title" });
              }}
            />
          )}
        </WipeSwitch>
      )}

      {saving && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-night-950/70">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-sand-100">{saving}</p>
        </div>
      )}
    </main>
  );
}
