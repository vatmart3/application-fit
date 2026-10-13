# ASSETS — pipeline du personnage

## 1. Ce qui est généré aujourd'hui (aucun logiciel 3D requis)

```bash
npm run character        # = character:fetch + character:build
```

| Étape | Script | Résultat |
|-------|--------|----------|
| Téléchargement | `scripts/character/fetch-makehuman.ts` | `.cache/makehuman/` : maillage de base hm08, ~70 targets, squelette par défaut, poids, proxy des yeux. Licence **CC0** (`LICENSE.ASSETS.md` copié), commit épinglé `a8bc2d5`. |
| Génération | `scripts/character/build-hero.ts` | `public/models/hero-m.glb`, `hero-f.glb` |

Ce que fait la génération :

1. **Forme de base héroïque** : macros MakeHuman (jeune adulte, muscle et poids moyens, proportions
   idéales) + exagérations (V-taper, cou épais, tête un peu plus petite, jambes plus longues).
2. **Squelette** : les 163 os MakeHuman sont fusionnés en 55 os aux **noms Mixamo**
   (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`,
   `LeftHand`, `LeftHandIndex1..3`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`…, plus
   `LeftEye` / `RightEye` et `Prop`). Rotations de repos à l'identité, en A-pose.
3. **Morph targets** (voir `src/avatar/contract.ts`) :
   - `muscle_<groupe>` × 11 : delta « max muscle » MakeHuman masqué par région anatomique
     (poids de skinning + orientation des normales), plus les targets locales
     (pectoraux, grand dorsal, deltoïdes, biceps / triceps, cuisses, mollets, fessiers) ;
   - `lean`, `fat`, `cut` (interaction muscle × sécheresse = abdos dessinés), `breath` ;
   - `fatigue`, `smile`, `blink` (unités d'expression MakeHuman), `cheeks_hollow` ;
   - 8 formes de visage pour le créateur.
4. **Coques dérivées du corps** : cheveux (`Hair_short|quiff|afro|bun`), barbes
   (`Beard_short|full|goatee`), hauts (`Top_tank|tee|hoodie`), bas (`Bottom_shorts|joggers`),
   chaussures : sommets du corps décalés le long des normales, lissés (Taubin), avec ourlets.
   Ils héritent automatiquement du skinning ET des morphs.
5. **Attributs custom** : `_MUSCLEA/B/C` (masques des 11 groupes, pour faire luire un muscle),
   `_PAINT` (sourcils, barbe de 3 jours, lèvres, cuir chevelu rasé, peints dans le shader).
6. **10 animations** (`idle`, `idle_tired`, `flex`, `victory`, `squat`, `press`, `deadlift`,
   `punch`, `run`, `level_up`) écrites par intentions (cibles IK des poignets / chevilles,
   plan de flexion anatomique) puis échantillonnées à 30 i/s. Barre olympique sur l'os `Prop`.
7. Compression **meshopt** + accessors creux (sparse) : 8 Mo → 2,1 Mo.

Debug : `npm run character:build -- --m --raw` (homme seulement, sans compression).

## 2. Remplacer le placeholder par un modèle Blender (MPFB2)

Le reste de l'app ne dépend que du **contrat** (`src/avatar/contract.ts`). Un GLB qui
respecte ces noms remplace le placeholder sans toucher au code.

### À télécharger

| Quoi | Où | Licence |
|------|----|---------|
| Blender 4.2+ | blender.org | GPL (l'outil, pas les exports) |
| MPFB2 (extension Blender) | Blender → Préférences → Extensions → « MPFB » | GPL (code) / CC0 (assets) |
| Assets système MakeHuman (peaux, cheveux, vêtements) | Panneau MPFB → *Apply assets* → *Load pack* (`makehuman_system_assets_cc0.zip` sur static.makehumancommunity.org) | CC0 |
| Animations | Quaternius *Universal Animation Library* (quaternius.com, CC0) ; Mixamo (mixamo.com, licence Adobe : utilisable dans un jeu, pas redistribuable seule) | CC0 / Adobe |

### Pas à pas

> Les intitulés de menus ci-dessous peuvent varier selon la version de MPFB / Blender.

1. **Créer le corps** : MPFB → *New human* → *From scratch*. Genre, âge 25, muscle 0,5, poids 0,5,
   proportions 1. Ajouter le squelette **Game engine** ou **Mixamo** (*Rigging → Add standard rig*).
2. **Shape keys** : MPFB → *Model → Bake shape keys*. Pour chaque groupe du contrat, créer une
   shape key nommée exactement `muscle_pecs`, `muscle_back`… :
   - mettre le curseur *Muscle* au maximum, *Bake* dans une shape key temporaire ;
   - dupliquer et peindre un **vertex group** de la région (Weight Paint), puis
     *Shape Key → Blend from Shape* avec ce groupe comme masque ;
   - idem pour `lean` (poids min), `fat` (poids max), `fatigue` (paupières mi-closes + sourcils
     intérieurs relevés), `smile`, `blink`, `breath`, `cheeks_hollow` et les 8 `face_*`.
3. **Cheveux** : MPFB → *Apply assets → Hair* (cartes alpha). Nommer les objets `Hair_<style>`
   (`short`, `quiff`, `afro`, `bun`). Barbes : `Beard_short|full|goatee`.
4. **Vêtements** : `Top_tank|tee|hoodie`, `Bottom_shorts|joggers`, `Shoes_sneakers`.
   MPFB les ajuste au corps ; *Transfer shape keys* depuis le corps pour qu'ils suivent les muscles.
5. **Matériaux** : nommer `Skin`, `Eye`, `Lashes`, `Hair`, `Beard`, `Top_*`, `Bottom_*`, `Shoes`.
   L'app remplace ces matériaux par ses shaders stylisés (rim light de classe, lueur musculaire…).
6. **Animations** : importer les FBX Quaternius / Mixamo, les retargeter sur le squelette
   (add-on *Rokoko Retargeting*, gratuit, ou *Auto-Rig Pro*), une **Action** par clip nommée
   comme dans `CLIPS` (`idle`, `idle_tired`, `flex`…). Si le squelette n'est pas en A-pose,
   l'app s'en moque : seules les rotations comptent.
7. **Export** : *File → Export → glTF 2.0 (.glb)* : *Shape Keys* ✔, *Skinning* ✔,
   *Animation → Actions* ✔ (mode *Actions*), *Compression* : Draco désactivé (on utilise meshopt).
   Puis : `npx gltf-transform meshopt hero-m.glb public/models/hero-m.glb`.
8. Vérifier dans `/labo` : curseurs musculaires, clips et apparence doivent tous répondre.

### Bonus : ajouter des animations au GLB actuel sans Blender

Les clips Quaternius sont livrés en GLB. `three/examples/jsm/utils/SkeletonUtils.retargetClip`
peut les retargeter à l'exécution sur nos os (noms Mixamo) : prévu à l'étape 4 (HUD / feedback)
pour enrichir les animations de combat.
