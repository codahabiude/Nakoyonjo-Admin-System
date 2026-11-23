import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

// Dynamic PWA manifest — the installed app's name follows the school name
// configured in Settings, exactly like the sidebar and reports. Reads the
// SchoolSetting table per request (force-dynamic keeps this off the build
// step, so a missing/unavailable DB can never break `next build`).

export const dynamic = "force-dynamic";

const DEFAULT_NAME = "Nakoyonjo DEB Primary School";

function shortBrand(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  return (
    cleaned
      .replace(/\s+Primary School$/i, "")
      .replace(/\s+Junior School$/i, "")
      .replace(/\s+School$/i, "") || cleaned
  );
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let schoolName = DEFAULT_NAME;
  try {
    const rows = await db.schoolSetting.findMany({ where: { key: "school_name" } });
    const v = (rows[0]?.value || "").trim();
    if (v) schoolName = v;
  } catch {
    // DB unavailable → serve the default branding rather than a 500.
  }

  const short = shortBrand(schoolName);

  return {
    name: `${short} School Admin`,
    short_name: `${short} Admin`.slice(0, 12),
    description: `School Administration System for ${schoolName}. Manage students, teachers, exams, marks, attendance and reports.`,
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#166534",
    theme_color: "#166534",
    scope: "/",
    lang: "en",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    screenshots: [],
    prefer_related_applications: false,
  };
}
