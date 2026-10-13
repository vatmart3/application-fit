# MUE

> Ton avatar, c'est toi dans 6 mois.

Une PWA qui transforme la musculation et l'hygiène de vie en jeu vidéo : l'avatar 3D est le
reflet vivant de ta vraie vie. Il prend du muscle là où tu t'entraînes vraiment, devient sec
quand tu manges et dors bien, et se fatigue (sans jamais devenir humiliant) quand tu lâches.

- Plan par étapes et état d'avancement : [`PLAN.md`](PLAN.md)
- Pipeline du personnage 3D et passage à Blender / MPFB2 : [`ASSETS.md`](ASSETS.md)

## Démarrer

```bash
npm install
npm run character   # télécharge les sources CC0 et régénère les modèles (déjà commités)
npm run dev         # http://localhost:3000 puis /labo
```

| Commande | Rôle |
|----------|------|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint, TypeScript strict, Vitest |
| `npm run character:fetch` | Sources MakeHuman CC0 → `.cache/makehuman/` |
| `npm run character:build` | Génère `public/models/hero-{m,f}.glb` (`-- --m --raw` pour déboguer) |

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind 4 + variables CSS · React Three Fiber,
drei, postprocessing · Zustand · (à venir : React Query, Supabase, GSAP, Framer Motion, Howler).

## Arborescence

```
scripts/character/   pipeline de génération du héros (MakeHuman CC0 → GLB)
src/avatar/          contrat, interface AvatarRenderer, HeroAvatar (3D), fallback 2D, matériaux
src/engine/          moteur d'évolution (pur, réutilisé côté serveur)
src/data/            exercices, données de démo (Sam, 8 semaines)
src/components/      UI "jeu" et plateau 3D
src/app/labo/        scène de test de l'étape 1
```

## Crédits

Maillage, targets, squelette et yeux : [MakeHuman](http://www.makehumancommunity.org) (CC0).
