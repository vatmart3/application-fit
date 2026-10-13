"use client";
/** Écran de boot : logo animé, barre de chargement, astuces aléatoires. */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const TIPS = [
  "Astuce : un jour de repos planifié rapporte de l'XP.",
  "Astuce : ton avatar grossit là où tu t'entraînes vraiment.",
  "Astuce : sous 1,6 g de protéines par kilo, tes gains ralentissent.",
  "Astuce : une nuit de moins de 6 h coûte de l'énergie à ton héros.",
  "Astuce : la définition suit ta tendance sur 7 jours, pas la pesée du jour.",
  "Astuce : un record battu déclenche un COUP CRITIQUE.",
  "Astuce : tes données restent dans ton espace privé, nulle part ailleurs.",
];

export function BootScreen({ progress, onDone }: { progress: number; onDone: () => void }) {
  // Première astuce fixe (rendu serveur identique), puis rotation côté client.
  const [tip, setTip] = useState(0);
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1800);
    const i = setInterval(() => setTip((x) => (x + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length), 2600);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);
  useEffect(() => {
    if (minElapsed && progress >= 1) onDone();
  }, [minElapsed, progress, onDone]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-night-950 px-8">
      <div className="scanlines pointer-events-none absolute inset-0" />
      <motion.h1
        className="title-slab text-[28vw] leading-none text-sand-100 md:text-[11rem]"
        initial={{ opacity: 0, scale: 1.4, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        M<span className="text-signal">U</span>E
      </motion.h1>
      <motion.div className="mt-2 h-1 w-40 bg-class" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.4, duration: 0.5 }} />
      <div className="mt-14 w-full max-w-sm">
        <div className="flex justify-between font-display text-[10px] uppercase tracking-[0.3em] text-sand-300">
          <span>Chargement</span>
          <span className="tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
        <div className="mt-2 h-2 bg-night-800" style={{ clipPath: "polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)" }}>
          <div className="h-full bg-signal transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
        <motion.p key={tip} className="mt-4 min-h-10 text-center text-sm text-sand-300" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {TIPS[tip]}
        </motion.p>
      </div>
    </div>
  );
}
