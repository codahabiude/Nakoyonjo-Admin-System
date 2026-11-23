// FILE: SettingsView.tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBrandingStore, shortBrand, brandInitial } from "@/stores/branding-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, Info } from "lucide-react";
import { toast } from "sonner";

const TERM_FIELDS = [
  { key: "term1_start", label: "Term 1 Start" },
  { key: "term1_end", label: "Term 1 End" },
  { key: "term2_start", label: "Term 2 Start" },
  { key: "term2_end", label: "Term 2 End" },
  { key: "term3_start", label: "Term 3 Start" },
  { key: "term3_end", label: "Term 3 End" },
];

const SCHOOL_FIELDS = [
  { key: "school_name", label: "School Name" },
  { key: "school_motto", label: "School Motto" },
  { key: "school_phone", label: "School Phone" },
  { key: "school_address", label: "School Address" },
  { key: "head_teacher_name", label: "Head Teacher Name" },
];

export function SettingsView() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const applySettings = useBrandingStore((s) => s.applySettings);
  const savedSchoolName = useBrandingStore((s) => s.schoolName);
  // Preview reflects what the admin is TYPING (falls back to last saved).
  const effectiveName = (settings.school_name || "").trim() || savedSchoolName;
  const previewName = shortBrand(effectiveName);
  const previewInitial = brandInitial(effectiveName);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/api/settings");
        const data = await res.json();
        setSettings(data.settings || {});
      } catch {
        toast.error("Failed to load settings");
      }
      setLoading(false);
    }
    load();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (fields: { key: string; label: string }[]) => {
    setSaving(true);
    try {
      const data = fields.map((f) => ({
        key: f.key,
        value: settings[f.key] || "",
      }));
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      // Push the saved values into the live UI immediately — the sidebar,
      // login screen, dashboard subtitle and browser tab update instantly.
      applySettings(settings);
      toast.success("Settings saved — changes are live across the system");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="view-enter space-y-4">
        <Skeleton className="h-8 w-48 bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
        <Skeleton className="h-48 w-full bg-muted" />
      </div>
    );
  }

  return (
    <div className="view-enter space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Configure term dates and school information
          </p>
        </div>
      </div>

      {/* Where settings take effect */}
      <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Changes take effect <span className="font-medium text-foreground">everywhere, instantly</span> — no restart needed: <span className="font-medium text-foreground">School Name</span> renames the sidebar brand, logo letter, login page, browser tab, dashboard and every report card (PDF, Excel, print and parent portal); <span className="font-medium text-foreground">Motto, Address &amp; Phone</span> appear on the login screen and under every report header; <span className="font-medium text-foreground">Head Teacher</span> signs report cards; <span className="font-medium text-foreground">Term Dates</span> validate exam dates and print on report cards. SMS messages carry the school name too.
        </p>
      </div>

      {/* School Info */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            School Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {SCHOOL_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Input
                value={settings[field.key] || ""}
                onChange={(e) => updateSetting(field.key, e.target.value)}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            School Name drives the whole system — sidebar brand, logo letter ({previewInitial}), login page, browser tab and every report header. Motto, Address and Phone appear under the report card header (and the login screen). Head Teacher’s name is printed on the signature line.
          </p>
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary-foreground leading-none">{previewInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate leading-tight" title={effectiveName}>
                {previewName || "School brand preview"}
              </p>
              <p className="text-[11px] text-muted-foreground">Live sidebar preview</p>
            </div>
          </div>
          <Button
            onClick={() => handleSave(SCHOOL_FIELDS)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save School Info
          </Button>
        </CardContent>
      </Card>

      {/* Term Dates */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Term Dates (2026)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TERM_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label>{field.label}</Label>
                <Input
                  type="date"
                  value={settings[field.key] || ""}
                  onChange={(e) => updateSetting(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Exam dates are validated against these ranges — an exam dated outside its term is rejected. Report cards also show the term period next to the exam name.
          </p>
          <Button
            onClick={() => handleSave(TERM_FIELDS)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Term Dates
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
