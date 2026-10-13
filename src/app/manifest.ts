import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MUE",
    short_name: "MUE",
    description: "Ton avatar 3D est le reflet vivant de ta vraie vie.",
    start_url: "/",
    display: "fullscreen",
    orientation: "portrait",
    background_color: "#05080f",
    theme_color: "#0b1120",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
