// FILE: ExamsView.tsx — Exam closure workflow with confirmation, validation, bulk actions
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Lock,
  Unlock,
  ShieldCheck,
  Loader2,
  Printer,
  AlertTriangle,
  XCircle,
  Clock,
  CheckCircle,
  Archive,
  SquareStack,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface SubjectProgress {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  enteredBy: string | null;
  markCount: number;
  studentCount: number;
}

interface Exam {
  id: string;
  name: string;
  term: string;
  year: string;
  maxMarks: number;
  status: string;
  classId: string;
  className: string;
  totalMarks: number;
  subjectProgress: SubjectProgress[];
  completedSubjects: number;
  totalSubjects: number;
  isComplete: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closedByName: string | null;
}

interface ClassOption {
  id: string;
  name: string;
}

type StatusAction = "APPROVE" | "CLOSE" | "REOPEN";

// Status badge helper
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    "ACTIVE": {
      label: "Active",
      className: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40",
      icon: <Circle className="w-3 h-3" />,
    },
    "APPROVED": {
      label: "Approved",
      className: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40",
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    "CLOSED": {
      label: "Closed",
      className: "bg-gray-100 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-gray-800/40",
      icon: <Lock className="w-3 h-3" />,
    },
  };
  const c = config[status] || config["ACTIVE"];
  return (
    <Badge variant="outline" className={`text-[11px] gap-1 ${c.className}`}>
      {c.icon} {c.label}
    </Badge>
  );
}

export function ExamsView() {
  const { user } = useAuthStore();
  const { setCurrentView, setSelectedExamId } = useAppStore();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", term: "Term 1", year: "2026", classId: "", maxMarks: 100 });

  // Confirmation dialog state
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    exam: Exam | null;
    action: StatusAction;
  }>({ open: false, exam: null, action: "APPROVE" });
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Bulk selection state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "close" | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  const fetchExams = useCallback(async () => {
    try {
      const res = await apiFetch("/api/exams");
      const data = await res.json();
      if (data.exams) setExams(data.exams);
    } catch { toast.error("Failed to fetch exams"); }
    setLoading(false);
  }, []);

  const fetchClasses = useCallback(async () => {
    try {
      const res = await apiFetch("/api/classes");
      const data = await res.json();
      if (data.classes) setClasses(data.classes.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchExams(); fetchClasses(); }, [fetchExams, fetchClasses]);

  const handleCreate = async () => {
    if (!form.name || !form.classId || !form.year) { toast.error("Fill in all required fields (name, class, year)"); return; }
    if (!form.maxMarks || form.maxMarks <= 0) { toast.error("Max marks must be a positive number"); return; }
    setCreating(true);
    try {
      const res = await apiFetch("/api/exams", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Exam created successfully");
        setDialogOpen(false);
        setForm({ name: "", term: "Term 1", year: "2026", classId: "", maxMarks: 100 });
        fetchExams();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to create exam");
      }
    } catch { toast.error("Failed to create exam"); }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/exams/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Exam deleted");
        setDeleteId(null);
        fetchExams();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete");
      }
    } catch { toast.error("Failed to delete"); }
  };

  // === Status change with confirmation ===
  const requestStatusChange = (exam: Exam, action: StatusAction) => {
    setStatusDialog({ open: true, exam, action });
  };

  const confirmStatusChange = async () => {
    const { exam, action } = statusDialog;
    if (!exam) return;

    const statusMap: Record<StatusAction, string> = {
      "APPROVE": "APPROVED",
      "CLOSE": "CLOSED",
      "REOPEN": "ACTIVE",
    };
    const newStatus = statusMap[action];

    setStatusSubmitting(true);
    setTogglingId(exam.id);
    try {
      const res = await apiFetch(`/api/exams/${exam.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const messages: Record<StatusAction, string> = {
          "APPROVE": "Exam approved — marks and remarks are now locked",
          "CLOSE": "Exam closed and archived",
          "REOPEN": "Exam reopened for editing",
        };
        toast.success(messages[action]);
        setStatusDialog({ open: false, exam: null, action: "APPROVE" });
        fetchExams();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update exam status");
      }
    } catch { toast.error("Failed to update exam status"); }
    setStatusSubmitting(false);
    setTogglingId(null);
  };

  // === Bulk actions ===
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const activeExams = exams.filter((e) => {
      if (bulkAction === "approve") return e.status === "ACTIVE" && e.isComplete;
      if (bulkAction === "close") return e.status === "ACTIVE" || e.status === "APPROVED";
      return true;
    });
    const allSelected = activeExams.every((e) => selectedIds.has(e.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeExams.map((e) => e.id)));
    }
  };

  const executeBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const statusMap = { approve: "APPROVED", close: "CLOSED" } as const;
    const newStatus = statusMap[bulkAction];

    setBulkSubmitting(true);
    let success = 0;
    let failed = 0;

    for (const id of selectedIds) {
      try {
        const res = await apiFetch(`/api/exams/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) success++;
        else failed++;
      } catch { failed++; }
    }

    setBulkSubmitting(false);
    setBulkAction(null);
    setSelectedIds(new Set());
    setBulkMode(false);
    fetchExams();

    const label = bulkAction === "approve" ? "approved" : "closed";
    if (failed === 0) {
      toast.success(`${success} exam${success > 1 ? "s" : ""} ${label} successfully`);
    } else {
      toast.warning(`${success} ${label}, ${failed} failed`);
    }
  };

  const openMarks = (examId: string) => {
    setSelectedExamId(examId);
    setCurrentView("marks");
  };

  const examToDelete = exams.find((e) => e.id === deleteId);

  // Counts for header stats
  const activeCount = exams.filter((e) => e.status === "ACTIVE").length;
  const approvedCount = exams.filter((e) => e.status === "APPROVED").length;
  const closedCount = exams.filter((e) => e.status === "CLOSED").length;
  const canBulkApprove = exams.filter((e) => e.status === "ACTIVE" && e.isComplete).length;
  const canBulkClose = exams.filter((e) => e.status === "ACTIVE" || e.status === "APPROVED").length;

  // Confirmation dialog content
  const getStatusDialogInfo = () => {
    const { exam, action } = statusDialog;
    if (!exam) return { title: "", description: "", confirmLabel: "", variant: "default" as const };

    const incompleteSubjects = exam.totalSubjects - exam.completedSubjects;

    switch (action) {
      case "APPROVE":
        return {
          title: "Approve Exam",
          description: `Approve "${exam.name}" for ${exam.className}?\n\nMarks and class teacher remarks will be locked. Teachers will no longer be able to edit marks.${incompleteSubjects > 0 ? `\n\n⚠ ${incompleteSubjects} of ${exam.totalSubjects} subjects have not been fully entered yet.` : ""}`,
          confirmLabel: "Approve Exam",
          variant: "default" as const,
          warning: incompleteSubjects > 0,
        };
      case "CLOSE":
        return {
          title: "Close Exam",
          description: `Close "${exam.name}" for ${exam.className}?\n\nThis archives the exam. It can be reopened later if needed.${exam.status === "ACTIVE" && incompleteSubjects > 0 ? `\n\n⚠ ${incompleteSubjects} of ${exam.totalSubjects} subjects have not been fully entered.` : ""}`,
          confirmLabel: "Close Exam",
          variant: "destructive" as const,
          warning: exam.status === "ACTIVE" && incompleteSubjects > 0,
        };
      case "REOPEN":
        return {
          title: "Reopen Exam",
          description: `Reopen "${exam.name}" for ${exam.className}?\n\nThe exam will go back to Active status. Teachers will be able to edit marks and remarks again.`,
          confirmLabel: "Reopen Exam",
          variant: "default" as const,
          warning: false,
        };
    }
  };

  if (loading) {
    return (
      <div className="view-enter space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardHeader>
              <CardContent><Skeleton className="h-3 w-full mb-2" /><Skeleton className="h-20 w-full mb-4" /><div className="flex gap-2"><Skeleton className="h-9 flex-1" /><Skeleton className="h-9 flex-1" /></div></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="view-enter space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Examinations</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "Manage exams, track marks entry, approve and close exams" : "Enter marks for your assigned subjects"}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Exam
            </Button>
          )}
        </div>
      </div>

      {/* Stats Bar (Admin only) */}
      {isAdmin && exams.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
            <Circle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{activeCount} Active</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{approvedCount} Approved</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-800/40">
            <Lock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{closedCount} Closed</span>
          </div>
          <Separator orientation="vertical" className="h-8 hidden sm:block" />
          {canBulkApprove > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40 hover:bg-blue-50 dark:hover:bg-blue-900/40 dark:bg-blue-950/50"
              onClick={() => { setBulkMode(true); setBulkAction("approve"); }}
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              Bulk Approve ({canBulkApprove})
            </Button>
          )}
          {canBulkClose > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-primary border-primary/30 hover:bg-primary/10"
              onClick={() => { setBulkMode(true); setBulkAction("close"); }}
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Bulk Close ({canBulkClose})
            </Button>
          )}
        </div>
      )}

      {exams.length === 0 ? (
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No exams created yet.</p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Create First Exam
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {exams.map((exam) => {
            const progressPct = exam.totalSubjects > 0
              ? Math.round((exam.completedSubjects / exam.totalSubjects) * 100)
              : 0;
            const isActive = exam.status === "ACTIVE";
            const isApproved = exam.status === "APPROVED";
            const isClosed = exam.status === "CLOSED";
            const isLocked = isApproved || isClosed;
            const isBulkEligible = bulkAction === "approve"
              ? (isActive && exam.isComplete)
              : (isActive || isApproved);
            const isSelected = selectedIds.has(exam.id);

            return (
              <Card key={exam.id} className={`hover:shadow-md transition-shadow duration-200 overflow-hidden ${
                isClosed ? "opacity-70" : isApproved ? "opacity-90" : ""
              } ${isSelected ? "ring-2 ring-primary" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      {/* Bulk checkbox */}
                      {bulkMode && isAdmin && (
                        <div className="pt-1">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isBulkEligible}
                            onCheckedChange={() => isBulkEligible && toggleSelect(exam.id)}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{exam.name}</CardTitle>
                          <StatusBadge status={exam.status} />
                          {isAdmin && exam.isComplete && isActive && (
                            <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-0 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready to Approve
                            </Badge>
                          )}
                          {!exam.isComplete && isActive && exam.completedSubjects > 0 && (
                            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40 text-[11px] gap-1">
                              <Clock className="w-3 h-3" /> In Progress
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {exam.className} &middot; {exam.term} — {exam.year} &middot; Max: {exam.maxMarks}
                        </p>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && !bulkMode && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isActive && exam.isComplete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40"
                            onClick={() => requestStatusChange(exam, "APPROVE")}
                            disabled={togglingId === exam.id}
                            title="Approve exam (lock marks)"
                          >
                            {togglingId === exam.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <ShieldCheck className="w-4 h-4" />
                            }
                          </Button>
                        )}
                        {isApproved && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 dark:bg-amber-950/30"
                            onClick={() => requestStatusChange(exam, "REOPEN")}
                            disabled={togglingId === exam.id}
                            title="Reopen exam (allow edits)"
                          >
                            <Unlock className="w-4 h-4" />
                          </Button>
                        )}
                        {(isActive || isApproved) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => requestStatusChange(exam, "CLOSE")}
                            disabled={togglingId === exam.id}
                            title="Close exam (archive)"
                          >
                            <Lock className="w-4 h-4" />
                          </Button>
                        )}
                        {isClosed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 dark:bg-amber-950/30"
                            onClick={() => requestStatusChange(exam, "REOPEN")}
                            disabled={togglingId === exam.id}
                            title="Reopen exam"
                          >
                            <Unlock className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Audit trail */}
                  {(exam.approvedByName || exam.closedByName) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {exam.approvedByName && (
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-blue-500" />
                          Approved by <strong>{exam.approvedByName}</strong>
                          {exam.approvedAt && <span> on {new Date(exam.approvedAt).toLocaleDateString()}</span>}
                        </span>
                      )}
                      {exam.closedByName && (
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-gray-400" />
                          Closed by <strong>{exam.closedByName}</strong>
                          {exam.closedAt && <span> on {new Date(exam.closedAt).toLocaleDateString()}</span>}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {exam.completedSubjects}/{exam.totalSubjects} subjects entered
                      </span>
                      <span className={`font-semibold ${progressPct === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {progressPct}%
                      </span>
                    </div>
                    <Progress
                      value={progressPct}
                      className={`h-2 ${progressPct === 100 ? "[&>div]:bg-emerald-500 dark:[&>div]:bg-emerald-500" : ""}`}
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Subject progress grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                    {exam.subjectProgress.map((sp) => {
                      const isDone = sp.markCount >= sp.studentCount && sp.studentCount > 0;
                      const isStarted = sp.markCount > 0;
                      return (
                        <div
                          key={sp.subjectId}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                            isDone
                              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40"
                              : isStarted
                                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40"
                                : "bg-muted/30 border-border"
                          }`}
                          title={sp.enteredBy ? `Entered by ${sp.enteredBy} (${sp.markCount}/${sp.studentCount} students)` : `Not entered yet (0/${sp.studentCount} students)`}
                        >
                          {isDone
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                            : isStarted
                              ? <Circle className="w-3.5 h-3.5 text-amber-500 fill-amber-500/30 flex-shrink-0" />
                              : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                          }
                          <div className="min-w-0">
                            <span className="font-mono font-semibold">{sp.subjectCode}</span>
                            <span className="text-muted-foreground hidden sm:inline"> {sp.subjectName}</span>
                            {isAdmin && sp.enteredBy && (
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {sp.enteredBy.split(" ").slice(-1)} &middot; {sp.markCount}/{sp.studentCount}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {!isLocked && (
                      <Button size="sm" className="flex-1" onClick={() => openMarks(exam.id)}>
                        {exam.completedSubjects === 0 ? "Enter Marks" : "Continue Entry"}
                      </Button>
                    )}
                    {isLocked && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openMarks(exam.id)}>
                        View Marks
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSelectedExamId(exam.id); setCurrentView("reports"); }}
                    >
                      <Printer className="w-4 h-4 mr-1.5" />
                      Reports
                    </Button>
                    {isAdmin && !bulkMode && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(exam.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bulk Action Bar */}
      {bulkMode && isAdmin && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-background border shadow-xl">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {exams.filter((e) => {
              if (bulkAction === "approve") return e.status === "ACTIVE" && e.isComplete;
              if (bulkAction === "close") return e.status === "ACTIVE" || e.status === "APPROVED";
              return true;
            }).every((e) => selectedIds.has(e.id)) ? "Deselect All" : "Select All"}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{selectedIds.size}</strong> selected
          </span>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || bulkSubmitting}
            onClick={executeBulkAction}
            variant={bulkAction === "close" ? "destructive" : "default"}
          >
            {bulkSubmitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {bulkAction === "approve" ? <ShieldCheck className="w-4 h-4 mr-1.5" /> : <Archive className="w-4 h-4 mr-1.5" />}
            {bulkAction === "approve" ? "Approve Selected" : "Close Selected"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setBulkMode(false); setBulkAction(null); setSelectedIds(new Set()); }}>
            <XCircle className="w-4 h-4 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* Status Change Confirmation Dialog */}
      <Dialog open={statusDialog.open} onOpenChange={(open) => { if (!open) setStatusDialog({ ...statusDialog, open: false }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statusDialog.action === "APPROVE" && <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              {statusDialog.action === "CLOSE" && <Archive className="w-5 h-5 text-destructive" />}
              {statusDialog.action === "REOPEN" && <Unlock className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              {getStatusDialogInfo().title}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line pt-2">
              {getStatusDialogInfo().description}
            </DialogDescription>
          </DialogHeader>

          {/* Exam summary in confirmation */}
          {statusDialog.exam && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Exam</span>
                <span className="font-medium">{statusDialog.exam.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Class</span>
                <span className="font-medium">{statusDialog.exam.className}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subjects</span>
                <span className="font-medium">
                  {statusDialog.exam.completedSubjects}/{statusDialog.exam.totalSubjects} entered
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {statusDialog.exam.totalSubjects > 0
                    ? Math.round((statusDialog.exam.completedSubjects / statusDialog.exam.totalSubjects) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          )}

          {getStatusDialogInfo().warning && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Not all subjects have been fully entered. You can still proceed, but some students may have missing marks.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setStatusDialog({ ...statusDialog, open: false })}
              disabled={statusSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant={statusDialog.action === "CLOSE" ? "destructive" : "default"}
              onClick={confirmStatusChange}
              disabled={statusSubmitting}
            >
              {statusSubmitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {getStatusDialogInfo().confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{examToDelete?.name}&quot;? This will permanently
              delete this exam and all its marks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Exam Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Exam</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Exam Name</Label>
              <Input placeholder="e.g. Term 1 Opener, End of Year" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={form.term} onValueChange={(v) => setForm({ ...form, term: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Term 1">Term 1</SelectItem>
                    <SelectItem value="Term 2">Term 2</SelectItem>
                    <SelectItem value="Term 3">Term 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max Marks</Label>
                <Input type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: parseInt(e.target.value) || 100 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create Exam"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}