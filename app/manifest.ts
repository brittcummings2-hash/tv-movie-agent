import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TV Tracker",
    short_name: "TV Tracker",
    description: "Track what you've watched and what Spark recommends next",
    start_url: "/",
    display: "standalone",
    background_color: "#fefcfa",
    theme_color: "#fefcfa",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
