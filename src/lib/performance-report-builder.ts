// Performance report builders for PDF and Excel exports
// Used by: /api/performance-reports/download

import PDFDocument from "pdfkit";
import * as ExcelJS from "exceljs";

const GREEN = "#166534";
const DARK = "#1a1a1a";
const GRAY = "#666666";
const LIGHT = "#f3f4f6";

// School identity from Settings. The download route calls
// setPerformanceReportSchoolName() once per request so every PDF/Excel
// header, footer and title uses the admin-configured school name.
let SCHOOL_NAME_PROPER = "Nakoyonjo DEB Primary School";
let SCHOOL_NAME_UPPER = SCHOOL_NAME_PROPER.toUpperCase();
export function setPerformanceReportSchoolName(name: string) {
  const clean = (name || "").trim();
  if (!clean) return;
  SCHOOL_NAME_PROPER = clean;
  SCHOOL_NAME_UPPER = clean.toUpperCase();
}
// Grade color helper — works with both 4-level (EE, ME, AE, BE) and 8-level (EE1, EE2, ME1, etc.) CBC grades
function getGradeColor(grade: string): string {
  if (grade.startsWith("EE")) return "#059669";
  if (grade.startsWith("ME")) return "#2563EB";
  if (grade.startsWith("AE")) return "#D97706";
  return "#DC2626";
}

// ============================================================
// SHARED HELPERS
// ============================================================

function pdfHeader(doc: PDFDocument.PDFDocument, title: string, subtitle: string) {
  const W = doc.page.width - 80;
  doc.rect(0, 0, doc.page.width, 80).fill(GREEN);
  doc.fill("white").fontSize(18).font("Helvetica-Bold")
    .text(SCHOOL_NAME_UPPER, 40, 22, { align: "center", width: W });
  doc.fontSize(11).font("Helvetica")
    .text(title, 40, 46, { align: "center", width: W });
  doc.fontSize(9).fill("#d1fae5")
    .text(subtitle, 40, 62, { align: "center", width: W });
  return 95;
}

function pdfTable(
  doc: PDFDocument.PDFDocument, y: number,
  headers: string[], colX: number[], colW: number[],
  rows: (string | number)[][],
  opts?: { altFill?: boolean; gradeCols?: number[]; fontSize?: number }
): number {
  const rowH = 20;
  const fs = opts?.fontSize || 8;
  const W = doc.page.width - 80;

  // Header
  if (y + rowH > 750) { doc.addPage(); y = 40; }
  doc.rect(40, y, W, rowH).fill(GREEN);
  doc.fill("white").fontSize(fs).font("Helvetica-Bold");
  headers.forEach((h, i) => doc.text(h, colX[i] + 3, y + 5, { width: colW[i] - 6, align: "center" }));
  y += rowH;

  // Rows
  rows.forEach((row, idx) => {
    if (y + rowH > 750) { doc.addPage(); y = 40; }
    if (opts?.altFill && idx % 2 === 1) doc.rect(40, y, W, rowH).fill("#f9fafb");
    row.forEach((val, ci) => {
      const isGrade = opts?.gradeCols?.includes(ci);
      if (isGrade) {
        const strVal = String(val);
        doc.fill(getGradeColor(strVal)).font("Helvetica-Bold");
      } else {
        doc.fill(DARK).font("Helvetica");
      }
      doc.text(String(val), colX[ci] + 3, y + 5, { width: colW[ci] - 6, align: "center" });
    });
    y += rowH;
  });
  return y;
}

// ============================================================
// 1. SUBJECT ANALYSIS
// ============================================================

interface SubjectAnalysisData {
  exam: { name: string; term: string; year: string; className: string };
  subjects: Array<{
    subjectName: string; subjectCode: string; totalStudents: number;
    mean: number; highest: number; lowest: number; passRate: number;
    gradeDistribution: { EE: number; ME: number; AE: number; BE: number };
    topStudents: Array<{ name: string; marks: number }>;
  }>;
}

export function buildSubjectAnalysisPDF(data: SubjectAnalysisData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    // A PDFKit error must reject the promise — otherwise the request hangs
    // forever (and an unhandled 'error' event can kill the Node process).
    doc.on("error", (err: Error) => reject(err));
    const W = doc.page.width - 80;

    let y = pdfHeader(doc, "Subject Performance Analysis", `Generated: ${new Date().toLocaleDateString("en-KE")}`);
    y += 5;
    doc.fill(DARK).fontSize(10).font("Helvetica-Bold")
      .text(`Exam: ${data.exam.name}`, 40, y);
    doc.text(`Class: ${data.exam.className}  |  Term: ${data.exam.term}  |  Year: ${data.exam.year}`, 200, y);
    y += 20;

    // Summary cards as text
    if (data.subjects.length > 0) {
      const avgPass = Math.round(data.subjects.reduce((s, sub) => s + sub.passRate, 0) / data.subjects.length);
      doc.fill(GRAY).fontSize(9).font("Helvetica")
        .text(`Subjects: ${data.subjects.length}   |   Avg Pass Rate: ${avgPass}%   |   Best: ${data.subjects[0].subjectName} (${data.subjects[0].mean})   |   Weakest: ${data.subjects[data.subjects.length - 1].subjectName} (${data.subjects[data.subjects.length - 1].mean})`, 40, y, { width: W });
      y += 20;
    }

    const colX = [40, 140, 200, 260, 320, 370, 415, 445, 475];
    const colW = [100, 60, 60, 60, 50, 45, 30, 30, 30];
    const rows = data.subjects.map((s) => [
      s.subjectName, s.totalStudents, s.mean, s.highest, s.lowest, `${s.passRate}%`,
      s.gradeDistribution.EE, s.gradeDistribution.ME, s.gradeDistribution.AE,
    ]);
    y = pdfTable(doc, y,
      ["Subject", "Students", "Mean", "Highest", "Lowest", "Pass %", "EE", "ME", "AE"],
      colX, colW, rows, { altFill: true }
    );

    // Top performers section
    y += 15;
    doc.fill(GREEN).fontSize(10).font("Helvetica-Bold").text("Top Performers per Subject", 40, y);
    y += 15;
    for (const s of data.subjects.slice(0, 6)) {
      if (y + 40 > 750) { doc.addPage(); y = 40; }
      doc.fill(DARK).fontSize(8).font("Helvetica-Bold").text(s.subjectName, 40, y);
      doc.fill(GRAY).font("Helvetica")
        .text(s.topStudents.slice(0, 3).map((st, i) => `${i + 1}. ${st.name} (${st.marks})`).join("   |   "), 40, y + 12, { width: W });
      y += 28;
    }

    // Footer
    y = Math.max(y + 10, 720);
    doc.fill(GRAY).fontSize(8).font("Helvetica")
      .text(`${SCHOOL_NAME_PROPER}  |  Performance Report  |  ${new Date().toLocaleDateString("en-KE")}`, 40, y, { align: "center", width: W });

    doc.end();
  });
}

export async function buildSubjectAnalysisExcel(data: SubjectAnalysisData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Subject Analysis");
  ws.columns = [
    { width: 28 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 },
  ];
  const greenFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  const hFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  let r = 1;
  ws.mergeCells(`A${r}:J${r}`);
  ws.getCell(`A${r}`).value = `${SCHOOL_NAME_UPPER} — Subject Analysis`;
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: "FF166534" } };
  ws.getCell(`A${r}`).alignment = center;
  r++;
  ws.mergeCells(`A${r}:J${r}`);
  ws.getCell(`A${r}`).value = `${data.exam.name} | ${data.exam.className} | ${data.exam.term} ${data.exam.year}`;
  ws.getCell(`A${r}`).font = { size: 11, color: { argb: "FF555555" } };
  ws.getCell(`A${r}`).alignment = center;
  r += 2;

  const headers = ["Subject", "Students", "Mean", "Highest", "Lowest", "Pass Rate%", "EE", "ME", "AE", "BE"];
  const hr = ws.getRow(r);
  hr.height = 26;
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h; c.font = hFont; c.fill = greenFill; c.alignment = center;
  });
  r++;

  for (const s of data.subjects) {
    const row = ws.getRow(r);
    row.height = 20;
    if ((r % 2) === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    row.getCell(1).value = s.subjectName;
    row.getCell(2).value = s.totalStudents; row.getCell(2).alignment = center;
    row.getCell(3).value = s.mean; row.getCell(3).alignment = center;
    row.getCell(4).value = s.highest; row.getCell(4).alignment = center;
    row.getCell(5).value = s.lowest; row.getCell(5).alignment = center;
    row.getCell(6).value = s.passRate; row.getCell(6).alignment = center;
    row.getCell(7).value = s.gradeDistribution.EE; row.getCell(7).alignment = center;
    row.getCell(7).font = { bold: true, color: { argb: "FF059669" } };
    row.getCell(8).value = s.gradeDistribution.ME; row.getCell(8).alignment = center;
    row.getCell(8).font = { bold: true, color: { argb: "FF2563EB" } };
    row.getCell(9).value = s.gradeDistribution.AE; row.getCell(9).alignment = center;
    row.getCell(9).font = { bold: true, color: { argb: "FFD97706" } };
    row.getCell(10).value = s.gradeDistribution.BE; row.getCell(10).alignment = center;
    row.getCell(10).font = { bold: true, color: { argb: "FFDC2626" } };
    r++;
  }

  // Top performers sheet
  const ws2 = wb.addWorksheet("Top Performers");
  ws2.columns = [{ width: 25 }, { width: 20 }, { width: 12 }];
  ws2.getRow(1).getCell(1).value = "Top Performers per Subject";
  ws2.getRow(1).getCell(1).font = { bold: true, size: 13, color: { argb: "FF166534" } };
  let r2 = 3;
  for (const s of data.subjects) {
    ws2.getRow(r2).getCell(1).value = s.subjectName;
    ws2.getRow(r2).getCell(1).font = { bold: true, size: 11 };
    r2++;
    const th = ws2.getRow(r2);
    ["Student", "Marks"].forEach((h, i) => { th.getCell(i + 1).value = h; th.getCell(i + 1).font = hFont; th.getCell(i + 1).fill = greenFill; });
    r2++;
    for (const st of s.topStudents.slice(0, 5)) {
      ws2.getRow(r2).getCell(1).value = st.name;
      ws2.getRow(r2).getCell(2).value = st.marks;
      ws2.getRow(r2).getCell(2).alignment = center;
      r2++;
    }
    r2++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// 2. CLASS COMPARISON
// ============================================================

interface ClassComparisonData {
  term: string; year: string;
  classes: Array<{
    className: string; overallAverage: number; totalExams: number;
    bestExam: { examName: string; avgMarks: number };
    weakExam: { examName: string; avgMarks: number };
  }>;
}

export function buildClassComparisonPDF(data: ClassComparisonData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    // A PDFKit error must reject the promise — otherwise the request hangs
    // forever (and an unhandled 'error' event can kill the Node process).
    doc.on("error", (err: Error) => reject(err));
    const W = doc.page.width - 80;

    let y = pdfHeader(doc, "Class Performance Comparison", `Generated: ${new Date().toLocaleDateString("en-KE")}`);
    y += 5;
    doc.fill(DARK).fontSize(10).font("Helvetica-Bold")
      .text(`Term: ${data.term}  |  Year: ${data.year}  |  Classes: ${data.classes.length}`, 40, y);
    y += 25;

    const colX = [40, 120, 260, 380, 480];
    const colW = [80, 140, 120, 100, W - 440];
    const rows = data.classes.map((c, i) => [
      `#${i + 1}`, c.className, c.overallAverage, c.bestExam.examName, c.weakExam.examName,
    ]);
    y = pdfTable(doc, y,
      ["Rank", "Class", "Overall Avg", "Best Exam", "Weakest Exam"],
      colX, colW, rows, { altFill: true }
    );

    // Class detail cards
    y += 15;
    doc.fill(GREEN).fontSize(10).font("Helvetica-Bold").text("Class Detail Cards", 40, y);
    y += 18;
    for (const c of data.classes) {
      if (y + 50 > 750) { doc.addPage(); y = 40; }
      doc.rect(40, y, W, 45).fill(LIGHT);
      doc.fill(DARK).fontSize(10).font("Helvetica-Bold").text(c.className, 50, y + 5);
      doc.fill(GREEN).fontSize(18).font("Helvetica-Bold").text(`${c.overallAverage}`, 50, y + 20);
      doc.fill(GRAY).fontSize(8).font("Helvetica").text("Overall Average", 110, y + 24);
      doc.fill(DARK).fontSize(8).text(`Exams: ${c.totalExams}`, 250, y + 8);
      doc.text(`Best: ${c.bestExam.examName} (${c.bestExam.avgMarks})`, 250, y + 20);
      doc.text(`Weakest: ${c.weakExam.examName} (${c.weakExam.avgMarks})`, 250, y + 32);
      y += 55;
    }

    y = Math.max(y + 10, 720);
    doc.fill(GRAY).fontSize(8).font("Helvetica")
      .text(`Nakoyonjo DEB Primary School  |  Class Comparison  |  ${new Date().toLocaleDateString("en-KE")}`, 40, y, { align: "center", width: W });
    doc.end();
  });
}

export async function buildClassComparisonExcel(data: ClassComparisonData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Class Comparison");
  ws.columns = [{ width: 8 }, { width: 20 }, { width: 16 }, { width: 12 }, { width: 25 }, { width: 12 }, { width: 25 }, { width: 12 }];
  const greenFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  const hFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  let r = 1;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = `${SCHOOL_NAME_UPPER} — Class Comparison`;
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: "FF166534" } };
  ws.getCell(`A${r}`).alignment = center;
  r++;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = `Term: ${data.term} | Year: ${data.year}`;
  ws.getCell(`A${r}`).font = { size: 11, color: { argb: "FF555555" } };
  ws.getCell(`A${r}`).alignment = center;
  r += 2;

  const headers = ["#", "Class", "Overall Avg", "Exams", "Best Exam", "Best Avg", "Weakest Exam", "Weakest Avg"];
  const hr = ws.getRow(r);
  hr.height = 26;
  headers.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = hFont; c.fill = greenFill; c.alignment = center; });
  r++;

  data.classes.forEach((c, i) => {
    const row = ws.getRow(r);
    row.height = 20;
    if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    row.getCell(1).value = i + 1; row.getCell(1).alignment = center;
    row.getCell(2).value = c.className;
    row.getCell(3).value = c.overallAverage; row.getCell(3).alignment = center;
    row.getCell(3).font = { bold: true, size: 11 };
    row.getCell(4).value = c.totalExams; row.getCell(4).alignment = center;
    row.getCell(5).value = c.bestExam.examName;
    row.getCell(6).value = c.bestExam.avgMarks; row.getCell(6).alignment = center;
    row.getCell(7).value = c.weakExam.examName;
    row.getCell(8).value = c.weakExam.avgMarks; row.getCell(8).alignment = center;
    r++;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// 3. GRADE DISTRIBUTION
// ============================================================

interface GradeDistData {
  exam: { name: string; term: string; year: string; className: string };
  subjects: Array<{
    subjectName: string; subjectCode: string;
    total: number; grades: { EE: number; ME: number; AE: number; BE: number };
    percentages: { EE: number; ME: number; AE: number; BE: number };
  }>;
  overall: { grades: { EE: number; ME: number; AE: number; BE: number }; total: number; percentages: { EE: number; ME: number; AE: number; BE: number } };
}

export function buildGradeDistributionPDF(data: GradeDistData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    // A PDFKit error must reject the promise — otherwise the request hangs
    // forever (and an unhandled 'error' event can kill the Node process).
    doc.on("error", (err: Error) => reject(err));
    const W = doc.page.width - 80;

    let y = pdfHeader(doc, "Grade Distribution Report", `Generated: ${new Date().toLocaleDateString("en-KE")}`);
    y += 5;
    doc.fill(DARK).fontSize(10).font("Helvetica-Bold")
      .text(`Exam: ${data.exam.name}  |  Class: ${data.exam.className}  |  ${data.exam.term} ${data.exam.year}`, 40, y);
    y += 25;

    // Overall summary
    doc.fill(GREEN).fontSize(10).font("Helvetica-Bold").text("Overall Summary", 40, y);
    y += 15;
    const o = data.overall;
    const sumW = W / 4;
    for (let i = 0; i < 4; i++) {
      const g = ["EE", "ME", "AE", "BE"][i];
      doc.rect(40 + i * sumW, y, sumW - 4, 40).fill(LIGHT);
      doc.fill(getGradeColor(g)).fontSize(20).font("Helvetica-Bold")
        .text(`${o.percentages[g]}%`, 40 + i * sumW, y + 3, { width: sumW - 4, align: "center" });
      doc.fill(GRAY).fontSize(7).font("Helvetica")
        .text(`${g} — ${o.grades[g]} entries`, 40 + i * sumW, y + 27, { width: sumW - 4, align: "center" });
    }
    y += 55;

    // Per-subject table
    const colX = [40, 230, 310, 350, 390, 430];
    const colW = [190, 80, 40, 40, 40, 40];
    const rows = data.subjects.map((s) => [
      s.subjectName, s.total,
      `${s.grades.EE} (${s.percentages.EE}%)`,
      `${s.grades.ME} (${s.percentages.ME}%)`,
      `${s.grades.AE} (${s.percentages.AE}%)`,
      `${s.grades.BE} (${s.percentages.BE}%)`,
    ]);
    y = pdfTable(doc, y,
      ["Subject", "Total", "EE", "ME", "AE", "BE"],
      colX, colW, rows, { altFill: true, gradeCols: [2, 3, 4, 5] }
    );

    y = Math.max(y + 10, 720);
    doc.fill(GRAY).fontSize(8).font("Helvetica")
      .text(`Nakoyonjo DEB Primary School  |  Grade Distribution  |  ${new Date().toLocaleDateString("en-KE")}`, 40, y, { align: "center", width: W });
    doc.end();
  });
}

export async function buildGradeDistributionExcel(data: GradeDistData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Grade Distribution");
  ws.columns = [{ width: 28 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  const greenFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  const hFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  let r = 1;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = `${SCHOOL_NAME_UPPER} — Grade Distribution`;
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: "FF166534" } };
  ws.getCell(`A${r}`).alignment = center;
  r++;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = `${data.exam.name} | ${data.exam.className} | ${data.exam.term} ${data.exam.year}`;
  ws.getCell(`A${r}`).font = { size: 11, color: { argb: "FF555555" } };
  ws.getCell(`A${r}`).alignment = center;
  r += 2;

  // Overall summary row
  const o = data.overall;
  ws.getRow(r).getCell(1).value = "OVERALL";
  ws.getRow(r).getCell(1).font = { bold: true, size: 11 };
  ws.getRow(r).getCell(2).value = o.total; ws.getRow(r).getCell(2).alignment = center;
  const grades = ["EE", "ME", "AE", "BE"];
  const gradeColors: Record<string, string> = { EE: "FF059669", ME: "FF2563EB", AE: "FFD97706", BE: "FFDC2626" };
  grades.forEach((g, i) => {
    const c = ws.getRow(r).getCell(3 + i);
    c.value = `${o.grades[g]} (${o.percentages[g]}%)`;
    c.alignment = center;
    c.font = { bold: true, color: { argb: gradeColors[g] } };
  });
  r += 2;

  // Per-subject
  const headers = ["Subject", "Total", "EE", "EE%", "ME", "ME%", "AE", "AE%", "BE", "BE%"];
  // Need more columns
  ws.columns = [{ width: 28 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }];
  const hr = ws.getRow(r);
  hr.height = 26;
  headers.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = hFont; c.fill = greenFill; c.alignment = center; });
  r++;

  for (const s of data.subjects) {
    const row = ws.getRow(r);
    row.height = 20;
    if ((r % 2) === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    row.getCell(1).value = s.subjectName;
    row.getCell(2).value = s.total; row.getCell(2).alignment = center;
    row.getCell(3).value = s.grades.EE; row.getCell(3).alignment = center; row.getCell(3).font = { bold: true, color: { argb: gradeColors.EE } };
    row.getCell(4).value = `${s.percentages.EE}%`; row.getCell(4).alignment = center;
    row.getCell(5).value = s.grades.ME; row.getCell(5).alignment = center; row.getCell(5).font = { bold: true, color: { argb: gradeColors.ME } };
    row.getCell(6).value = `${s.percentages.ME}%`; row.getCell(6).alignment = center;
    row.getCell(7).value = s.grades.AE; row.getCell(7).alignment = center; row.getCell(7).font = { bold: true, color: { argb: gradeColors.AE } };
    row.getCell(8).value = `${s.percentages.AE}%`; row.getCell(8).alignment = center;
    row.getCell(9).value = s.grades.BE; row.getCell(9).alignment = center; row.getCell(9).font = { bold: true, color: { argb: gradeColors.BE } };
    row.getCell(10).value = `${s.percentages.BE}%`; row.getCell(10).alignment = center;
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// 4. STUDENT TRENDS
// ============================================================

interface StudentTrendData {
  student: { name: string; className: string };
  exams: Array<{
    examName: string; term: string; year: number;
    totalMarks: number; averageMarks: number; totalSubjects: number;
    gradeCounts: { EE: number; ME: number; AE: number; BE: number };
    subjects: Array<{ subjectName: string; subjectCode: string; marks: number; grade: string }>;
  }>;
  overallTrend: Array<{ examName: string; averageMarks: number; totalMarks: number }>;
}

export function buildStudentTrendPDF(data: StudentTrendData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    // A PDFKit error must reject the promise — otherwise the request hangs
    // forever (and an unhandled 'error' event can kill the Node process).
    doc.on("error", (err: Error) => reject(err));
    const W = doc.page.width - 80;

    let y = pdfHeader(doc, "Student Performance Trends", `Generated: ${new Date().toLocaleDateString("en-KE")}`);
    y += 5;
    doc.fill(DARK).fontSize(10).font("Helvetica-Bold")
      .text(`Student: ${data.student.name}  |  Class: ${data.student.className}`, 40, y);
    y += 25;

    if (data.exams.length === 0) {
      doc.fill(GRAY).fontSize(11).font("Helvetica").text("No exam data available for this student.", 40, y);
      doc.end(); return;
    }

    // Exam summary table
    const colX = [40, 160, 230, 310, 380, 420, 455, 490];
    const colW = [120, 70, 80, 70, 40, 35, 35, 35];
    const rows = data.exams.map((e) => [
      e.examName, `${e.term} ${e.year}`, e.totalSubjects, e.totalMarks, e.averageMarks,
      e.gradeCounts.EE, e.gradeCounts.ME, e.gradeCounts.AE,
    ]);
    y = pdfTable(doc, y,
      ["Exam", "Term/Year", "Subjects", "Total", "Average", "EE", "ME", "AE"],
      colX, colW, rows, { altFill: true, gradeCols: [5, 6, 7] }
    );

    // Per-subject detail
    y += 20;
    doc.fill(GREEN).fontSize(10).font("Helvetica-Bold").text("Subject Marks Detail", 40, y);
    y += 15;

    // Get all subject codes
    const allSubjects: Array<{ code: string; name: string; marks: Array<{ exam: string; marks: number; grade: string }> }> = [];
    const subMap: Record<string, { code: string; name: string; marks: Array<{ exam: string; marks: number; grade: string }> }> = {};
    for (const e of data.exams) {
      for (const s of e.subjects) {
        if (!subMap[s.subjectCode]) subMap[s.subjectCode] = { code: s.subjectCode, name: s.subjectName, marks: [] };
        subMap[s.subjectCode].marks.push({ exam: e.examName, marks: s.marks, grade: s.grade });
      }
    }
    Object.values(subMap).forEach((s) => allSubjects.push(s));

    for (const sub of allSubjects) {
      if (y + 30 + sub.marks.length * 16 > 750) { doc.addPage(); y = 40; }
      doc.fill(DARK).fontSize(9).font("Helvetica-Bold").text(sub.name, 40, y);
      y += 14;
      for (const m of sub.marks) {
        doc.fill(GRAY).fontSize(8).font("Helvetica").text(`${m.exam}:`, 50, y);
        const mc = m.marks >= 50 ? "#059669" : "#DC2626";
        doc.fill(mc).font("Helvetica-Bold").text(`${m.marks}`, 180, y);
        doc.fill(getGradeColor(m.grade)).text(m.grade, 220, y);
        y += 14;
      }
      y += 8;
    }

    y = Math.max(y + 10, 720);
    doc.fill(GRAY).fontSize(8).font("Helvetica")
      .text(`Nakoyonjo DEB Primary School  |  Student Trends  |  ${new Date().toLocaleDateString("en-KE")}`, 40, y, { align: "center", width: W });
    doc.end();
  });
}

export async function buildStudentTrendExcel(data: StudentTrendData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const greenFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  const hFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  // Sheet 1: Exam Summary
  const ws = wb.addWorksheet("Exam Summary");
  ws.columns = [{ width: 22 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }];
  let r = 1;
  ws.mergeCells(`A${r}:I${r}`);
  ws.getCell(`A${r}`).value = `Student Performance Trends — ${data.student.name}`;
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: "FF166534" } };
  ws.getCell(`A${r}`).alignment = center;
  r++;
  ws.mergeCells(`A${r}:I${r}`);
  ws.getCell(`A${r}`).value = `Class: ${data.student.className}`;
  ws.getCell(`A${r}`).font = { size: 11, color: { argb: "FF555555" } };
  ws.getCell(`A${r}`).alignment = center;
  r += 2;

  const headers = ["Exam", "Term", "Year", "Subjects", "Total", "Average", "EE", "ME", "AE", "BE"];
  ws.columns = [{ width: 22 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }];
  const hr = ws.getRow(r);
  hr.height = 26;
  headers.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = hFont; c.fill = greenFill; c.alignment = center; });
  r++;

  const gradeColors: Record<string, string> = { EE: "FF059669", ME: "FF2563EB", AE: "FFD97706", BE: "FFDC2626" };
  for (const e of data.exams) {
    const row = ws.getRow(r);
    row.height = 20;
    row.getCell(1).value = e.examName;
    row.getCell(2).value = e.term; row.getCell(2).alignment = center;
    row.getCell(3).value = e.year; row.getCell(3).alignment = center;
    row.getCell(4).value = e.totalSubjects; row.getCell(4).alignment = center;
    row.getCell(5).value = e.totalMarks; row.getCell(5).alignment = center; row.getCell(5).font = { bold: true };
    row.getCell(6).value = e.averageMarks; row.getCell(6).alignment = center; row.getCell(6).font = { bold: true };
    row.getCell(7).value = e.gradeCounts.EE; row.getCell(7).alignment = center; row.getCell(7).font = { bold: true, color: { argb: gradeColors.EE } };
    row.getCell(8).value = e.gradeCounts.ME; row.getCell(8).alignment = center; row.getCell(8).font = { bold: true, color: { argb: gradeColors.ME } };
    row.getCell(9).value = e.gradeCounts.AE; row.getCell(9).alignment = center; row.getCell(9).font = { bold: true, color: { argb: gradeColors.AE } };
    row.getCell(10).value = e.gradeCounts.BE; row.getCell(10).alignment = center; row.getCell(10).font = { bold: true, color: { argb: gradeColors.BE } };
    r++;
  }

  // Sheet 2: Subject marks matrix
  if (data.exams.length > 0) {
    const ws2 = wb.addWorksheet("Subject Marks");
    const subMap: Record<string, { name: string; code: string }> = {};
    for (const e of data.exams) for (const s of e.subjects) {
      if (!subMap[s.subjectCode]) subMap[s.subjectCode] = { name: s.subjectName, code: s.subjectCode };
    }
    const subjects = Object.values(subMap);
    const cols = [{ width: 22 }]; // Exam name
    subjects.forEach(() => cols.push({ width: 14 }));
    ws2.columns = cols;

    ws2.getRow(1).getCell(1).value = "Marks by Subject";
    ws2.getRow(1).getCell(1).font = { bold: true, size: 13, color: { argb: "FF166534" } };
    r = 3;
    const hdr = ws2.getRow(r);
    hdr.getCell(1).value = "Exam"; hdr.getCell(1).font = hFont; hdr.getCell(1).fill = greenFill; hdr.getCell(1).alignment = center;
    subjects.forEach((s, i) => {
      const c = hdr.getCell(2 + i);
      c.value = `${s.code}`; c.font = hFont; c.fill = greenFill; c.alignment = center;
    });
    r++;

    for (const e of data.exams) {
      const row = ws2.getRow(r);
      row.getCell(1).value = e.examName;
      for (const s of e.subjects) {
        const idx = subjects.findIndex((sub) => sub.code === s.subjectCode);
        if (idx >= 0) {
          const c = row.getCell(2 + idx);
          c.value = `${s.marks} (${s.grade})`;
          c.alignment = center;
          c.font = { color: { argb: gradeColors[s.grade] || "FF000000" } };
        }
      }
      r++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}