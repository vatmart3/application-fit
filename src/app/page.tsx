import Link from "next/link";

/**
 * Accueil provisoire (étape 1). L'écran de boot, l'écran titre et la
 * création de personnage arrivent à l'étape 2.
 */
export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-night-950 px-6 text-center">
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute -left-1/4 top-1/3 h-[60vh] w-[150vw] -rotate-12 bg-gradient-to-r from-transparent via-night-700/60 to-transparent"
        aria-hidden
      />
      <p className="font-display text-xs uppercase tracking-[0.4em] text-signal">Ton avatar, c&apos;est toi dans 6 mois</p>
      <h1 className="title-slab mt-3 text-[22vw] leading-none text-sand-100 md:text-[10rem]">MUE</h1>
      <p className="mt-4 max-w-md text-sand-300">Le jeu dont la seule manette est ta vraie vie.</p>
      <Link href="/labo" className="btn-game mt-10 bg-signal px-8 py-4 text-lg uppercase text-night-950 hover:brightness-110">
        Entrer dans le labo
      </Link>
      <p className="mt-6 text-xs uppercase tracking-widest text-sand-500">Étape 1 / 6 · pipeline personnage</p>
    </main>
  );
}
