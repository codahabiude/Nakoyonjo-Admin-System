"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Pencil, Trash2, Search, GraduationCap, Loader2, BookOpen, Key, Eye, EyeOff, Copy, Check, Crown } from "lucide-react";
import { toast } from "sonner";

interface SubjectAssignment {
  id: string;
  subjectId: string;
  classId: string;
  subject: { id: string; name: string; code: string };
  class: { id: string; name: string };
}

interface Teacher {
  id: string;
  employeeId: string;
  phone: string | null;
  qualification: string | null;
  dateJoined: string;
  userId: string;
  user: { email: string; name: string; role: string; isActive: boolean };
  classes: { classId: string; isPrimary: boolean; class: { id: string; name: string } }[];
  subjects: SubjectAssignment[];
}

interface ClassOption {
  id: string;
  name: string;
  subjects?: { id: string; name: string; code: string }[];
}

// Map: classId -> subjectId[]
type SubjectAssignmentsMap = Record<string, string[]>;

const emptyForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  qualification: "",
  classIds: [] as string[],
  primaryClassId: "", // class they lead as CLASS TEACHER; "" = regular teacher
  subjectAssignments: {} as SubjectAssignmentsMap,
};

export function TeachersView() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Subjects panel state
  const [subjectsPanelTeacher, setSubjectsPanelTeacher] = useState<Teacher | null>(null);
  const [subjectsPanelOpen, setSubjectsPanelOpen] = useState(false);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignmentsMap>({});
  const [savingSubjects, setSavingSubjects] = useState(false);

  // Credentials dialog state
  const [credentialsTeacher, setCredentialsTeacher] = useState<Teacher | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const fetchTeachers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/teachers");
      const data = await res.json();
      setTeachers(data.teachers || []);
    } catch {
      toast.error("Failed to load teachers");
    }
  }, []);

  const fetchClasses = async () => {
    try {
      const res = await apiFetch("/api/classes");
      const data = await res.json();
      setClasses(
        (data.classes || []).map((c: { id: string; name: string; subjects?: { subject: { id: string; name: string; code: string } }[] }) => ({
          id: c.id,
          name: c.name,
          subjects: c.subjects?.map((cs) => cs.subject) || [],
        }))
      );
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTeachers(), fetchClasses()]).finally(() =>
      setLoading(false)
    );
  }, [fetchTeachers]);

  // Get subjects available for a given class
  const getSubjectsForClass = useCallback((classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    return cls?.subjects || [];
  }, [classes]);

  // Fetch class-subject mapping for the subjects panel
  const fetchClassSubjects = useCallback(async (classId: string) => {
    try {
      const res = await apiFetch(`/api/classes/${classId}`);
      const data = await res.json();
      return data.class?.subjects || [];
    } catch {
      return [];
    }
  }, []);

  const filteredTeachers = useMemo(() => {
    if (!search.trim()) return teachers;
    const q = search.toLowerCase();
    return teachers.filter(
      (t) =>
        t.user.name.toLowerCase().includes(q) ||
        t.employeeId.toLowerCase().includes(q) ||
        t.user.email.toLowerCase().includes(q) ||
        (t.phone && t.phone.includes(q))
    );
  }, [teachers, search]);

  const handleAdd = () => {
    setEditingTeacher(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setForm({
      name: teacher.user.name,
      email: teacher.user.email,
      password: "",
      phone: teacher.phone || "",
      qualification: teacher.qualification || "",
      classIds: teacher.classes.map((c) => c.classId),
      primaryClassId: teacher.classes.find((c) => c.isPrimary)?.classId || "",
      subjectAssignments: {},
    });
    setShowForm(true);
  };

  // Open subjects panel for a teacher
  const openSubjectsPanel = async (teacher: Teacher) => {
    setSubjectsPanelTeacher(teacher);
    // Build initial subject assignments from teacher's existing data
    const map: SubjectAssignmentsMap = {};
    for (const tc of teacher.classes) {
      const assignedSubjects = teacher.subjects
        .filter((s) => s.classId === tc.classId)
        .map((s) => s.subjectId);
      map[tc.classId] = assignedSubjects;
    }
    setSubjectAssignments(map);
    setSubjectsPanelOpen(true);
  };

  const toggleSubjectForClass = (classId: string, subjectId: string) => {
    setSubjectAssignments((prev) => {
      const current = prev[classId] || [];
      const updated = current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId];
      return { ...prev, [classId]: updated };
    });
  };

  const handleSaveSubjects = async () => {
    if (!subjectsPanelTeacher) return;
    setSavingSubjects(true);
    try {
      const assignments = Object.entries(subjectAssignments).map(
        ([classId, subjectIds]) => ({ classId, subjectIds })
      );
      const res = await apiFetch(`/api/teachers/${subjectsPanelTeacher.id}`, {
        method: "PUT",
        body: JSON.stringify({ subjectAssignments: assignments }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Subject assignments updated");
      setSubjectsPanelOpen(false);
      fetchTeachers();
    } catch {
      toast.error("Failed to save subject assignments");
    } finally {
      setSavingSubjects(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/teachers/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete teacher");
      }
      toast.success("Teacher deleted");
      fetchTeachers();
    } catch {
      toast.error("Failed to delete teacher");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast.error("Name and email are required");
      return;
    }
    if (!editingTeacher && !form.password) {
      toast.error("Password is required for new teachers");
      return;
    }

    setSaving(true);
    try {
      if (editingTeacher) {
        const res = await apiFetch(`/api/teachers/${editingTeacher.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            phone: form.phone,
            qualification: form.qualification,
            classIds: form.classIds,
            primaryClassId: form.primaryClassId || null,
          }),
        });
        if (!res.ok) throw new Error("Failed to update");
        toast.success("Teacher updated");
      } else {
        const res = await apiFetch("/api/teachers", {
          method: "POST",
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create");
        }
        toast.success("Teacher added");
      }
      setShowForm(false);
      fetchTeachers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save teacher");
    } finally {
      setSaving(false);
    }
  };

  // Count total subject assignments for a teacher
  const getSubjectCount = (teacher: Teacher) => teacher.subjects.length;

  // Get unique subject names taught by teacher (across all classes)
  const getUniqueSubjects = (teacher: Teacher) => {
    const map = new Map<string, string>();
    for (const s of teacher.subjects) {
      if (!map.has(s.subject.code)) {
        map.set(s.subject.code, s.subject.name);
      }
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  };

  return (
    <div className="view-enter space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Teachers</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {teachers.length} teacher{teachers.length !== 1 ? "s" : ""} on staff
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleAdd}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add Teacher
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, employee ID, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="p-12 text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {search ? "No teachers match your search." : "No teachers found."}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {search
                  ? "Try adjusting your search terms."
                  : "Add your first teacher to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold">Emp ID</TableHead>
                    <TableHead className="text-xs font-semibold">Name</TableHead>
                    <TableHead className="text-xs font-semibold">Role</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">Email</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Phone</TableHead>
                    <TableHead className="text-xs font-semibold">Classes</TableHead>
                    <TableHead className="text-xs font-semibold">Subjects</TableHead>
                    {isAdmin && (
                      <TableHead className="text-xs font-semibold text-right">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => {
                    const uniqueSubjects = getUniqueSubjects(teacher);
                    return (
                      <TableRow key={teacher.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs font-mono">
                          {teacher.employeeId}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {teacher.user.name}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const primaryClass = teacher.classes.find(
                              (tc) => tc.isPrimary
                            );
                            return primaryClass ? (
                              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 text-xs gap-1.5 hover:bg-amber-100 dark:hover:bg-amber-950/50">
                                <Crown className="w-3 h-3" />
                                Class Teacher
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs text-muted-foreground"
                              >
                                Regular Teacher
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {teacher.user.email}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {teacher.phone || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {teacher.classes.map((tc) => (
                              <Badge
                                key={tc.classId}
                                variant={
                                  tc.isPrimary ? "default" : "secondary"
                                }
                                className={
                                  tc.isPrimary
                                    ? "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 text-xs gap-1 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                                    : "text-xs"
                                }
                              >
                                {tc.class.name}
                                {tc.isPrimary && <Crown className="w-3 h-3" />}
                              </Badge>
                            ))}
                            {teacher.classes.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                None assigned
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {uniqueSubjects.length > 0 ? (
                              uniqueSubjects.map((s) => (
                                <Badge
                                  key={s.code}
                                  variant="outline"
                                  className="text-xs font-mono gap-1"
                                >
                                  <BookOpen className="w-3 h-3" />
                                  {s.code}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No subjects
                              </span>
                            )}
                            {getSubjectCount(teacher) > uniqueSubjects.length && (
                              <span className="text-xs text-muted-foreground">
                                ({getSubjectCount(teacher)} total)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View Credentials"
                                onClick={() => {
                                  setCredentialsTeacher(teacher);
                                  setNewPassword("");
                                  setShowNewPassword(false);
                                  setEmailCopied(false);
                                  setCredentialsOpen(true);
                                }}
                              >
                                <Key className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Assign Subjects"
                                onClick={() => openSubjectsPanel(teacher)}
                              >
                                <BookOpen className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(teacher)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                                onClick={() => setDeleteTarget(teacher)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTeacher ? "Edit Teacher" : "Add New Teacher"}
            </DialogTitle>
            <DialogDescription>
              {editingTeacher
                ? "Update the teacher\u2019s information below."
                : "Fill in the details to register a new teacher."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="teacherName">Full Name *</Label>
                <Input
                  id="teacherName"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="e.g. Mr. John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacherEmail">Email *</Label>
                <Input
                  id="teacherEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  placeholder="e.g. john@school.ac.ke"
                />
              </div>
            </div>
            {!editingTeacher && (
              <div className="space-y-2">
                <Label htmlFor="teacherPassword">Password *</Label>
                <Input
                  id="teacherPassword"
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="Minimum 6 characters"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="teacherPhone">Phone</Label>
                <Input
                  id="teacherPhone"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  placeholder="e.g. +254712345678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacherQualification">Qualification</Label>
                <Input
                  id="teacherQualification"
                  value={form.qualification}
                  onChange={(e) =>
                    setForm({ ...form, qualification: e.target.value })
                  }
                  placeholder="e.g. B.Ed (Primary)"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign Classes</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {classes.map((c) => {
                  const checked = form.classIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        checked
                          ? "bg-primary/10 border-primary/25"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const newIds = checked
                            ? form.classIds.filter((id) => id !== c.id)
                            : [...form.classIds, c.id];
                          setForm({
                            ...form,
                            classIds: newIds,
                            // Unchecking their class also revokes the
                            // class-teacher role of that class.
                            primaryClassId:
                              checked && form.primaryClassId === c.id
                                ? ""
                                : form.primaryClassId,
                          });
                        }}
                      />
                      {c.name}
                    </label>
                  );
                })}
                {classes.length === 0 && (
                  <p className="col-span-2 text-sm text-muted-foreground text-center py-2">
                    No classes available. Create classes first.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Select
                value={form.primaryClassId || "none"}
                onValueChange={(value) => {
                  const classId = value === "none" ? "" : value;
                  setForm((prev) => {
                    // Leading a class implies being assigned to it.
                    const classIds =
                      classId && !prev.classIds.includes(classId)
                        ? [...prev.classIds, classId]
                        : prev.classIds;
                    return { ...prev, primaryClassId: classId, classIds };
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                      Regular Teacher
                    </span>
                  </SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        Class Teacher — {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A <span className="font-medium text-foreground">Class Teacher</span> additionally marks daily attendance, writes
                report-card remarks and monitors the whole class. Assigning a class teacher here replaces the previous one for
                that class.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingTeacher ? (
                "Update Teacher"
              ) : (
                "Add Teacher"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subject Assignment Dialog */}
      <Dialog open={subjectsPanelOpen} onOpenChange={setSubjectsPanelOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Assign Subjects
            </DialogTitle>
            <DialogDescription>
              Select which subjects {subjectsPanelTeacher?.user.name} teaches in each of their assigned classes.
              Class teachers typically teach some subjects in their own class.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {subjectsPanelTeacher?.classes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">This teacher has no classes assigned.</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Assign classes first, then come back to assign subjects.
                </p>
              </div>
            ) : (
              subjectsPanelTeacher?.classes.map((tc) => {
                const classSubjects = getSubjectsForClass(tc.classId);
                const assignedIds = subjectAssignments[tc.classId] || [];
                const allSelected = classSubjects.length > 0 && assignedIds.length === classSubjects.length;

                return (
                  <div key={tc.classId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {tc.class.name}
                        </span>
                        {tc.isPrimary && (
                          <Badge className="bg-primary/10 text-primary text-xs hover:bg-primary/10">
                            Class Teacher
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {assignedIds.length} of {classSubjects.length} subjects
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-3 rounded-lg border bg-muted/20">
                      {classSubjects.length === 0 ? (
                        <p className="col-span-full text-xs text-muted-foreground py-1">
                          No subjects linked to this class yet.
                        </p>
                      ) : (
                        <>
                          <label
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs font-medium transition-colors ${
                              allSelected
                                ? "bg-primary/15 text-primary"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            <Checkbox
                              checked={allSelected}
                              ref={(el) => {
                                if (el) {
                                  (el as unknown as HTMLInputElement).indeterminate = assignedIds.length > 0 && !allSelected;
                                }
                              }}
                              onCheckedChange={() => {
                                if (allSelected) {
                                  setSubjectAssignments((prev) => ({
                                    ...prev,
                                    [tc.classId]: [],
                                  }));
                                } else {
                                  setSubjectAssignments((prev) => ({
                                    ...prev,
                                    [tc.classId]: classSubjects.map((s) => s.id),
                                  }));
                                }
                              }}
                            />
                            All Subjects
                          </label>
                          {classSubjects.map((subject) => {
                            const isChecked = assignedIds.includes(subject.id);
                            return (
                              <label
                                key={subject.id}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs transition-colors ${
                                  isChecked
                                    ? "bg-primary/10 border-primary/20 border text-foreground"
                                    : "hover:bg-muted/60 text-muted-foreground border border-transparent"
                                }`}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    toggleSubjectForClass(tc.classId, subject.id)
                                  }
                                />
                                <span className="font-mono font-semibold">{subject.code}</span>
                                <span className="truncate">{subject.name}</span>
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectsPanelOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubjects} disabled={savingSubjects}>
              {savingSubjects ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Assignments"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials / Reset Password Dialog */}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Teacher Credentials
            </DialogTitle>
            <DialogDescription>
              View login credentials for {credentialsTeacher?.user.name}. You can also reset their password here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Email display */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Login Email</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2.5 rounded-lg border bg-muted/30 font-mono text-sm">
                  {credentialsTeacher?.user.email}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Copy email"
                  onClick={() => {
                    if (credentialsTeacher?.user.email) {
                      navigator.clipboard.writeText(credentialsTeacher.user.email)
                        .then(() => {
                          setEmailCopied(true);
                          setTimeout(() => setEmailCopied(false), 2000);
                        })
                        .catch(() => toast.error("Could not copy to clipboard"));
                    }
                  }}
                >
                  {emailCopied ? <Check className="w-4 h-4 text-green-500 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Employee ID */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Employee ID</Label>
              <div className="px-3 py-2.5 rounded-lg border bg-muted/30 font-mono text-sm">
                {credentialsTeacher?.employeeId}
              </div>
            </div>

            {/* Password info */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1.5">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Password is stored securely (hashed)
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                For security, the original password cannot be retrieved. Use the form below to set a new password if the teacher has forgotten theirs.
              </p>
            </div>

            {/* Reset Password section */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Reset Password</Label>
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password (min 4 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <Button
                  className="w-full"
                  disabled={!newPassword || newPassword.length < 4 || resettingPassword}
                  onClick={async () => {
                    if (!credentialsTeacher || !newPassword) return;
                    setResettingPassword(true);
                    try {
                      const res = await apiFetch("/api/teachers/reset-password", {
                        method: "POST",
                        body: JSON.stringify({
                          teacherId: credentialsTeacher.id,
                          newPassword,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || "Failed to reset password");
                      }
                      toast.success(`Password reset for ${credentialsTeacher.user.name}`);
                      setNewPassword("");
                      setShowNewPassword(false);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to reset password");
                    } finally {
                      setResettingPassword(false);
                    }
                  }}
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4 mr-2" />
                      Reset Password
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Teacher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.user.name}
              </span>
              ? This action cannot be undone and their account will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
