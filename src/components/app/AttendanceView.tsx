"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";
import { ClipboardCheck, Save, BarChart3, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";

interface ClassOption {
  id: string;
  name: string;
  /** True when the logged-in teacher is THE class teacher of this class. */
  isPrimary?: boolean;
}

interface AttendanceRecord {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  status: string | null;
  attendanceId: string | null;
}

interface AttendanceData {
  records: AttendanceRecord[];
  classId: string;
  date: string;
  totalStudents: number;
  markedCount: number;
  isComplete: boolean;
}

interface ReportSummary {
  totalRecords: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number;
}

interface StudentReport {
  studentId: string;
  studentName: string;
  present: number;
  absent: number;
  late: number;
  total: number;
}

export function AttendanceView() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("mark");

  // Report state
  const [reportClass, setReportClass] = useState("");
  const [reportFromDate, setReportFromDate] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
  );
  const [reportToDate, setReportToDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [studentReports, setStudentReports] = useState<StudentReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const res = await apiFetch("/api/classes");
      const data = await res.json();
      setClasses(data.classes || []);
      if (data.classes?.length > 0 && !selectedClass) {
        setSelectedClass(data.classes[0].id);
        setReportClass(data.classes[0].id);
      }
    } catch {
      toast.error("Failed to load classes");
    }
  };

  const fetchAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/attendance?classId=${selectedClass}&date=${date}`
      );
      const data = await res.json();
      setAttendanceData(data);
      setRecords(data.records || []);
    } catch {
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, date]);

  useEffect(() => {
    if (activeTab === "mark") {
      fetchAttendance();
    }
  }, [fetchAttendance, activeTab]);

  const setRecordStatus = (studentId: string, status: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.studentId === studentId ? { ...r, status } : r
      )
    );
  };

  const markAllPresent = () => {
    setRecords((prev) =>
      prev.map((r) => ({ ...r, status: "PRESENT" }))
    );
  };

  const handleSave = async () => {
    const unsaved = records.filter((r) => !r.status);
    if (unsaved.length > 0) {
      toast.error(`Please mark all students. ${unsaved.length} remaining.`);
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          classId: selectedClass,
          date,
          records: records.map((r) => ({
            studentId: r.studentId,
            status: r.status,
            attendanceId: r.attendanceId,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      toast.success("Attendance saved successfully!");
      fetchAttendance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const fetchReport = async () => {
    if (!reportClass) return;
    setReportLoading(true);
    try {
      const params = new URLSearchParams({
        classId: reportClass,
        fromDate: reportFromDate,
        toDate: reportToDate,
      });
      const res = await apiFetch(`/api/attendance/report?${params}`);
      const data = await res.json();
      setReportSummary(data.summary);
      setStudentReports(data.studentSummary || []);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setReportLoading(false);
    }
  };

  const statusCounts = {
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) => r.status === "ABSENT").length,
    late: records.filter((r) => r.status === "LATE").length,
    unmarked: records.filter((r) => !r.status).length,
  };

  // ROLE RULE: marking attendance is the class teacher's duty. Subject
  // teachers and admins without the primary assignment get view-only access.
  const selectedClassInfo = classes.find((c) => c.id === selectedClass);
  const canMarkSelected = isAdmin || !!selectedClassInfo?.isPrimary;

  return (
    <div className="view-enter space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Attendance</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Mark daily attendance and view reports
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="mark" className="gap-1.5">
            <ClipboardCheck className="w-4 h-4" />
            Mark Attendance
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Mark Attendance Tab */}
        <TabsContent value="mark" className="space-y-4">
          {/* VIEW-ONLY banner for teachers who are not the class teacher */}
          {!canMarkSelected && selectedClass && (
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-200/60 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
              <Info className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-blue-700 dark:text-blue-300">View-only access</p>
                <p className="text-blue-700/80 dark:text-blue-300/80 mt-0.5">
                  Marking attendance is the responsibility of the class teacher of {selectedClassInfo?.name || "this class"}. You can review the daily register below and run reports.
                </p>
              </div>
            </div>
          )}
          {/* Controls */}
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="space-y-1.5 flex-1 w-full sm:w-auto">
                  <Label>Class</Label>
                  <Select
                    value={selectedClass}
                    onValueChange={setSelectedClass}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" })}
                    className="w-full sm:w-44"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full bg-muted" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <Card className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="py-12 text-center text-muted-foreground">
                {selectedClass
                  ? "No students found in this class."
                  : "Select a class to mark attendance."}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Status Bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-primary">
                      {statusCounts.present}
                    </span>
                    <span className="text-muted-foreground">Present</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 dark:bg-red-500" />
                    <span className="font-semibold text-red-700 dark:text-red-400">
                      {statusCounts.absent}
                    </span>
                    <span className="text-muted-foreground">Absent</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500 dark:bg-amber-500" />
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {statusCounts.late}
                    </span>
                    <span className="text-muted-foreground">Late</span>
                  </span>
                </div>
                <div className="flex-1" />
                {canMarkSelected && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={markAllPresent}
                    >
                      Mark All Present
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={saving || statusCounts.unmarked > 0}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {saving
                        ? "Saving..."
                        : attendanceData?.isComplete
                        ? "Update"
                        : "Save"}
                    </Button>
                  </>
                )}
              </div>

              {/* Attendance Table */}
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-semibold w-12">
                            #
                          </TableHead>
                          <TableHead className="text-xs font-semibold">
                            Student Name
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record, idx) => (
                          <TableRow
                            key={record.studentId}
                            className={
                              record.status === "ABSENT"
                                ? "bg-red-50/50 dark:bg-red-950/30"
                                : record.status === "LATE"
                                ? "bg-amber-50/50 dark:bg-amber-950/30"
                                : "hover:bg-muted/50"
                            }
                          >
                            <TableCell className="text-xs text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {record.lastName}, {record.firstName}
                            </TableCell>
                            <TableCell>
                              {canMarkSelected ? (
                                <div className="flex items-center justify-center gap-1">
                                  {[
                                    {
                                      val: "PRESENT",
                                      label: "P",
                                      inactiveCls:
                                        "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60",
                                      activeCls:
                                        "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
                                    },
                                    {
                                      val: "ABSENT",
                                      label: "A",
                                      inactiveCls:
                                        "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/60",
                                      activeCls:
                                        "bg-red-600 text-white border-red-600 hover:bg-red-700",
                                    },
                                    {
                                      val: "LATE",
                                      label: "L",
                                      inactiveCls:
                                        "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40 hover:bg-amber-100/80 dark:hover:bg-amber-900/50",
                                      activeCls:
                                        "bg-amber-600 text-white border-amber-600 hover:bg-amber-700",
                                    },
                                  ].map((opt) => (
                                    <button
                                      key={opt.val}
                                      onClick={() =>
                                        setRecordStatus(
                                          record.studentId,
                                          record.status === opt.val
                                            ? "PRESENT"
                                            : opt.val
                                        )
                                      }
                                      aria-label={`Mark ${record.firstName} ${record.lastName} as ${opt.val.charAt(0) + opt.val.slice(1).toLowerCase()}`}
                                      aria-pressed={record.status === opt.val}
                                      className={`w-8 h-8 rounded-md text-xs font-bold border transition-colors ${
                                        record.status === opt.val
                                          ? opt.activeCls
                                          : opt.inactiveCls
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                // Read-only status chip for non-class teachers
                                <div className="flex justify-center">
                                  <Badge
                                    variant="outline"
                                    className={
                                      record.status === "PRESENT"
                                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40"
                                        : record.status === "ABSENT"
                                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40"
                                        : record.status === "LATE"
                                        ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40"
                                        : "bg-muted text-muted-foreground border-border"
                                    }
                                  >
                                    {record.status
                                      ? record.status.charAt(0) + record.status.slice(1).toLowerCase()
                                      : "Not marked"}
                                  </Badge>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="report" className="space-y-4">
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="space-y-1.5 flex-1 w-full sm:w-auto">
                  <Label>Class</Label>
                  <Select
                    value={reportClass}
                    onValueChange={setReportClass}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={reportFromDate}
                    onChange={(e) => setReportFromDate(e.target.value)}
                    className="w-full sm:w-44"
                  />
                </div>
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={reportToDate}
                    onChange={(e) => setReportToDate(e.target.value)}
                    className="w-full sm:w-44"
                  />
                </div>
                <Button
                  onClick={fetchReport}
                  disabled={reportLoading}
                  className="w-full sm:w-auto"
                >
                  Generate Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {reportLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full bg-muted" />
              ))}
            </div>
          ) : reportSummary ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-primary">
                      {reportSummary.attendanceRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Attendance Rate</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-primary">
                      {reportSummary.present}
                    </p>
                    <p className="text-xs text-muted-foreground">Present</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                      {reportSummary.absent}
                    </p>
                    <p className="text-xs text-muted-foreground">Absent</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {reportSummary.late}
                    </p>
                    <p className="text-xs text-muted-foreground">Late</p>
                  </CardContent>
                </Card>
              </div>

              {/* Student Report Table */}
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Student Attendance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-semibold">Student</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Total Days</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Present</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Absent</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Late</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentReports.map((sr) => {
                          const rate =
                            sr.total > 0
                              ? Math.round(
                                  ((sr.present + sr.late) / sr.total) * 100
                                )
                              : 0;
                          return (
                            <TableRow key={sr.studentId} className="hover:bg-muted/50">
                              <TableCell className="text-sm">
                                <div>
                                  <p className="font-medium">{sr.studentName}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {sr.total}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-sm font-medium text-primary">
                                  {sr.present}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                                  {sr.absent}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                  {sr.late}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className={
                                    rate >= 90
                                      ? "bg-primary/10 text-primary hover:bg-primary/10"
                                      : rate >= 70
                                      ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 hover:bg-amber-100/80 dark:hover:bg-amber-900/50"
                                      : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 hover:bg-red-100/80 dark:hover:bg-red-900/50"
                                  }
                                >
                                  {rate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a class and date range, then click Generate Report.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
