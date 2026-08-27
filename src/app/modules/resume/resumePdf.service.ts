import PDFDocument from "pdfkit";
import { IResumeJson } from "./resume.types";

const ACCENT = "#2563eb";
const TEXT = "#1f2937";
const MUTED = "#6b7280";

const sectionTitle = (doc: PDFKit.PDFDocument, label: string) => {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text(label.toUpperCase());
  const y = doc.y + 2;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.7)
    .strokeColor(ACCENT)
    .stroke();
  doc.moveDown(0.4);
};

const drawBullets = (doc: PDFKit.PDFDocument, bullets: string[]) => {
  for (const bullet of bullets) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEXT)
      .text(`•  ${bullet}`, { indent: 8, lineGap: 2 });
  }
};

const drawHeader = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  doc.font("Helvetica-Bold").fontSize(22).fillColor(TEXT).text(resume.name);
  if (resume.title) {
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(ACCENT).text(resume.title);
  }
  if (resume.contact.length > 0) {
    doc.moveDown(0.25);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(resume.contact.join("   |   "));
  }
  doc.moveDown(0.6);
};

const drawSummary = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (!resume.summary) {
    return;
  }
  sectionTitle(doc, "Summary");
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(resume.summary, {
    lineGap: 2,
  });
};

const drawSkills = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (resume.skills.length === 0) {
    return;
  }
  sectionTitle(doc, "Skills");
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(TEXT)
    .text(resume.skills.join("  •  "), { lineGap: 2 });
};

const drawExperience = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (resume.experience.length === 0) {
    return;
  }
  sectionTitle(doc, "Experience");
  for (const item of resume.experience) {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEXT).text(item.role);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`${item.company}${item.period ? "   ·   " + item.period : ""}`);
    drawBullets(doc, item.bullets);
    doc.moveDown(0.45);
  }
};

const drawProjects = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (resume.projects.length === 0) {
    return;
  }
  sectionTitle(doc, "Projects");
  for (const project of resume.projects) {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEXT).text(project.name);
    if (project.description) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT)
        .text(project.description, { lineGap: 2 });
    }
    drawBullets(doc, project.bullets);
    doc.moveDown(0.45);
  }
};

const drawEducation = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (resume.education.length === 0) {
    return;
  }
  sectionTitle(doc, "Education");
  for (const item of resume.education) {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEXT).text(item.degree);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        `${item.institution}${item.period ? "   ·   " + item.period : ""}`,
      );
    doc.moveDown(0.35);
  }
};

const drawCertifications = (doc: PDFKit.PDFDocument, resume: IResumeJson) => {
  if (resume.certifications.length === 0) {
    return;
  }
  sectionTitle(doc, "Certifications");
  drawBullets(doc, resume.certifications);
};

const render = (resume: IResumeJson): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 52, right: 52 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, resume);
    drawSummary(doc, resume);
    drawSkills(doc, resume);
    drawExperience(doc, resume);
    drawProjects(doc, resume);
    drawEducation(doc, resume);
    drawCertifications(doc, resume);

    doc.end();
  });
};

export const ResumePdfServices = { render };
