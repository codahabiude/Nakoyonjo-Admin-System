"use client";

import { useEffect } from "react";
import { useBrandingStore } from "@/stores/branding-store";

// Loads school branding from Settings as soon as the app boots (runs on the
// login screen too, before any auth). Renders nothing — it only feeds the
// branding store so the sidebar, login page and tab title reflect Settings.
export function BrandingBoot() {
  const load = useBrandingStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  return null;
}
