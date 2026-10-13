/**
 * Point d'entrée de la version "artefact" autonome du Labo (hors Next.js) :
 * même composant que /labo, empaqueté par scripts/artifact/build-artifact.mjs.
 */
import { createRoot } from "react-dom/client";
import { LabClient } from "@/app/labo/LabClient";

createRoot(document.getElementById("root")!).render(<LabClient />);
