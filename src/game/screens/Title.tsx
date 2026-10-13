"use client";
/** Écran titre : le héros tourne lentement, "APPUIE POUR COMMENCER" pulse. */
import { motion } from "framer-motion";
import { useEffect } from "react";

export function TitleScreen({ heroName, onStart }: { heroName: string | null; onStart: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);
  return (
    <button type="button" className="absolute inset-0 z-20 flex flex-col items-center justify-between px-6 py-10 text-center" onClick={onStart} aria-label="Commencer">
      <div className="pointer-events-none">
        <motion.p
          className="font-display text-[10px] uppercase tracking-[0.45em] text-class"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {heroName ? `Bon retour, ${heroName}` : "Ton avatar, c'est toi dans 6 mois"}
        </motion.p>
        <motion.h1
          className="title-slab mt-2 text-[24vw] leading-[0.85] text-sand-100 md:text-[9rem]"
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "0.02em" }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        >
          M<span className="text-signal">U</span>E
        </motion.h1>
      </div>
      <motion.span
        className="pointer-events-none font-display text-sm uppercase tracking-[0.3em] text-sand-100 md:text-base"
        animate={{ opacity: [1, 0.25, 1], scale: [1, 1.04, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ textShadow: "0 0 18px var(--class)" }}
      >
        Appuie pour commencer
      </motion.span>
    </button>
  );
}
