"use client";
/**
 * Création du héros, façon RPG, en 5 étapes :
 * 1. Identité (mensurations, but)   2. Scan photo analysé par Claude
 * 3. Apparence (studio, randomiser) 4. Classe (fiche de stats animée)
 * 5. Pacte + projection à 6 mois, signé d'un appui long.
 */
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BEARD_LABELS,
  BEARD_STYLES,
  BOTTOMS,
  BOTTOM_LABELS,
  FACE_MORPHS,
  HAIR_LABELS,
  HAIR_STYLES,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type MuscleGroup,
  TOPS,
  TOP_LABELS,
} from "@/avatar/contract";
import { type Appearance, CLASS_INFO, EYE_COLORS, HAIR_COLORS, type PlayerClass, SKIN_TONES } from "@/avatar/params";
import { Chip, GameButton, GameSlider, Panel, SectionTitle } from "@/components/ui/game";
import { ACTIVITY_LABELS, type Activity, GOAL_LABELS, type Goal, nutritionTargets } from "@/engine/nutrition";
import { TRAINING_LABELS, type TrainingLevel, meanLevel } from "@/engine/physiology";
import { analyzePhotos, canAnalyzePhotos, compressPhoto, questionnaireScan, type ScanResult } from "../bodyScan";
import { sampleErrorMessage } from "../claude";
import { pactProjection } from "../projection";
import { STATS, STAT_LABELS, statSheet, suggestedClass } from "../rpg";
import type { Pact, Profile } from "../types";
import { Bar, HoldButton, Stepper } from "../ui";

export interface Draft {
  profile: Profile;
  scan: ScanResult | null;
  appearance: Appearance;
  playerClass: PlayerClass;
  pact: Pact;
  photos: { front: Blob | null; back: Blob | null };
  keepPhotos: boolean;
}

export type Step = "identity" | "scan" | "look" | "class" | "pact";
export const STEPS: { id: Step; label: string }[] = [
  { id: "identity", label: "Identité" },
  { id: "scan", label: "Scan" },
  { id: "look", label: "Apparence" },
  { id: "class", label: "Classe" },
  { id: "pact", label: "Pacte" },
];

interface StepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  next: () => void;
  back?: () => void;
}

/** Cadre commun d'une étape : titre, corps défilant, barre d'actions. */
function StepShell({ step, title, subtitle, children, actions }: { step: Step; title: string; subtitle: string; children: React.ReactNode; actions: React.ReactNode }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[58dvh] flex-col md:inset-y-6 md:left-auto md:right-6 md:max-h-none md:w-[420px]">
      <Panel className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5" aria-label={`Étape ${idx + 1} sur ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 flex-1 ${i <= idx ? "bg-class" : "bg-night-700"}`} style={{ clipPath: "polygon(3px 0,100% 0,calc(100% - 3px) 100%,0 100%)" }} />
          ))}
        </div>
        <p className="mt-3 font-display text-[10px] uppercase tracking-[0.3em] text-class">
          {idx + 1} / {STEPS.length} · {STEPS[idx].label}
        </p>
        <h2 className="title-slab text-2xl leading-tight text-sand-100">{title}</h2>
        <p className="mt-1 text-sm text-sand-300">{subtitle}</p>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
        <div className="mt-3 flex gap-2">{actions}</div>
      </Panel>
    </div>
  );
}

// ── 1. Identité ───────────────────────────────────────────────────────────
export function IdentityStep({ draft, update, next }: StepProps) {
  const p = draft.profile;
  const set = (patch: Partial<Profile>) => update({ profile: { ...p, ...patch } });
  const valid = p.heroName.trim().length >= 2;
  return (
    <StepShell
      step="identity"
      title="Qui es-tu ?"
      subtitle="Ton héros part de ton vrai corps. Ces infos restent dans ton espace privé."
      actions={
        <GameButton className="flex-1" disabled={!valid} onClick={next}>
          Continuer
        </GameButton>
      }
    >
      <label htmlFor="hero-name" className="text-[11px] uppercase tracking-[0.14em] text-sand-300">
        Nom du héros
      </label>
      <input
        id="hero-name"
        className="mt-1 w-full bg-night-900/80 px-3 py-2.5 font-display text-lg text-sand-100 outline-none focus:ring-2 focus:ring-[var(--class)]"
        style={{ clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)" }}
        maxLength={18}
        placeholder="Ton nom de guerre"
        value={p.heroName}
        onChange={(e) => set({ heroName: e.target.value })}
      />
      <SectionTitle>Morphologie de base</SectionTitle>
      <div className="flex gap-1.5">
        <Chip active={p.sex === "m"} onClick={() => set({ sex: "m" })}>
          Masculine
        </Chip>
        <Chip active={p.sex === "f"} onClick={() => set({ sex: "f" })}>
          Féminine
        </Chip>
      </div>
      <SectionTitle>Mensurations</SectionTitle>
      <div className="grid gap-1.5">
        <Stepper label="Âge" value={p.age} min={14} max={90} unit="ans" onChange={(age) => set({ age })} />
        <Stepper label="Taille" value={p.heightCm} min={130} max={225} unit="cm" onChange={(heightCm) => set({ heightCm })} />
        <Stepper label="Poids" value={p.weightKg} min={35} max={220} step={0.5} unit="kg" onChange={(weightKg) => set({ weightKg })} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label htmlFor="bf-known" className="text-xs text-sand-300">
          Je connais mon % de masse grasse (balance, InBody)
        </label>
        <input
          id="bf-known"
          type="checkbox"
          className="h-5 w-5 accent-[var(--class)]"
          checked={p.measuredBodyFat !== null}
          onChange={(e) => set({ measuredBodyFat: e.target.checked ? 18 : null })}
        />
      </div>
      {p.measuredBodyFat !== null && (
        <div className="mt-1.5">
          <Stepper label="Masse grasse" value={p.measuredBodyFat} min={4} max={55} step={0.5} unit="%" onChange={(measuredBodyFat) => set({ measuredBodyFat })} />
        </div>
      )}
      <SectionTitle>Expérience</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TRAINING_LABELS) as TrainingLevel[]).map((t) => (
          <Chip key={t} active={p.training === t} onClick={() => set({ training: t })}>
            {TRAINING_LABELS[t]}
          </Chip>
        ))}
      </div>
      <SectionTitle>Objectif</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
          <Chip key={g} active={p.goal === g} onClick={() => set({ goal: g })}>
            {GOAL_LABELS[g]}
          </Chip>
        ))}
      </div>
      <SectionTitle>Activité hors sport</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
          <Chip key={a} active={p.activity === a} onClick={() => set({ activity: a })}>
            {ACTIVITY_LABELS[a]}
          </Chip>
        ))}
      </div>
    </StepShell>
  );
}

// ── 2. Scan photo ─────────────────────────────────────────────────────────
function PhotoSlot({ label, blob, onPick, required }: { label: string; blob: Blob | null; onPick: (b: Blob | null) => void; required?: boolean }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const id = `photo-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="relative flex-1">
      <label
        htmlFor={id}
        className="relative flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center overflow-hidden bg-night-900/80 text-center"
        style={{ clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <span className="font-display text-3xl text-class">+</span>
            <span className="mt-1 px-2 text-xs uppercase tracking-widest text-sand-300">{label}</span>
            <span className="mt-1 text-[10px] text-sand-500">{required ? "obligatoire" : "facultatif"}</span>
          </>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onPick(await compressPhoto(f));
        }}
      />
      {blob && (
        <button type="button" className="chip absolute right-1 top-1 bg-night-950/80 px-2 py-0.5 text-[10px] uppercase text-sand-100" onClick={() => onPick(null)}>
          Retirer
        </button>
      )}
    </div>
  );
}

export function ScanStep({ draft, update, next, back }: StepProps) {
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    canAnalyzePhotos().then((ok) => alive && setAiReady(ok));
    return () => {
      alive = false;
    };
  }, []);

  const run = async () => {
    if (!draft.photos.front) return;
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const scan = await analyzePhotos(draft.profile, draft.photos.front, draft.photos.back, ctl.current.signal);
      update({ scan, appearance: { ...draft.appearance, ...stripUndefined(scan.appearance) } });
    } catch (e) {
      if ((e as { code?: string })?.code !== "cancelled") setError(sampleErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const scan = draft.scan;
  if (scan) {
    return (
      <StepShell
        step="scan"
        title="Ton point de départ"
        subtitle={scan.source === "photo" ? `Analyse photo · fiabilité ${Math.round(scan.confidence * 100)} %` : "Estimation par questionnaire"}
        actions={
          <>
            <GameButton variant="ghost" onClick={() => update({ scan: null })}>
              Refaire
            </GameButton>
            <GameButton className="flex-1" onClick={next}>
              C&apos;est moi
            </GameButton>
          </>
        }
      >
        {scan.summary && <p className="text-sm text-sand-100">{scan.summary}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="bg-night-900/80 py-2">
            <div className="font-display text-xl text-sand-100 tabular-nums">{scan.bodyFat.toFixed(1)} %</div>
            <div className="text-[9px] uppercase tracking-widest text-sand-300">Masse grasse</div>
          </div>
          <div className="bg-night-900/80 py-2">
            <div className="font-display text-xl text-sand-100 tabular-nums">{Math.round(meanLevel(scan.muscles))}</div>
            <div className="text-[9px] uppercase tracking-widest text-sand-300">Niveau musculaire moyen</div>
          </div>
        </div>
        {(scan.strengths.length > 0 || scan.focus.length > 0) && (
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {scan.strengths.length > 0 && (
              <ul className="bg-night-900/60 p-2">
                <li className="mb-1 font-display text-[10px] uppercase text-class">Points forts</li>
                {scan.strengths.map((s) => (
                  <li key={s} className="text-sand-100">
                    · {s}
                  </li>
                ))}
              </ul>
            )}
            {scan.focus.length > 0 && (
              <ul className="bg-night-900/60 p-2">
                <li className="mb-1 font-display text-[10px] uppercase text-signal">Priorités</li>
                {scan.focus.map((s) => (
                  <li key={s} className="text-sand-100">
                    · {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <SectionTitle>Niveaux par muscle (ajustables)</SectionTitle>
        <div className="grid gap-1">
          {MUSCLE_GROUPS.map((g) => (
            <GameSlider
              key={g}
              label={MUSCLE_LABELS[g]}
              value={scan.muscles[g]}
              min={5}
              max={100}
              onChange={(v) => update({ scan: { ...scan, muscles: { ...scan.muscles, [g]: v } } })}
            />
          ))}
          <GameSlider label="Masse grasse (%)" value={scan.bodyFat} min={4} max={55} step={0.5} onChange={(v) => update({ scan: { ...scan, bodyFat: v } })} />
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      step="scan"
      title="Scan corporel"
      subtitle="Une photo de face (et de dos si tu veux), en tenue de sport, bien éclairée, corps entier. Claude estime tes points de départ."
      actions={
        <>
          {back && (
            <GameButton variant="ghost" onClick={back}>
              Retour
            </GameButton>
          )}
          {busy ? (
            <GameButton variant="ghost" className="flex-1" onClick={() => ctl.current?.abort()}>
              Arrêter l&apos;analyse
            </GameButton>
          ) : (
            <GameButton className="flex-1" disabled={!draft.photos.front || !aiReady} onClick={run}>
              Analyser mon corps
            </GameButton>
          )}
        </>
      }
    >
      <div className="flex gap-2">
        <PhotoSlot label="Face" required blob={draft.photos.front} onPick={(front) => update({ photos: { ...draft.photos, front } })} />
        <PhotoSlot label="Dos" blob={draft.photos.back} onPick={(back) => update({ photos: { ...draft.photos, back } })} />
      </div>
      {busy && (
        <div className="relative mt-3 h-10 overflow-hidden bg-night-900/80">
          <motion.div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--class)] to-transparent opacity-70" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} />
          <p className="relative flex h-full items-center justify-center font-display text-xs uppercase tracking-[0.3em] text-sand-100">Analyse en cours…</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <label htmlFor="keep-photos" className="text-xs text-sand-300">
          Garder ces photos dans ma timeline privée (avant / après)
        </label>
        <input id="keep-photos" type="checkbox" className="h-5 w-5 accent-[var(--class)]" checked={draft.keepPhotos} onChange={(e) => update({ keepPhotos: e.target.checked })} />
      </div>
      {aiReady === false && (
        <p className="mt-3 bg-night-900/70 p-2 text-xs text-sand-300">
          L&apos;analyse photo fonctionne dans la version en ligne (artefact claude.ai). Ici, utilise l&apos;estimation par questionnaire.
        </p>
      )}
      {error && <p className="mt-3 bg-[color-mix(in_oklab,var(--danger)_20%,transparent)] p-2 text-xs text-sand-100">{error}</p>}
      <button type="button" className="mt-3 text-xs text-sand-300 underline underline-offset-4" onClick={() => update({ scan: questionnaireScan(draft.profile) })}>
        Passer : estimer sans photo
      </button>
    </StepShell>
  );
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ── 3. Apparence ──────────────────────────────────────────────────────────
type LookZone = "visage" | "cheveux" | "tenue";
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
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={value === c} onClick={() => onPick(c)} className="chip h-7 w-9" style={{ background: c, outline: value === c ? "2px solid var(--class)" : undefined, outlineOffset: 2 }} />
      ))}
    </div>
  );
}

export function LookStep({ draft, update, next, back, onZone }: StepProps & { onZone: (z: LookZone) => void }) {
  const [zone, setZone] = useState<LookZone>("visage");
  const a = draft.appearance;
  const set = (patch: Partial<Appearance>) => update({ appearance: { ...a, ...patch } });
  useEffect(() => onZone(zone), [zone, onZone]);
  const randomize = () =>
    set({
      skin: pick(SKIN_TONES),
      hair: pick(HAIR_STYLES),
      hairColor: pick(HAIR_COLORS),
      beard: draft.profile.sex === "m" ? pick(BEARD_STYLES) : "none",
      eyeColor: pick(EYE_COLORS),
      top: pick(TOPS),
      outfitColor: pick(OUTFIT_COLORS),
      face: Object.fromEntries(FACE_MORPHS.map((f) => [f, Math.round(Math.random() * 0.6 * 100) / 100])),
    });
  return (
    <StepShell
      step="look"
      title="Ton apparence"
      subtitle="Pré-remplie d'après ta photo. Le reste se débloque en jouant."
      actions={
        <>
          {back && (
            <GameButton variant="ghost" onClick={back}>
              Retour
            </GameButton>
          )}
          <GameButton variant="ghost" onClick={randomize}>
            Randomiser
          </GameButton>
          <GameButton className="flex-1" onClick={next}>
            Valider
          </GameButton>
        </>
      }
    >
      <div className="flex gap-1">
        {(["visage", "cheveux", "tenue"] as LookZone[]).map((z) => (
          <Chip key={z} active={zone === z} onClick={() => setZone(z)}>
            {z}
          </Chip>
        ))}
      </div>
      {zone === "visage" && (
        <>
          <SectionTitle>Teint</SectionTitle>
          <Swatches colors={SKIN_TONES} value={a.skin} onPick={(skin) => set({ skin })} />
          <SectionTitle>Yeux</SectionTitle>
          <Swatches colors={EYE_COLORS} value={a.eyeColor} onPick={(eyeColor) => set({ eyeColor })} />
          <SectionTitle>Traits</SectionTitle>
          {FACE_MORPHS.map((f) => (
            <GameSlider key={f} label={FACE_LABELS[f]} value={a.face[f] ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ face: { ...a.face, [f]: v } })} />
          ))}
        </>
      )}
      {zone === "cheveux" && (
        <>
          <SectionTitle>Coupe</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {HAIR_STYLES.map((h) => (
              <Chip key={h} active={a.hair === h} onClick={() => set({ hair: h })}>
                {HAIR_LABELS[h]}
              </Chip>
            ))}
          </div>
          <SectionTitle>Couleur</SectionTitle>
          <Swatches colors={HAIR_COLORS} value={a.hairColor} onPick={(hairColor) => set({ hairColor })} />
          <SectionTitle>Barbe</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {BEARD_STYLES.map((b) => (
              <Chip key={b} active={a.beard === b} onClick={() => set({ beard: b })}>
                {BEARD_LABELS[b]}
              </Chip>
            ))}
          </div>
        </>
      )}
      {zone === "tenue" && (
        <>
          <SectionTitle>Haut</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {TOPS.map((t) => (
              <Chip key={t} active={a.top === t} onClick={() => set({ top: t })}>
                {TOP_LABELS[t]}
              </Chip>
            ))}
          </div>
          <SectionTitle>Bas</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {BOTTOMS.map((b) => (
              <Chip key={b} active={a.bottom === b} onClick={() => set({ bottom: b })}>
                {BOTTOM_LABELS[b]}
              </Chip>
            ))}
          </div>
          <SectionTitle>Couleur de tenue</SectionTitle>
          <Swatches colors={OUTFIT_COLORS} value={a.outfitColor} onPick={(outfitColor) => set({ outfitColor })} />
        </>
      )}
    </StepShell>
  );
}

// ── 4. Classe ─────────────────────────────────────────────────────────────
export function ClassStep({ draft, update, next, back }: StepProps) {
  const scan = draft.scan!;
  const suggested = suggestedClass(draft.profile.goal, draft.profile.activity);
  const sheet = statSheet({
    muscles: scan.muscles,
    bodyFat: scan.bodyFat,
    sex: draft.profile.sex,
    activity: draft.profile.activity,
    sleepHours: draft.pact.sleepHours,
    playerClass: draft.playerClass,
  });
  return (
    <StepShell
      step="class"
      title="Ta classe de départ"
      subtitle="Elle teinte ton aura et ton interface. Elle évoluera avec ce que tu fais vraiment."
      actions={
        <>
          {back && (
            <GameButton variant="ghost" onClick={back}>
              Retour
            </GameButton>
          )}
          <GameButton className="flex-1" onClick={next}>
            Choisir {CLASS_INFO[draft.playerClass].label}
          </GameButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(CLASS_INFO) as PlayerClass[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={draft.playerClass === c}
            onClick={() => update({ playerClass: c })}
            className="relative bg-night-900/80 p-3 text-left transition-colors"
            style={{
              clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)",
              boxShadow: draft.playerClass === c ? `inset 0 0 0 2px ${CLASS_INFO[c].color}` : undefined,
            }}
          >
            <span className="font-display text-sm" style={{ color: CLASS_INFO[c].color }}>
              {CLASS_INFO[c].label}
            </span>
            {c === suggested && <span className="ml-1 text-[9px] uppercase text-sand-300">· conseillée</span>}
            <span className="mt-1 block text-[11px] leading-snug text-sand-300">{CLASS_INFO[c].tagline}</span>
          </button>
        ))}
      </div>
      <SectionTitle>Fiche de personnage</SectionTitle>
      <motion.div key={draft.playerClass} className="grid gap-2" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.08 } } }}>
        {STATS.map((s) => (
          <motion.div key={s} variants={{ h: { opacity: 0, x: 12 }, v: { opacity: 1, x: 0 } }}>
            <Bar label={STAT_LABELS[s]} value={sheet[s]} />
          </motion.div>
        ))}
      </motion.div>
    </StepShell>
  );
}

// ── 5. Pacte + projection 6 mois ──────────────────────────────────────────
export function PactStep({ draft, update, back, onSign, showFuture, setShowFuture }: StepProps & { onSign: () => void; showFuture: boolean; setShowFuture: (v: boolean) => void }) {
  const p = draft.profile;
  const scan = draft.scan!;
  const targets = nutritionTargets(p);
  const proj = useMemo(() => pactProjection(p, scan, draft.pact), [p, scan, draft.pact]);
  const now = proj[0],
    end = proj[26];
  const gains = MUSCLE_GROUPS.map((g) => [g, end.muscles[g] - now.muscles[g]] as [MuscleGroup, number]).sort((a, b) => b[1] - a[1]);
  return (
    <StepShell
      step="pact"
      title="Ton pacte"
      subtitle="Ce que tu t'engages à faire. Le jeu calcule ce que ton corps devient si tu le tiens."
      actions={
        <>
          {back && (
            <GameButton variant="ghost" onClick={back}>
              Retour
            </GameButton>
          )}
          <div className="flex-1">
            <HoldButton onDone={onSign}>Maintiens pour signer</HoldButton>
          </div>
        </>
      }
    >
      <div className="grid gap-1.5">
        <Stepper label="Séances / semaine" value={draft.pact.sessionsPerWeek} min={1} max={6} onChange={(v) => update({ pact: { ...draft.pact, sessionsPerWeek: v } })} />
        <Stepper label="Sommeil visé" value={draft.pact.sleepHours} min={5} max={10} step={0.5} unit="h" onChange={(v) => update({ pact: { ...draft.pact, sleepHours: v } })} />
      </div>
      {draft.pact.sessionsPerWeek >= 6 && <p className="mt-1 text-xs text-sand-300">Pense aux jours de repos : ils rapportent aussi de l&apos;XP.</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="bg-night-900/80 py-2">
          <div className="font-display text-lg text-sand-100 tabular-nums">{targets.kcal}</div>
          <div className="text-[9px] uppercase tracking-widest text-sand-300">kcal / jour ({GOAL_LABELS[p.goal]})</div>
        </div>
        <div className="bg-night-900/80 py-2">
          <div className="font-display text-lg text-sand-100 tabular-nums">{targets.proteinG} g</div>
          <div className="text-[9px] uppercase tracking-widest text-sand-300">protéines / jour</div>
        </div>
      </div>

      <SectionTitle>Projection</SectionTitle>
      <div className="flex gap-1.5">
        <Chip active={!showFuture} onClick={() => setShowFuture(false)}>
          Aujourd&apos;hui
        </Chip>
        <Chip active={showFuture} onClick={() => setShowFuture(true)}>
          Dans 6 mois
        </Chip>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ["Poids", `${end.weightKg.toFixed(1)} kg`, `${(end.weightKg - now.weightKg >= 0 ? "+" : "")}${(end.weightKg - now.weightKg).toFixed(1)}`],
          ["Masse grasse", `${end.bodyFat.toFixed(1)} %`, `${(end.bodyFat - now.bodyFat >= 0 ? "+" : "")}${(end.bodyFat - now.bodyFat).toFixed(1)}`],
          ["Muscle", `${end.leanKg.toFixed(1)} kg`, `+${(end.leanKg - now.leanKg).toFixed(1)}`],
        ].map(([l, v, d]) => (
          <div key={l} className="bg-night-900/80 px-1 py-2">
            <div className="font-display text-sm text-sand-100 tabular-nums">{v}</div>
            <div className="text-[10px] text-record tabular-nums">{d}</div>
            <div className="text-[9px] uppercase tracking-widest text-sand-300">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-1.5">
        {gains.slice(0, 5).map(([g, d]) => (
          <Bar key={g} label={MUSCLE_LABELS[g]} value={end.muscles[g]} delta={d} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-sand-500">
        Modèle : gains de masse maigre selon ton expérience, ton volume, tes protéines, ton sommeil et ta balance calorique. C&apos;est une projection, pas une promesse : ton héros suivra tes vraies données.
      </p>
    </StepShell>
  );
}
