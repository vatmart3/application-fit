"use client";
/**
 * Accueil du héros (provisoire, avant le QG 3D de l'étape 3) : fiche de
 * personnage, XP, point de départ, projection, sauvegarde.
 */
import { useState } from "react";
import { MUSCLE_GROUPS, MUSCLE_LABELS } from "@/avatar/contract";
import { CLASS_INFO } from "@/avatar/params";
import { Chip, GameButton, Panel, SectionTitle } from "@/components/ui/game";
import { GOAL_LABELS, nutritionTargets } from "@/engine/nutrition";
import { STATS, STAT_LABELS, statSheet } from "../rpg";
import type { SaveData } from "../types";
import { Bar } from "../ui";

export function HomeScreen({
  save,
  storageKind,
  showFuture,
  setShowFuture,
  onRescan,
  onEditLook,
  onReset,
  onToggleWeight,
}: {
  save: SaveData;
  storageKind: string;
  showFuture: boolean;
  setShowFuture: (v: boolean) => void;
  onRescan: () => void;
  onEditLook: () => void;
  onReset: () => void;
  onToggleWeight: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const { profile: p, baseline: b } = save;
  const t = nutritionTargets(p);
  const sheet = statSheet({ muscles: b.muscles, bodyFat: b.bodyFat, sex: p.sex, activity: p.activity, sleepHours: save.pact.sleepHours, playerClass: save.playerClass });
  const color = CLASS_INFO[save.playerClass].color;

  return (
    <>
      {/* HUD haut : portrait, niveau, XP */}
      <header className="absolute inset-x-4 top-4 z-20 md:left-6 md:right-auto md:top-6 md:w-[360px]">
        <Panel className="p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center font-display text-xl text-night-950" style={{ background: color, clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)" }}>
              {save.xp.level}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg leading-none text-sand-100">{p.heroName}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color }}>
                {CLASS_INFO[save.playerClass].label} · {GOAL_LABELS[p.goal]}
              </p>
              <div className="mt-1.5 h-2 bg-night-700" title="Progrès offert : ton niveau 1 démarre déjà à 20 %">
                <div className="h-full bg-signal" style={{ width: `${save.xp.progress * 100}%`, boxShadow: "0 0 10px var(--signal)" }} />
              </div>
            </div>
          </div>
        </Panel>
      </header>

      <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[50dvh] md:inset-x-auto md:bottom-6 md:right-6 md:top-6 md:max-h-none md:w-[400px]">
        <Panel className="flex h-full max-h-[50dvh] flex-col p-4 md:max-h-full">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex gap-1.5">
              <Chip active={!showFuture} onClick={() => setShowFuture(false)}>
                Moi aujourd&apos;hui
              </Chip>
              <Chip active={showFuture} onClick={() => setShowFuture(true)}>
                Moi dans 6 mois
              </Chip>
            </div>
            <SectionTitle>Fiche de personnage</SectionTitle>
            <div className="grid gap-2">
              {STATS.map((s) => (
                <Bar key={s} label={STAT_LABELS[s]} value={sheet[s]} />
              ))}
            </div>
            <SectionTitle>Point de départ</SectionTitle>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [save.settings.hideWeight ? "—" : `${p.weightKg} kg`, "Poids"],
                [`${b.bodyFat.toFixed(1)} %`, "Masse grasse"],
                [`${t.kcal}`, "kcal visées"],
              ].map(([v, l]) => (
                <div key={l} className="bg-night-900/80 px-1 py-2">
                  <div className="font-display text-sm text-sand-100 tabular-nums">{v}</div>
                  <div className="text-[9px] uppercase tracking-widest text-sand-300">{l}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-1.5">
              {MUSCLE_GROUPS.map((g) => (
                <Bar key={g} label={MUSCLE_LABELS[g]} value={b.muscles[g]} color="#e8d2aa" />
              ))}
            </div>
            <SectionTitle>Bientôt</SectionTitle>
            <p className="text-xs leading-relaxed text-sand-300">
              Étape 3 : le QG 3D. Puis les séances (chaque série frappe le boss et fait pulser le muscle), la nutrition et le sommeil : ton héros suivra tes vraies
              données jour après jour.
            </p>
            <SectionTitle>Sauvegarde</SectionTitle>
            <p className="text-xs text-sand-300">
              {storageKind === "artefact"
                ? "Enregistrée dans ton espace privé de cette page : personne d'autre ne peut la lire."
                : "Enregistrée dans ce navigateur uniquement."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip onClick={onEditLook}>Modifier l&apos;apparence</Chip>
              <Chip onClick={onRescan}>Refaire le scan</Chip>
              <Chip active={save.settings.hideWeight} onClick={onToggleWeight}>
                Masquer le poids
              </Chip>
              <Chip onClick={() => setConfirmReset(true)}>Tout effacer</Chip>
            </div>
            {confirmReset && (
              <div className="mt-2 bg-night-900/80 p-3">
                <p className="text-xs text-sand-100">Effacer ton héros et toutes ses données ? C&apos;est définitif.</p>
                <div className="mt-2 flex gap-2">
                  <GameButton variant="ghost" onClick={() => setConfirmReset(false)}>
                    Annuler
                  </GameButton>
                  <GameButton onClick={onReset}>Effacer</GameButton>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </aside>
    </>
  );
}
