"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  CheckCircle,
  Pencil,
  Trash2,
  Star,
  GripVertical,
  XCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

interface GradeRule {
  minMarks: number;
  maxMarks: number;
  grade: string;
  remark: string;
  sortOrder: number;
}

interface GradingScheme {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  grades: GradeRule[];
  createdAt: string;
}

const CBC_COLORS: Record<string, string> = {
  EE: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
  ME: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
  AE: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300",
  BE: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
};

function getCBCColor(level: string): string {
  if (CBC_COLORS[level]) return CBC_COLORS[level];
  const first = level.charAt(0).toUpperCase();
  if (first === "E") return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300";
  if (first === "M") return "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300";
  if (first === "A") return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300";
}

function getCBCPrintColor(level: string): string {
  if (level === "EE") return "#059669";
  if (level === "ME") return "#2563eb";
  if (level === "AE") return "#d97706";
  return "#dc2626";
}

export function getLevelColor(level: string): string {
  return getCBCColor(level);
}

export function getLevelPrintColor(level: string): string {
  return getCBCPrintColor(level);
}

/** Client-side validation of grading ranges */
function validateRules(rules: GradeRule[]): string | null {
  const valid = rules.filter((r) => r.grade.trim() !== "");
  if (valid.length === 0) return "Add at least one performance level";

  for (const r of valid) {
    if (r.minMarks > r.maxMarks) {
      return `"${r.grade}": min (${r.minMarks}) is greater than max (${r.maxMarks})`;
    }
    if (r.minMarks < 0 || r.maxMarks > 100) {
      return `"${r.grade}": marks must be between 0 and 100`;
    }
  }

  const sorted = [...valid].sort((a, b) => b.minMarks - a.minMarks);
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const nxt = sorted[i + 1];
    if (cur.minMarks <= nxt.maxMarks) {
      return `"${cur.grade}" (${cur.minMarks}–${cur.maxMarks}) overlaps with "${nxt.grade}" (${nxt.minMarks}–${nxt.maxMarks})`;
    }
    if (cur.minMarks > nxt.maxMarks + 1) {
      return `Gap between "${cur.grade}" and "${nxt.grade}"—range ${nxt.maxMarks + 1}–${cur.minMarks - 1} is uncovered`;
    }
  }

  if (sorted[0].maxMarks < 100) {
    return `Highest range ends at ${sorted[0].maxMarks}, expected 100`;
  }
  if (sorted[sorted.length - 1].minMarks > 0) {
    return `Lowest range starts at ${sorted[sorted.length - 1].minMarks}, expected 0`;
  }

  return null;
}

const EMPTY_RULE = (): GradeRule => ({
  minMarks: 0,
  maxMarks: 0,
  grade: "",
  remark: "",
  sortOrder: 0,
});

const DEFAULT_CBC_RULES: GradeRule[] = [
  { minMarks: 80, maxMarks: 100, grade: "EE", remark: "Exceeding Expectations", sortOrder: 3 },
  { minMarks: 50, maxMarks: 79,  grade: "ME", remark: "Meeting Expectations", sortOrder: 2 },
  { minMarks: 30, maxMarks: 49,  grade: "AE", remark: "Approaching Expectations", sortOrder: 1 },
  { minMarks: 0,  maxMarks: 29,  grade: "BE", remark: "Below Expectations", sortOrder: 0 },
];

export function GradingSystemView() {
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schemeName, setSchemeName] = useState("");
  const [schemeDesc, setSchemeDesc] = useState("");
  const [rules, setRules] = useState<GradeRule[]>([EMPTY_RULE()]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSchemes = useCallback(async () => {
    try {
      const res = await apiFetch("/api/grading");
      const data = await res.json();
      if (data.schemes) setSchemes(data.schemes);
    } catch {
      toast.error("Failed to load grading schemes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchemes();
  }, [fetchSchemes]);

  const openCreate = () => {
    setEditingId(null);
    setSchemeName("");
    setSchemeDesc("");
    setRules(DEFAULT_CBC_RULES.map((r) => ({ ...r })));
    setDialogOpen(true);
  };

  const openEdit = (scheme: GradingScheme) => {
    setEditingId(scheme.id);
    setSchemeName(scheme.name);
    setSchemeDesc(scheme.description || "");
    setRules(scheme.grades.map((g) => ({ ...g })));
    setDialogOpen(true);
  };

  const addRule = () => setRules([...rules, EMPTY_RULE()]);

  const removeRule = (index: number) => {
    if (rules.length <= 1) {
      toast.error("Need at least one performance level");
      return;
    }
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: keyof GradeRule, value: string | number) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  };

  const moveRule = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rules.length) return;
    const updated = [...rules];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    updated.forEach((r, i) => {
      r.sortOrder = updated.length - 1 - i;
    });
    setRules(updated);
  };

  // Live validation error for the rules in the dialog
  const validationError = useMemo(() => {
    const valid = rules.filter((r) => r.grade.trim() !== "");
    if (valid.length < 2) return null;
    return validateRules(valid);
  }, [rules]);

  const handleSave = async () => {
    if (!schemeName.trim()) {
      toast.error("Please enter a scheme name");
      return;
    }

    const validRules = rules.filter((r) => r.grade.trim() !== "");
    if (validRules.length === 0) {
      toast.error("Add at least one performance level");
      return;
    }

    // Client-side validation
    const clientError = validateRules(validRules);
    if (clientError) {
      toast.error(clientError);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: schemeName.trim(),
        description: schemeDesc.trim() || null,
        grades: validRules.map((r) => ({
          minMarks: r.minMarks,
          maxMarks: r.maxMarks,
          grade: r.grade.trim(),
          remark: r.remark.trim() || null,
          sortOrder: r.sortOrder,
        })),
        makeActive: true,
      };

      const url = editingId ? `/api/grading/${editingId}` : "/api/grading";
      const method = editingId ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(
          editingId
            ? "Grading scheme updated!"
            : "CBC grading scheme created and activated!"
        );
        setDialogOpen(false);
        fetchSchemes();
      }
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const handleActivate = async (scheme: GradingScheme) => {
    if (scheme.isActive) return;
    try {
      const res = await apiFetch(`/api/grading/${scheme.id}`, {
        method: "PATCH",
        body: JSON.stringify({ makeActive: true }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`"${scheme.name}" is now the active grading system`);
        fetchSchemes();
      }
    } catch {
      toast.error("Failed to activate");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await apiFetch(`/api/grading/${deleteId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Grading scheme deleted");
        fetchSchemes();
      }
    } catch {
      toast.error("Failed to delete");
    }
    setDeleteDialogOpen(false);
    setDeleteId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="view-enter space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">CBC Grading System</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Configure performance levels (EE, ME, AE, BE) and their score ranges. Only one scheme can be active at a time.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New Grading Scheme
        </Button>
      </div>

      {/* CBC Reference Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Kenyan CBC Performance Levels</p>
              <p className="text-muted-foreground mt-1">
                The Competency-Based Curriculum uses four performance levels:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[
                  { code: "EE", full: "Exceeding Expectations", color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300" },
                  { code: "ME", full: "Meeting Expectations", color: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300" },
                  { code: "AE", full: "Approaching Expectations", color: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" },
                  { code: "BE", full: "Below Expectations", color: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300" },
                ].map((l) => (
                  <div key={l.code} className="flex items-center gap-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${l.color}`}>{l.code}</span>
                    <span className="text-xs text-muted-foreground">{l.full}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schemes List */}
      {schemes.length === 0 ? (
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-2">No grading schemes yet.</p>
            <p className="text-sm text-muted-foreground">
              Create one to define how marks are converted to CBC performance levels.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {schemes.map((scheme) => (
            <Card
              key={scheme.id}
              className={`hover:shadow-md transition-shadow duration-200 ${scheme.isActive ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{scheme.name}</CardTitle>
                    {scheme.isActive ? (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                        <CheckCircle className="w-3 h-3 mr-1" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!scheme.isActive && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(scheme)}>
                        <Star className="w-4 h-4 mr-1" /> Set Active
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openEdit(scheme)}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                      onClick={() => { setDeleteId(scheme.id); setDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {scheme.description && (
                  <p className="text-sm text-muted-foreground mt-1">{scheme.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Performance Level</th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Min Score</th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Max Score</th>
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheme.grades.map((g, i) => (
                        <tr key={i} className="hover:bg-muted/50">
                          <td className="py-2 px-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${getCBCColor(g.grade)}`}>
                              {g.grade}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">{g.minMarks}</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">{g.maxMarks}</td>
                          <td className="py-2 px-3 text-muted-foreground">{g.remark || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Grading Scheme" : "Create CBC Grading Scheme"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the performance levels and score ranges."
                : "Define CBC performance levels. Ranges must cover 0–100 with no overlaps or gaps."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheme-name">Scheme Name *</Label>
                <Input id="scheme-name" value={schemeName} onChange={(e) => setSchemeName(e.target.value)} placeholder="e.g. CBC 2026 Grading" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="scheme-desc">Description</Label>
                <Input id="scheme-desc" value={schemeDesc} onChange={(e) => setSchemeDesc(e.target.value)} placeholder="Optional description" className="mt-1" />
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold">Performance Levels</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Define score ranges for each CBC level. Ranges must cover 0–100 without overlapping. Drag to reorder (highest first).
              </p>

              {/* Live validation warning */}
              {validationError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {validationError}
                </div>
              )}

              <div className="space-y-2">
                {rules.map((rule, index) => (
                  <div key={index} className="flex items-end gap-2 bg-muted/50 p-3 rounded-lg">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveRule(index, "up")} disabled={index === 0} aria-label="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveRule(index, "down")} disabled={index === rules.length - 1} aria-label="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1 min-w-[70px]">
                      <Label className="text-xs">Level *</Label>
                      <Input value={rule.grade} onChange={(e) => updateRule(index, "grade", e.target.value)} placeholder="EE" className="mt-1 h-9 font-mono uppercase" maxLength={5} />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Min Score *</Label>
                      <Input type="number" min={0} max={100} value={rule.minMarks} onChange={(e) => updateRule(index, "minMarks", parseInt(e.target.value) || 0)} className="mt-1 h-9" />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Max Score *</Label>
                      <Input type="number" min={0} max={100} value={rule.maxMarks} onChange={(e) => updateRule(index, "maxMarks", parseInt(e.target.value) || 0)} className="mt-1 h-9" />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">Description</Label>
                      <Input value={rule.remark} onChange={(e) => updateRule(index, "remark", e.target.value)} placeholder="e.g. Exceeding Expectations" className="mt-1 h-9" />
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 h-9 w-9" onClick={() => removeRule(index)} aria-label="Remove level">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" className="mt-2" onClick={addRule}>
                <Plus className="w-4 h-4 mr-1" /> Add Performance Level
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !!validationError}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update Scheme" : "Create & Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Grading Scheme?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this grading scheme and all its performance levels. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
