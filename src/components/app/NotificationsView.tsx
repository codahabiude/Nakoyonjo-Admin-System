// FILE: NotificationsView.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Send, RefreshCw, Settings, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

interface NotificationItem {
  id: string;
  parentName: string;
  recipient: string;
  type: string;
  status: string;
  message: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ExamOption {
  id: string;
  name: string;
  term: string;
  year: string;
  className: string;
}

export function NotificationsView() {
  const { setCurrentView } = useAppStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState("");

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      toast.error("Failed to load notifications");
    }
  }, []);

  const fetchExams = async () => {
    try {
      const res = await apiFetch("/api/exams");
      const data = await res.json();
      setExams(data.exams || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchNotifications(), fetchExams()]);
      setLoading(false);
    };
    load();
  }, [fetchNotifications]);

  const handleSend = async () => {
    if (!selectedExamId) {
      toast.error("Select an exam");
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          examId: selectedExamId,
          studentIds: [],
          type: "SMS",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast.success(
        `Sent ${data.sentCount ?? 0} SMS${data.failedCount > 0 ? `, ${data.failedCount} failed` : ""}`
      );
      setShowSendDialog(false);
      setSelectedExamId("");
      fetchNotifications();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
    setSending(false);
  };

  const statusBadge = (status: string) => {
    if (status === "SENT")
      return (
        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
          SENT
        </Badge>
      );
    if (status === "FAILED")
      return (
        <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
          FAILED
        </Badge>
      );
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        PENDING
      </Badge>
    );
  };

  return (
    <div className="view-enter space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Send exam results to parents via SMS
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentView("settings")}
          >
            <Settings className="w-4 h-4 mr-2" />
            SMS Settings
          </Button>
          <Button onClick={() => setShowSendDialog(true)}>
            <Send className="w-4 h-4 mr-2" />
            Send Results via SMS
          </Button>
        </div>
      </div>

      {/* Notification History Table */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full bg-muted" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p>No notifications sent yet.</p>
              <p className="text-sm mt-1">
                Click &quot;Send Results via SMS&quot; to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Parent</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">
                      Recipient
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Type</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">
                      Message
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground">
                        {n.sentAt
                          ? new Date(n.sentAt).toLocaleDateString()
                          : new Date(n.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {n.parentName}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-mono">
                        {n.recipient}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {n.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{statusBadge(n.status)}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {n.message}
                        {n.errorMessage && (
                          <span className="text-destructive block">
                            {n.errorMessage}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Exam Results via SMS</DialogTitle>
            <DialogDescription>
              Select an exam to send results to all parents of students in that
              exam&apos;s class.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Select Exam</Label>
              <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an exam" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} — {e.className} ({e.term})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              SMS will be sent to all parents of students in the selected
              exam&apos;s class. Make sure SMS settings are configured.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !selectedExamId}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {sending ? "Sending..." : "Send SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
