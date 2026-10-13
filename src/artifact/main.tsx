/**
 * Point d'entrée de la version "artefact" autonome (hors Next.js) :
 * le jeu complet, empaqueté par scripts/artifact/build-artifact.mjs.
 */
import { createRoot } from "react-dom/client";
import { GameApp } from "@/game/GameApp";

createRoot(document.getElementById("root")!).render(<GameApp />);
