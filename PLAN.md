# MUE — plan de construction

La mise à jour « game feel » passe avant les sections 3 et 6 du brief initial. On suit donc
son **ordre d'exécution (étapes 1 → 6)**. Les phases du brief initial (auth, nutrition, clans…)
sont réparties dans ces étapes, puis viennent ensuite. Chaque étape se termine par une démo
jouable, une console sans erreur et des données de démo (Sam, 8 semaines d'historique).

| # | Étape | Contenu | Phases du brief initial couvertes |
|---|-------|---------|-----------------------------------|
| **1** ✅ | **Pipeline personnage** | GLB riggé (squelette aux noms Mixamo) généré depuis MakeHuman CC0, 27 morph targets (11 groupes musculaires, sécheresse, gras, abdos dessinés, fatigue, sourire, clignement, respiration, 8 formes de visage), 10 animations, coiffures / barbes / tenues, interface `AvatarRenderer`, matériaux PBR stylisés (rim light de classe, faux subsurface), post-processing, réglages graphiques, fallback 2D, labo de test, moteur d'évolution pur + tests, démo 8 semaines, socle PWA | 1 (partiel : setup, tokens, PWA), 2 (avatar), 5 (cœur du moteur) |
| 2 | Boot + écran titre + création de perso | Logo animé, chargement avec astuces, écran titre (caméra orbitale, musique, « APPUIE POUR COMMENCER »), créateur façon RPG (studio, plateau tournant, zoom auto sur la zone modifiée, RANDOMISER, nom du héros, classe de départ avec fiche de stats animée), onboarding (objectif, mensurations, projection à 6 mois, niveau 1 déjà rempli à 20 %). **Supabase** : auth email + magic link, schéma complet + RLS sur toutes les tables, seed SQL de Sam | 1, 2 |
| 3 | Hub QG | Pièce 3D explorable (drag pour tourner, tap sur les zones), transitions caméra cinématiques GSAP + profondeur de champ vers Rack / Cuisine / Chambre / Miroir / Portail / Coffre-fort, menu radial au pouce, PNJ coach (dialogues machine à écrire, portrait, blips), journal de quêtes | 3, 7 (journal) |
| 4 | HUD + feedback | HUD diégétique (portrait, niveau, XP, énergie, monnaie, série avec flamme), chiffres flottants, screen shake, hit-stop 60 ms, particules, CRITIQUE ! (ralenti, aberration chromatique, flash, flex), cinématique de level-up, ouverture de coffre 3D par rareté, transitions en wipes diagonaux | 7 (coffres), 9 (partiel) |
| 5 | Séance-combat contre le boss | Bibliothèque d'exos + exos perso, saisie série par série (poids / reps / RPE), minuteur de repos, chaque série = un coup au boss de la semaine (golem de fonte…, phases à 50 % / 20 %), muscle qui pulse en direct, records → critique, écran de victoire. **Moteur serveur** : Edge Function `recompute-avatar` (réutilise `src/engine`) après chaque séance + cron nocturne (atrophie, stats RPG, classes, XP), contrôle de plausibilité, file hors-ligne des séances | 4, 5 |
| 6 | Son, options, optimisation mobile | Howler (musique par zone, ducking pendant les dialogues, sons UI), vibrations synchronisées, menu OPTIONS (volumes, vibrations, graphismes, mouvements réduits), manette (Gamepad API), KTX2, LOD, budget 60 fps sur milieu de gamme | 9 |
| 7 | Nutrition, sommeil, pesée | Objectifs Mifflin-St Jeor, saisie rapide (favoris, récents en 1 tap), score Vitalité, garde-fous (plancher calorique, déficit ≤ 20-25 %, poids masquable partout) | 6 |
| 8 | Méta-jeu | Quêtes quotidiennes / hebdo / principales, pacte du lundi signé par appui long, boss hebdo, inventaire / casier (raretés), arbre de compétences en constellation, saisons mensuelles, gel de série, « ce que ton avatar risque de perdre », timeline avant / après + photos privées | 7 |
| 9 | Clans | Code d'invitation, salle du clan 3D (avatars des membres), classement discipline / XP (jamais le physique), fil d'activité + emotes, défis hebdo, réglages de confidentialité | 8 |
| 10 | Polish final + IA repas | Tests e2e, accessibilité, audit perfs ; Edge Function « photo de l'assiette → estimation » préparée mais désactivée | 9, 10 |

## Ce que contient l'étape 1

- `scripts/character/` : pipeline reproductible `npm run character` (télécharge ~8 Mo de
  sources MakeHuman CC0 sur un commit épinglé, génère `public/models/hero-{m,f}.glb` en ~3 s,
  ~2,1 Mo chacun avec compression meshopt).
- `src/avatar/contract.ts` : le contrat de noms (morphs, clips, os, meshes) que tout futur
  modèle Blender devra respecter.
- `src/avatar/AvatarRenderer.ts` : l'interface d'avatar. `HeroAvatar.tsx` (3D) et
  `Avatar2DFallback.tsx` (SVG) l'implémentent.
- `src/engine/evolution.ts` : séries effectives, volume hebdo, niveaux (+2 / semaine max,
  atrophie douce), Epley, plausibilité, définition sur tendance 7 j, énergie.
- `src/data/demo/history.ts` : Sam, 8 semaines (PPL + boxe, une séance manquée en S6, sèche
  de 80 à 77,8 kg).
- `/labo` : la scène de test.

## Limites connues du placeholder (à lever avec ASSETS.md)

- Cheveux et barbes en coques sculptées (pas de cartes alpha) ; l'afro et le chignon restent simples.
- Animations écrites à la main avec un solveur IK : crédibles, mais moins riches que de la
  capture Mixamo / Quaternius.
- Pas encore de visage expressif au-delà de fatigue / sourire / clignement.
