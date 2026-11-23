import { create } from "zustand";

// Branding store — the client-side face of School Settings.
//
// School Settings are not just for report cards: the school name drives the
// sidebar brand, the login screen, the browser tab title and the PWA
// manifest. This store loads the PUBLIC branding endpoint once per session
// and lets SettingsView push edits into the live UI instantly (no refresh).

const DEFAULT_SCHOOL_NAME = "Nakoyonjo DEB Primary School";

interface BrandingState {
  /** Full school name as configured in Settings ("" until loaded). */
  schoolName: string;
  motto: string;
  phone: string;
  address: string;
  headTeacher: string;
  /** True once the public endpoint has answered at least once. */
  loaded: boolean;
  /** Fetch branding from /api/settings/public (deduped in-flight). */
  load: () => Promise<void>;
  /** Instantly apply raw settings-map edits made by the admin. */
  applySettings: (settings: Record<string, string>) => void;
}

/** "Nakoyonjo DEB Primary School" → "Nakoyonjo DEB"; keeps other names whole. */
function shortBrand(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  const stripped = cleaned
    .replace(/\s+Primary School$/i, "")
    .replace(/\s+Junior School$/i, "")
    .replace(/\s+School$/i, "");
  return stripped || cleaned;
}

/** First letter of the school name, e.g. "N" — falls back to "S". */
function brandInitial(name: string): string {
  const first = shortBrand(name).trim().charAt(0);
  return first ? first.toUpperCase() : "S";
}

function syncDocumentTitle(name: string) {
  if (typeof document === "undefined") return;
  document.title = `${shortBrand(name) || "School"} — School Administration System`;
}

let inflight: Promise<void> | null = null;

export const useBrandingStore = create<BrandingState>((set, get) => ({
  schoolName: DEFAULT_SCHOOL_NAME,
  motto: "",
  phone: "",
  address: "",
  headTeacher: "",
  loaded: false,

  load: () => {
    if (get().loaded) return Promise.resolve();
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetch("/api/settings/public", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          const name = (d.schoolName || "").trim() || DEFAULT_SCHOOL_NAME;
          set({
            schoolName: name,
            motto: (d.motto || "").trim(),
            phone: (d.phone || "").trim(),
            address: (d.address || "").trim(),
            headTeacher: (d.headTeacher || "").trim(),
            loaded: true,
          });
          syncDocumentTitle(name);
        }
      } catch {
        // Offline / SW fallback: keep defaults, retry on next mount.
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  applySettings: (settings) => {
    const name = (settings.school_name || "").trim() || get().schoolName || DEFAULT_SCHOOL_NAME;
    set({
      schoolName: name,
      motto: (settings.school_motto || "").trim(),
      phone: (settings.school_phone || "").trim(),
      address: (settings.school_address || "").trim(),
      headTeacher: (settings.head_teacher_name || "").trim(),
      loaded: true,
    });
    syncDocumentTitle(name);
  },
}));

// ---------- derived helpers (pure, exported for reuse) ----------

export function useSchoolName(): string {
  return useBrandingStore((s) => s.schoolName);
}

export function useShortSchoolName(): string {
  return useBrandingStore((s) => shortBrand(s.schoolName));
}

export function useSchoolInitial(): string {
  return useBrandingStore((s) => brandInitial(s.schoolName));
}

export { shortBrand, brandInitial };
