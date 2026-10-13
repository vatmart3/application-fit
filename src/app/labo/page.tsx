import type { Metadata } from "next";
import { LabClient } from "./LabClient";

export const metadata: Metadata = { title: "Labo du héros — MUE" };

export default function LaboPage() {
  return <LabClient />;
}
