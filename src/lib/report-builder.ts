// Shared report card builder utilities for PDF and Excel generation
// Used by: /api/report-pdf, /api/report-pdf/all, /api/report-excel, /api/report-excel/all

import PDFDocument from "pdfkit";
import * as ExcelJS from "exceljs";

// ============================================================
// TYPES
// ============================================================

export interface ReportMark {
  subject: string;
  code: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
  remarks: string | null;
}

export interface ReportSummary {
  totalMarks: number;
  maxTotal: number;
  totalPoints: number;
  maxPoints: number;
  average: string;
  grade: string;
  rank: number;
  totalStudents: number;
}

export interface ReportData {
  student: {
    id?: string;
    firstName: string;
    lastName: string;
    gender: string;
  };
  class: { name: string };
  exam: {
    name: string;
    term: string;
    year: string;
    maxMarks: number;
  };
  classTeacher: string;
  headTeacher?: string;
  classTeacherRemark?: string;
  /** School identity from Settings — printed on every report card. */
  school?: {
    schoolName: string;
    schoolMotto: string;
    schoolAddress: string;
    schoolPhone: string;
  };
  /** Term calendar range from Settings, e.g. "06 Jan 2026 – 04 Apr 2026". */
  termRange?: string;
  marks: ReportMark[];
  summary: ReportSummary;
  classRanking?: {
    studentId: string;
    firstName: string;
    lastName: string;
    totalMarks: number;
    totalPoints: number;
    average: string;
    grade: string;
    rank: number;
  }[];
  maxTotal?: number;
  maxPoints?: number;
}

// ============================================================
// PDF BUILDER
// ============================================================

/**
 * Builds a single-student PDF report card buffer.
 * Layout: marks + grade per subject, ranking by performance, overall grade + position.
 */
// Helper: grade color for PDF (works with 4-level and 8-level CBC grades)
function gradeColor(grade: string): string {
  if (grade.startsWith("EE")) return "#059669";
  if (grade.startsWith("ME")) return "#2563eb";
  if (grade.startsWith("AE")) return "#d97706";
  return "#dc2626";
}

export function buildReportPDF(report: ReportData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    // A PDFKit error must reject the promise — otherwise the request hangs
    // forever (and an unhandled 'error' event can kill the Node process).
    doc.on("error", (err: Error) => reject(err));

    const W = doc.page.width - 80; // usable width
    const green = "#166534";
    const darkGray = "#1a1a1a";
    const gray = "#666666";
    const lightGray = "#f3f4f6";

    // School identity from Settings (falls back to the built-in name)
    const schoolName = report.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL";
    const schoolMotto = report.school?.schoolMotto || "";
    const contactBits = [
      report.school?.schoolAddress || "Bungoma, Kenya",
      report.school?.schoolPhone ? `Tel: ${report.school.schoolPhone}` : "",
    ].filter(Boolean).join("  |  ");

    // ---- HEADER ----
    doc.rect(0, 0, doc.page.width, 90).fill(green);
    doc.fill("white").fontSize(20).font("Helvetica-Bold")
      .text(schoolName.toUpperCase(), 40, 25, { align: "center", width: W });
    doc.fontSize(10).font("Helvetica-Oblique")
      .text(schoolMotto || "Student Report Card", 40, 52, { align: "center", width: W });
    doc.fontSize(8).font("Helvetica")
      .text(`Student Report Card  |  ${contactBits}`, 40, 68, { align: "center", width: W });
    doc.moveDown(0.5);

    // ---- STUDENT INFO ----
    let y = 105;
    doc.rect(40, y - 5, W, 55).fill(lightGray);
    doc.fill(darkGray).fontSize(10).font("Helvetica");
    const left = 50, right = 40 + W / 2 + 10;
    doc.text(`Name: `, left, y + 2, { continued: true }).font("Helvetica-Bold").text(`${report.student.firstName} ${report.student.lastName}`);
    doc.font("Helvetica").text(`Class: `, left, y + 18, { continued: true }).font("Helvetica-Bold").text(report.class.name);
    doc.font("Helvetica").text(`Gender: `, right, y + 18, { continued: true }).font("Helvetica-Bold").text(report.student.gender);
    doc.font("Helvetica").text(`Exam: `, left, y + 34, { continued: true }).font("Helvetica-Bold").text(`${report.exam.name} (${report.exam.term}, ${report.exam.year})${report.termRange ? ` — ${report.termRange}` : ""}`);
    doc.font("Helvetica").text(`Class Teacher: `, right, y + 34, { continued: true }).font("Helvetica-Bold").text(report.classTeacher || "");

    // ---- MARKS TABLE (Subject, Code, Marks, Grade) ----
    y = 180;
    const colX = [40, 200, 275, 370, 440]; // Subject, Code, Marks, Grade
    const colW = [160, 75, 95, 70, W - 400];
    const rowH = 22;
    const headers = ["Subject", "Code", "Marks", "Grade"];

    // Header row
    doc.rect(40, y, W, rowH).fill(green);
    doc.fill("white").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => doc.text(h, colX[i] + 5, y + 6, { width: colW[i] - 10 }));
    y += rowH;

    // Data rows
    report.marks.forEach((m, idx) => {
      if (y > 680) { doc.addPage(); y = 40; }
      if (idx % 2 === 1) doc.rect(40, y, W, rowH).fill("#f9fafb");
      doc.fill(darkGray).fontSize(9);
      doc.font("Helvetica").text(m.subject, colX[0] + 5, y + 6, { width: colW[0] - 10 });
      doc.fill(gray).text(m.code, colX[1] + 5, y + 6, { width: colW[1] - 10, align: "center" });
      doc.fill(darkGray).font("Helvetica-Bold").text(`${m.marksObtained} / ${m.maxMarks}`, colX[2] + 5, y + 6, { width: colW[2] - 10, align: "center" });
      // Grade with color (supports 4-level and 8-level CBC grades)
      doc.fill(gradeColor(m.grade)).font("Helvetica-Bold").text(m.grade, colX[3] + 5, y + 6, { width: colW[3] - 10, align: "center" });
      y += rowH;
    });

    // ---- SUMMARY (Total, Average, Grade, Position) ----
    y += 10;
    doc.moveTo(40, y).lineTo(40 + W, y).strokeColor(green).lineWidth(2).stroke();
    y += 15;

    const sumCount = 5;
    const sumW = W / sumCount;
    const summaryItems = [
      { label: "Total Marks", value: `${report.summary.totalMarks} / ${report.summary.maxTotal}`, color: green, big: false },
      { label: "Points", value: `${report.summary.totalPoints} / ${report.summary.maxPoints}`, color: "#7c3aed", big: false },
      { label: "Average", value: report.summary.average, color: green, big: false },
      { label: "Grade", value: report.summary.grade, color: gradeColor(report.summary.grade), big: true },
      { label: "Position", value: `${report.summary.rank} / ${report.summary.totalStudents}`, color: green, big: false },
    ];

    summaryItems.forEach((item, i) => {
      doc.fill(gray).fontSize(7).font("Helvetica").text(item.label, 40 + i * sumW, y, { width: sumW, align: "center" });
      doc.fill(item.color).fontSize(item.big ? 24 : 18).font("Helvetica-Bold").text(item.value, 40 + i * sumW, y + 13, { width: sumW, align: "center" });
    });

    // ---- CLASS TEACHER REMARK ----
    if (report.classTeacherRemark) {
      y += 10;
      doc.fill(gray).fontSize(9).font("Helvetica").text("Class Teacher Remark:", 40, y);
      y += 14;
      doc.fill(darkGray).fontSize(10).font("Helvetica-Oblique")
        .text(`"${report.classTeacherRemark}"`, 45, y, { width: W - 10, align: "left" });
    }

    // ---- CLASS RANKING TABLE (by performance, with grade column) ----
    if (report.classRanking && report.classRanking.length > 0 && report.maxTotal) {
      y += 5;
      const neededHeight = 40 + report.classRanking.length * 18;
      if (y + neededHeight > 680) { doc.addPage(); y = 40; }

      doc.fill("#166534").fontSize(10).font("Helvetica-Bold")
        .text("Class Ranking", 40, y);
      doc.moveTo(40, y + 13).lineTo(40 + W, y + 13).strokeColor("#d97706").lineWidth(1.5).stroke();
      y += 20;

      // Table header: #, Student, Points, Total Marks, Average, Grade
      const rankColX = [40, 60, 180, 240, 360, 430, 485];
      const rankColW = [20, 120, 60, 120, 70, 55, W - 485];
      const rankHeaders = ["#", "Student", "Pts", "Total Marks", "Average", "Grade"];

      doc.rect(40, y, W, 16).fill("#166534");
      doc.fill("white").fontSize(7).font("Helvetica-Bold");
      rankHeaders.forEach((h, i) => doc.text(h, rankColX[i] + 3, y + 4, { width: rankColW[i] - 6 }));
      y += 16;

      // Table rows (already sorted by points from buildReportData)
      report.classRanking.forEach((r, idx) => {
        const isCurrent = report.student.id && r.studentId === report.student.id;

        if (isCurrent) {
          doc.rect(40, y, W, 15).fill("#eff6ff");
        } else if (idx % 2 === 1) {
          doc.rect(40, y, W, 15).fill("#f9fafb");
        }

        doc.fill(darkGray).fontSize(7);
        const isTop3 = r.rank <= 3;
        doc.font(isTop3 ? "Helvetica-Bold" : "Helvetica")
          .text(String(r.rank), rankColX[0] + 3, y + 4, { width: rankColW[0] - 6, align: "center" });
        doc.font(isCurrent ? "Helvetica-Bold" : "Helvetica")
          .text(`${isCurrent ? "\u25B6 " : ""}${r.lastName}, ${r.firstName}`, rankColX[1] + 3, y + 4, { width: rankColW[1] - 6 });
        doc.font("Helvetica-Bold").text(String(r.totalPoints), rankColX[2] + 3, y + 4, { width: rankColW[2] - 6, align: "center" });
        doc.font("Helvetica").text(`${r.totalMarks} / ${report.maxTotal}`, rankColX[3] + 3, y + 4, { width: rankColW[3] - 6, align: "center" });
        doc.text(r.average, rankColX[4] + 3, y + 4, { width: rankColW[4] - 6, align: "center" });
        // Grade with color (supports 8-level CBC grades)
        doc.fill(gradeColor(r.grade)).font("Helvetica-Bold").text(r.grade, rankColX[5] + 3, y + 4, { width: rankColW[5] - 6, align: "center" });

        y += 15;
      });
    }

    // ---- SIGNATURES ----
    y = Math.max(y + 10, 690);
    doc.strokeColor("#cccccc").lineWidth(0.5);
    doc.moveTo(40, y).lineTo(220, y).stroke();
    doc.moveTo(40 + W - 180, y).lineTo(40 + W, y).stroke();
    doc.fill(gray).fontSize(9).font("Helvetica");
    doc.text("Class Teacher", 40, y + 5, { width: 180, align: "center" });
    const headTeacherLabel = report.headTeacher ? `Head Teacher: ${report.headTeacher}` : "Head Teacher";
    doc.text(headTeacherLabel, 40 + W - 180, y + 5, { width: 180, align: "center" });
    doc.text(`Date: ${new Date().toLocaleDateString("en-KE")}`, 40 + W / 2 - 60, y + 5, { width: 120, align: "center" });

    doc.end();
  });
}

// ============================================================
// EXCEL BUILDER (Single Student)
// ============================================================

/**
 * Builds a single-student Excel report card.
 * Shows marks + grade per subject, overall grade + position.
 */
export async function buildReportExcel(report: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Report Card", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });

  // Helper: grade color for Excel (works with 4-level and 8-level CBC grades)
  const excelGradeColor = (grade: string) => {
    if (grade.startsWith("EE")) return "FF059669";
    if (grade.startsWith("ME")) return "FF2563EB";
    if (grade.startsWith("AE")) return "FFD97706";
    return "FFDC2626";
  };

  // Column widths: Subject, Code, Marks, Grade
  ws.columns = [
    { width: 30 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
  ];

  const greenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
   const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 16, color: { argb: "FF166534" } };
  const subtitleFont: Partial<ExcelJS.Font> = { size: 11, color: { argb: "FF555555" } };
  const valueFont: Partial<ExcelJS.Font> = { bold: true, size: 10 };
  const marksFont: Partial<ExcelJS.Font> = { bold: true, size: 11 };
  const summaryLabelFont: Partial<ExcelJS.Font> = { size: 10, color: { argb: "FF666666" } };
  const summaryValueFont: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: "FF166534" } };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
  const thinBorder: Partial<ExcelJS.Border> = {
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  };

  let row = 1;

  // ---- SCHOOL HEADER (from Settings) ----
  const excelSchoolName = (report.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL").toUpperCase();
  const excelContact = [
    report.school?.schoolAddress || "Bungoma, Kenya",
    report.school?.schoolPhone ? `Tel: ${report.school.schoolPhone}` : "",
  ].filter(Boolean).join("  |  ");

  ws.mergeCells(`A${row}:C${row}`);
  const titleCell = ws.getCell(`A${row}`);
  titleCell.value = excelSchoolName;
  titleCell.font = titleFont;
  titleCell.alignment = center;
  row++;

  if (report.school?.schoolMotto) {
    ws.mergeCells(`A${row}:C${row}`);
    const mottoCell = ws.getCell(`A${row}`);
    mottoCell.value = report.school.schoolMotto;
    mottoCell.font = { ...subtitleFont, italic: true };
    mottoCell.alignment = center;
    row++;
  }

  ws.mergeCells(`A${row}:C${row}`);
  const subCell = ws.getCell(`A${row}`);
  subCell.value = `Student Report Card  |  ${excelContact}`;
  subCell.font = subtitleFont;
  subCell.alignment = center;
  row += 2;

  // ---- STUDENT INFO ----
  const infoPairs = [
    ["Name:", `${report.student.firstName} ${report.student.lastName}`],
    ["Class:", report.class.name],
    ["Gender:", report.student.gender],
    ["Exam:", `${report.exam.name} (${report.exam.term}, ${report.exam.year})${report.termRange ? ` — ${report.termRange}` : ""}`],
    ["Class Teacher:", report.classTeacher || ""],
  ];

  for (let i = 0; i < infoPairs.length; i += 2) {
    const lCell = ws.getCell(`A${row}`);
    lCell.value = `${infoPairs[i][0]} ${infoPairs[i][1]}`;
    lCell.font = valueFont;
    if (i + 1 < infoPairs.length) {
      const rCell = ws.getCell(`C${row}`);
      rCell.value = `${infoPairs[i + 1][0]} ${infoPairs[i + 1][1]}`;
      rCell.font = valueFont;
    }
    row++;
  }

  row++;

  // ---- MARKS TABLE HEADER ----
  const headers = ["Subject", "Code", "Marks", "Grade"];
  const headerRow = ws.getRow(row);
  headerRow.height = 28;
  headerRow.fill = greenFill;
  headers.forEach((h, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.alignment = center;
    cell.fill = greenFill;
  });
  row++;

  // ---- MARKS DATA ROWS ----
  report.marks.forEach((m, idx) => {
    const dataRow = ws.getRow(row);
    dataRow.height = 22;
    if (idx % 2 === 1) {
      dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }

    const subjCell = dataRow.getCell(1);
    subjCell.value = m.subject;
    subjCell.font = { size: 10 };

    const codeCell = dataRow.getCell(2);
    codeCell.value = m.code;
    codeCell.font = { size: 10, color: { argb: "FF666666" } };
    codeCell.alignment = center;

    const marksCell = dataRow.getCell(3);
    marksCell.value = `${m.marksObtained} / ${m.maxMarks}`;
    marksCell.font = marksFont;
    marksCell.alignment = center;

    // Grade cell with color (supports 8-level CBC grades)
    const gradeCell = dataRow.getCell(4);
    gradeCell.value = m.grade;
    gradeCell.font = {
      bold: true,
      size: 11,
      color: { argb: excelGradeColor(m.grade) },
    };
    gradeCell.alignment = center;

    dataRow.eachCell((cell) => { cell.border = thinBorder; });
    row++;
  });

  row++;

  // ---- SUMMARY (Total, Points, Average, Grade, Position) ----
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "Total Marks";
  ws.getCell(`A${row}`).font = summaryLabelFont;
  ws.getCell(`A${row}`).alignment = center;
  ws.getCell(`C${row}`).value = `${report.summary.totalMarks} / ${report.summary.maxTotal}`;
  ws.getCell(`C${row}`).font = summaryValueFont;
  ws.getCell(`C${row}`).alignment = center;
  row++;

  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "Total Points";
  ws.getCell(`A${row}`).font = summaryLabelFont;
  ws.getCell(`A${row}`).alignment = center;
  ws.getCell(`C${row}`).value = `${report.summary.totalPoints} / ${report.summary.maxPoints}`;
  ws.getCell(`C${row}`).font = { bold: true, size: 14, color: { argb: "FF7C3AED" } };
  ws.getCell(`C${row}`).alignment = center;
  row++;

  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "Average";
  ws.getCell(`A${row}`).font = summaryLabelFont;
  ws.getCell(`A${row}`).alignment = center;
  ws.getCell(`C${row}`).value = report.summary.average;
  ws.getCell(`C${row}`).font = summaryValueFont;
  ws.getCell(`C${row}`).alignment = center;
  row++;

  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "Grade";
  ws.getCell(`A${row}`).font = summaryLabelFont;
  ws.getCell(`A${row}`).alignment = center;
  const gradeSummaryCell = ws.getCell(`C${row}`);
  gradeSummaryCell.value = report.summary.grade;
  gradeSummaryCell.font = {
    bold: true,
    size: 14,
    color: { argb: excelGradeColor(report.summary.grade) },
  };
  gradeSummaryCell.alignment = center;
  row++;

  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "Position";
  ws.getCell(`A${row}`).font = summaryLabelFont;
  ws.getCell(`A${row}`).alignment = center;
  ws.getCell(`C${row}`).value = `${report.summary.rank} / ${report.summary.totalStudents}`;
  ws.getCell(`C${row}`).font = summaryValueFont;
  ws.getCell(`C${row}`).alignment = center;

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================================
// MULTI-STUDENT EXCEL (Class Marksheet)
// ============================================================

export interface MultiStudentData {
  className: string;
  examName: string;
  term: string;
  year: string;
  maxMarks: number;
  /** School name from Settings (title row of the marksheet). */
  schoolName?: string;
  /** Term calendar range from Settings, e.g. "06 Jan 2026 – 04 Apr 2026". */
  termRange?: string;
  students: {
    firstName: string;
    lastName: string;
    gender: string;
    marks: ReportMark[];
    summary: ReportSummary;
  }[];
  subjects: { name: string; code: string }[];
}

/**
 * Builds a class-wide Excel marksheet.
 * Shows marks + ranking + overall grade, students ordered by rank (performance).
 */
export async function buildClassMarksheetExcel(data: MultiStudentData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`${data.className} - ${data.examName}`, {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });

  const greenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } } as const;
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: "FF166534" } };
  const bodyFont: Partial<ExcelJS.Font> = { size: 10 };
  const boldFont: Partial<ExcelJS.Font> = { bold: true, size: 10 };
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  // Helper: grade color for class marksheet (works with 4-level and 8-level CBC grades)
  const clsGradeColor = (grade: string) => {
    if (grade.startsWith("EE")) return "FF059669";
    if (grade.startsWith("ME")) return "FF2563EB";
    if (grade.startsWith("AE")) return "FFD97706";
    return "FFDC2626";
  };

  // Sort students by rank (by points, default), then by name for ties
  const sortedStudents = [...data.students].sort((a, b) => {
    if (a.summary.rank !== b.summary.rank) return a.summary.rank - b.summary.rank;
    return a.lastName.localeCompare(b.lastName);
  });

  // Columns: Rank, Name, Gender, then each subject (1 col: Marks), then Points, Total, Average, Grade
  const colCount = 3 + data.subjects.length + 4;
  const columns: Partial<ExcelJS.Column>[] = [
    { width: 6 },   // Rank
    { width: 25 },  // Name
    { width: 8 },   // Gender
  ];

  // For each subject: just Marks
  data.subjects.forEach(() => {
    columns.push({ width: 10 });
  });

  // Summary columns
  columns.push(
    { width: 8 },  // Points
    { width: 12 }, // Total
    { width: 8 },  // Average
    { width: 8 },  // Grade
  );

  ws.columns = columns;

  let row = 1;

  // Title
  ws.mergeCells(`A${row}:${String.fromCharCode(64 + colCount)}${row}`);
  const titleCell = ws.getCell(`A${row}`);
  titleCell.value = `${(data.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL").toUpperCase()} - ${data.className} - ${data.examName} (${data.term}, ${data.year})${data.termRange ? ` — ${data.termRange}` : ""}`;
  titleCell.font = titleFont;
  titleCell.alignment = center;
  row += 2;

  // Header row 1: Subject names (1 col each)
  const fixedHeaders = ["Rank", "Student Name", "Gender"];
  fixedHeaders.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = greenFill;
    cell.alignment = center;
  });

  const summaryHeaders = ["Points", "Total", "Average", "Grade"];
  data.subjects.forEach((s, sIdx) => {
    const cell = ws.getRow(row).getCell(4 + sIdx);
    cell.value = `${s.code}: ${s.name}`;
    cell.font = headerFont;
    cell.fill = greenFill;
    cell.alignment = center;
  });

  const summStartCol = 4 + data.subjects.length;
  summaryHeaders.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(summStartCol + i);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = greenFill;
    cell.alignment = center;
  });
  row++;

  // No sub-header row needed — each subject is a single column
  row++;

  // Data rows
  sortedStudents.forEach((student, sIdx) => {
    const dataRow = ws.getRow(row);
    dataRow.height = 20;

    if (sIdx % 2 === 1) {
      dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }

    // Rank
    const rankCell = dataRow.getCell(1);
    rankCell.value = student.summary.rank;
    rankCell.font = boldFont;
    rankCell.alignment = center;

    // Name
    const nameCell = dataRow.getCell(2);
    nameCell.value = `${student.lastName}, ${student.firstName}`;
    nameCell.font = boldFont;

    // Gender
    const genderCell = dataRow.getCell(3);
    genderCell.value = student.gender;
    genderCell.font = bodyFont;
    genderCell.alignment = center;

    // Build a lookup for marks by subject code
    const marksByCode: Record<string, ReportMark> = {};
    student.marks.forEach((m) => { marksByCode[m.code] = m; });

    // Subject marks (1 column per subject)
    data.subjects.forEach((subj, sIdx) => {
      const m = marksByCode[subj.code];
      const mCell = dataRow.getCell(4 + sIdx);
      mCell.value = m ? `${m.marksObtained}/${m.maxMarks}` : "—";
      mCell.font = bodyFont;
      mCell.alignment = center;
    });

    // Points
    const ptsCell = dataRow.getCell(summStartCol);
    ptsCell.value = `${student.summary.totalPoints}/${student.summary.maxPoints}`;
    ptsCell.font = { bold: true, size: 10, color: { argb: "FF7C3AED" } };
    ptsCell.alignment = center;

    // Total
    const totalCell = dataRow.getCell(summStartCol + 1);
    totalCell.value = `${student.summary.totalMarks}/${student.summary.maxTotal}`;
    totalCell.font = boldFont;
    totalCell.alignment = center;

    // Average
    const avgCell = dataRow.getCell(summStartCol + 2);
    avgCell.value = student.summary.average;
    avgCell.font = boldFont;
    avgCell.alignment = center;

    // Overall Grade with color (supports 8-level CBC grades)
    const gradeCell = dataRow.getCell(summStartCol + 3);
    gradeCell.value = student.summary.grade;
    gradeCell.font = {
      bold: true,
      size: 10,
      color: { argb: clsGradeColor(student.summary.grade) },
    };
    gradeCell.alignment = center;

    row++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
} 