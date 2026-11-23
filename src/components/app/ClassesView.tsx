"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  BookOpen,
  UserCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface ClassItem {
  id: string;
  name: string;
  academicYear: string;
  subjects: { subjectId: string; subject: { id: string; name: string; code: string } }[];
  teachers: { teacherId: string; isPrimary: boolean; teacher: { user: { name: string } } }[];
  _count: { students: number; subjects: number; teachers: number };
}

interface Subject {
  id: string;
  code: string;
  name: string;
  category: string;
  _count: { classes: number };
}

export function ClassesView() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Class form state
  const [classForm, setClassForm] = useState({
    name: "",
    academicYear: new Date().getFullYear().toString(),
    subjectIds: [] as string[],
  });

  // Subject form state
  const [subjectForm, setSubjectForm] = useState({
    code: "",
    name: "",
    category: "CORE",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        apiFetch("/api/classes"),
        apiFetch("/api/subjects"),
      ]);
      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();
      setClasses(classesData.classes || []);
      setSubjects(subjectsData.subjects || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleAddClass = () => {
    setEditingClass(null);
    setClassForm({ name: "", academicYear: new Date().getFullYear().toString(), subjectIds: [] });
    setShowClassForm(true);
  };

  const handleEditClass = (cls: ClassItem) => {
    setEditingClass(cls);
    setClassForm({
      name: cls.name,
      academicYear: cls.academicYear,
      subjectIds: cls.subjects.map((s) => s.subjectId),
    });
    setShowClassForm(true);
  };

  const handleDeleteClass = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/classes/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Class deleted");
        setDeleteOpen(false);
        setDeleteTarget(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete class");
      }
    } catch {
      toast.error("Failed to delete class");
    }
    setDeleting(false);
  };

  const handleSaveClass = async () => {
    if (!classForm.name) {
      toast.error("Class name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingClass) {
        // Update: first update subjects, then update class details
        const res = await apiFetch(`/api/classes/${editingClass.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: classForm.name,
            academicYear: classForm.academicYear,
            subjectIds: classForm.subjectIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update class");
        }
        toast.success("Class updated");
      } else {
        const res = await apiFetch("/api/classes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(classForm),
        });
        if (!res.ok) throw new Error("Failed to create class");
        toast.success("Class created");
      }
      setShowClassForm(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save class");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubject = async () => {
    if (!subjectForm.code || !subjectForm.name) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subjectForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("Subject added");
      setShowSubjectForm(false);
      setSubjectForm({ code: "", name: "", category: "CORE", description: "" });
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subject");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 view-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Classes & Subjects</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {classes.length} classes, {subjects.length} subjects (CBC)
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setShowSubjectForm(true)}>
                <BookOpen className="w-4 h-4 mr-2" />
                Add Subject
              </Button>
              <Button onClick={handleAddClass}>
                <Plus className="w-4 h-4 mr-2" />
                Add Class
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Subjects Bar */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            CBC Subjects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {subjects.map((sub) => (
              <Badge
                key={sub.id}
                variant="outline"
                className="px-3 py-1 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground mr-1">
                  {sub.code}
                </span>
                {sub.name}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({sub._count.classes})
                </span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Classes List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {classes.map((cls) => (
            <Card key={cls.id} className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-foreground">
                        {cls.name}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {cls.academicYear}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {cls._count.students} students
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {cls._count.subjects} subjects
                      </span>
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        {cls._count.teachers} teacher{cls._count.teachers !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Expanded Details */}
                    {expandedClass === cls.id && (
                      <div className="mt-3 space-y-2 pt-3 border-t">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Subjects
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cls.subjects.map((cs) => (
                              <Badge key={cs.subjectId} variant="secondary" className="text-xs">
                                {cs.subject.code} — {cs.subject.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Teachers
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cls.teachers.map((ct) => (
                              <Badge
                                key={ct.teacherId}
                                variant={ct.isPrimary ? "default" : "secondary"}
                                className={ct.isPrimary ? "bg-primary/10 text-primary hover:bg-primary/10 text-xs" : "text-xs"}
                              >
                                {ct.teacher.user.name}
                                {ct.isPrimary && " (Class Teacher)"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        setExpandedClass(
                          expandedClass === cls.id ? null : cls.id
                        )
                      }
                    >
                      {expandedClass === cls.id ? "Hide" : "Details"}
                    </Button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditClass(cls)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                          onClick={() => { setDeleteTarget(cls); setDeleteOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All student records associated with this class will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteClass}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Class Form Dialog */}
      <Dialog open={showClassForm} onOpenChange={setShowClassForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? "Edit Class" : "Add New Class"}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? "Update the class details and assigned subjects."
                : "Fill in the details to create a new class and assign subjects."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
                <Label>Class Name *</Label>
                <Select
                  value={classForm.name}
                  onValueChange={(v) => setClassForm({ ...classForm, name: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Grade 1", "Grade 2", "Grade 3", "Grade 4",
                      "Grade 5", "Grade 6", "Grade 7", "Grade 8",
                      "PP1", "PP2",
                    ].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <Input
                value={classForm.academicYear}
                onChange={(e) =>
                  setClassForm({ ...classForm, academicYear: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assign Subjects</Label>
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto p-1">
                {subjects.map((sub) => {
                  const checked = classForm.subjectIds.includes(sub.id);
                  return (
                    <label
                      key={sub.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        checked
                          ? "bg-primary/10 border-primary/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const newIds = checked
                            ? classForm.subjectIds.filter((id) => id !== sub.id)
                            : [...classForm.subjectIds, sub.id];
                          setClassForm({ ...classForm, subjectIds: newIds });
                        }}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {sub.code}
                      </span>
                      {sub.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClassForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveClass}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingClass
                ? "Update Class"
                : "Create Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subject Form Dialog */}
      <Dialog open={showSubjectForm} onOpenChange={setShowSubjectForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
            <DialogDescription>
              Create a new CBC subject to assign to classes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Subject Code *</Label>
                <Input
                  value={subjectForm.code}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. ENG"
                  maxLength={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={subjectForm.category}
                  onValueChange={(v) =>
                    setSubjectForm({ ...subjectForm, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CORE">Core</SelectItem>
                    <SelectItem value="OPTIONAL">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject Name *</Label>
              <Input
                value={subjectForm.name}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, name: e.target.value })
                }
                placeholder="e.g. Mathematics"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={subjectForm.description}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, description: e.target.value })
                }
                placeholder="Brief description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubjectForm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSubject}
              disabled={saving}
            >
              {saving ? "Saving..." : "Add Subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
