// FILE: ParentsView.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface ParentChild {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  className: string;
  relation: string;
}

interface ParentItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  alternatePhone: string | null;
  nationalId: string | null;
  address: string | null;
  children: ParentChild[];
  createdAt: string;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  class?: { name: string };
}

const emptyForm = {
  name: "",
  phone: "",
  nationalId: "",
  alternatePhone: "",
  address: "",
  relation: "Parent",
};

export function ParentsView() {
  const [parents, setParents] = useState<ParentItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [editingParent, setEditingParent] = useState<ParentItem | null>(null);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parentToDelete, setParentToDelete] = useState<ParentItem | null>(null);

  const fetchParents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await apiFetch(`/api/parents?${params.toString()}`);
      const data = await res.json();
      setParents(data.parents || []);
    } catch {
      toast.error("Failed to load parents");
    }
  }, [search]);

  const fetchStudents = async () => {
    try {
      const res = await apiFetch("/api/students?limit=200");
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchParents(), fetchStudents()]);
      setLoading(false);
    };
    load();
  }, [fetchParents]);

  const handleAdd = () => {
    setEditingParent(null);
    setForm(emptyForm);
    setSelectedStudentIds([]);
    setShowAdd(true);
  };

  const handleEdit = (parent: ParentItem) => {
    setEditingParent(parent);
    setForm({
      name: parent.name,
      phone: parent.phone,
      nationalId: parent.nationalId || "",
      alternatePhone: parent.alternatePhone || "",
      address: parent.address || "",
      relation: parent.children[0]?.relation || "Parent",
    });
    setSelectedStudentIds(parent.children.map((c) => c.id));
    setShowEdit(true);
  };

  const confirmDelete = (parent: ParentItem) => {
    setParentToDelete(parent);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parentToDelete) return;
    try {
      const res = await apiFetch(`/api/parents/${parentToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete parent");
      }
      toast.success("Parent deleted");
      fetchParents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete parent");
    }
    setDeleteDialogOpen(false);
    setParentToDelete(null);
  };

  const handleSave = async (isEdit: boolean) => {
    if (!form.name || !form.phone) {
      toast.error("Name and phone are required");
      return;
    }
    if (selectedStudentIds.length === 0) {
      toast.error("Select at least one child");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editingParent) {
        const res = await apiFetch(`/api/parents/${editingParent.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            studentIds: selectedStudentIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update");
        }
        toast.success("Parent updated");
        setShowEdit(false);
      } else {
        const res = await apiFetch("/api/parents", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            studentIds: selectedStudentIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create");
        }
        const data = await res.json();
        toast.success("Parent created");
        setShowAdd(false);
        if (data.parent?.credentials) {
          setCredentials(data.parent.credentials);
          setShowCredentials(true);
        }
      }
      fetchParents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const copyCredentials = () => {
    if (!credentials) return;
    const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
    navigator.clipboard.writeText(text)
      .then(() => setCopied(true))
      .catch(() => toast.error("Could not copy to clipboard"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="view-enter space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Parents</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {parents.length} parent{parents.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Parent
        </Button>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full bg-muted" />
              ))}
            </div>
          ) : parents.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No parents found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Name</TableHead>
                    <TableHead className="text-xs font-semibold">Phone</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">
                      Email
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-center">
                      Children
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parents.map((parent) => (
                    <TableRow
                      key={parent.id}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="font-medium text-sm">
                        {parent.name}
                      </TableCell>
                      <TableCell className="text-sm">{parent.phone}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {parent.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary hover:bg-primary/10"
                        >
                          <Users className="w-3 h-3 mr-1" />
                          {parent.children.length}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(parent)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                            onClick={() => confirmDelete(parent)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Parent Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Parent</DialogTitle>
            <DialogDescription>
              Enter the parent&apos;s details and link them to their children.
              An account will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. John Wanjiru"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone Number *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. +254712345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label>National ID</Label>
                <Input
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.target.value })
                  }
                  placeholder="e.g. 12345678"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alternate Phone</Label>
                <Input
                  value={form.alternatePhone}
                  onChange={(e) =>
                    setForm({ ...form, alternatePhone: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Relationship *</Label>
                <Select
                  value={form.relation}
                  onValueChange={(v) => setForm({ ...form, relation: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Father">Father</SelectItem>
                    <SelectItem value="Mother">Mother</SelectItem>
                    <SelectItem value="Uncle">Uncle</SelectItem>
                    <SelectItem value="Aunt">Aunt</SelectItem>
                    <SelectItem value="Grandmother">Grandmother</SelectItem>
                    <SelectItem value="Guardian">Guardian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. P.O. Box 45, Bungoma"
              />
            </div>

            {/* Student Selection */}
            <div className="border-t pt-3 mt-1">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Select Children ({selectedStudentIds.length} selected)
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No students available
                  </p>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedStudentIds.includes(s.id)}
                        onCheckedChange={() => toggleStudent(s.id)}
                      />
                      <span className="text-sm">
                        {s.lastName}, {s.firstName}
                        {s.class && (
                          <span className="text-muted-foreground ml-1">
                            — {s.class.name}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Creating..." : "Create Parent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Parent Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Parent</DialogTitle>
            <DialogDescription>
              Update the parent&apos;s details and manage linked children.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone Number *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>National ID</Label>
                <Input
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alternate Phone</Label>
                <Input
                  value={form.alternatePhone}
                  onChange={(e) =>
                    setForm({ ...form, alternatePhone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Relationship *</Label>
                <Select
                  value={form.relation}
                  onValueChange={(v) => setForm({ ...form, relation: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Father">Father</SelectItem>
                    <SelectItem value="Mother">Mother</SelectItem>
                    <SelectItem value="Uncle">Uncle</SelectItem>
                    <SelectItem value="Aunt">Aunt</SelectItem>
                    <SelectItem value="Grandmother">Grandmother</SelectItem>
                    <SelectItem value="Guardian">Guardian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            {/* Student Selection */}
            <div className="border-t pt-3 mt-1">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Linked Children ({selectedStudentIds.length} selected)
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {students.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedStudentIds.includes(s.id)}
                      onCheckedChange={() => toggleStudent(s.id)}
                    />
                    <span className="text-sm">
                      {s.lastName}, {s.firstName}
                      <span className="text-muted-foreground ml-1">
                        ({s.admissionNo})
                      </span>
                      {s.class && (
                        <span className="text-muted-foreground ml-1">
                          — {s.class.name}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>
              {saving ? "Updating..." : "Update Parent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Parent Account Created</DialogTitle>
            <DialogDescription>
              Share these login credentials with the parent. They will need these
              to access the parent portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-primary font-medium">Email</p>
                <p className="text-sm font-mono font-medium break-all">
                  {credentials?.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-primary font-medium">Password</p>
                <p className="text-sm font-mono font-medium">
                  {credentials?.password}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={copyCredentials}
            >
              {copied ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {copied ? "Copied!" : "Copy Credentials"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation - AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Parent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {parentToDelete?.name} and their login
              account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
