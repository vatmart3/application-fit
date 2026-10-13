/**
 * Interface unique entre le jeu et la représentation de l'avatar.
 * Implémentations : HeroAvatar (GLB riggé, R3F) et Avatar2DFallback (SVG,
 * si WebGL est indisponible). Le reste de l'app ne dépend QUE de ceci.
 */
import type { ClipName, MuscleGroup } from "./contract";
import type { Appearance, AvatarState } from "./params";

export interface PlayOptions {
  /** Durée du fondu enchaîné (s). */
  fade?: number;
  /** Vitesse de lecture (1 = normale). Le ralenti des coups critiques passe par là. */
  speed?: number;
}

export interface AvatarRenderer {
  /** Met à jour l'état "vivant" (muscles, définition, énergie, classe). Interpolé en douceur. */
  setState(state: AvatarState): void;
  setAppearance(appearance: Appearance): void;
  /** Joue un clip (fondu enchaîné). Les one-shots reviennent à l'idle adapté à l'énergie. */
  play(clip: ClipName, options?: PlayOptions): void;
  /** Fait "pulser" un groupe musculaire (série validée) : gonflement + lueur. */
  pulse(group: MuscleGroup, intensity?: number): void;
  /** Surligne durablement des groupes (écran de victoire). Liste vide = rien. */
  highlight(groups: MuscleGroup[]): void;
  /** Durée d'interpolation des morphs (s) — longue pendant une "transformation". */
  setMorphSmoothing(seconds: number): void;
}

/** Implémentation vide (SSR, tests). */
export const nullRenderer: AvatarRenderer = {
  setState: () => {},
  setAppearance: () => {},
  play: () => {},
  pulse: () => {},
  highlight: () => {},
  setMorphSmoothing: () => {},
};
