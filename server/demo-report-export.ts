import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { storage } from "./storage";

const FONT_DIR = path.join(process.cwd(), "server", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Pretendard-Regular.otf");
const FONT_BOLD = path.join(FONT_DIR, "Pretendard-Bold.otf");

export interface DemoReportInput {
  staff: {
    name: string;
    phone: string;
    email: string;
  };
  customer: {
    company: string;
    contactName: string;
    title: string;
    phone: string;
    email: string;
  };
}

export async function generateDemoReportPDF(input: DemoReportInput): Promise<Buffer> {
  const companyInfo = await storage.getCompanySettings();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold", FONT_BOLD);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const PAGE_LEFT = 50;
    const PAGE_RIGHT = PAGE_W - 50;
    const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;
    const CENTER_X = PAGE_W / 2;

    doc.rect(0, 0, PAGE_W, 6).fill("#1a56db");

    let y = 60;

    if (companyInfo?.logoData || companyInfo?.logoUrl) {
      try {
        const logoMaxH = 50;
        const logoMaxW = 160;
        let logoSource: string | Buffer | undefined;
        if (companyInfo.logoData) {
          const matches = companyInfo.logoData.match(/^data:[^;]+;base64,(.+)$/);
          if (matches) logoSource = Buffer.from(matches[1], "base64");
        }
        if (!logoSource && companyInfo.logoUrl) {
          const logoPath = path.join(process.cwd(), "server", "uploads", path.basename(companyInfo.logoUrl));
          if (fs.existsSync(logoPath)) logoSource = logoPath;
        }
        if (logoSource) {
          doc.image(logoSource, CENTER_X - logoMaxW / 2, y, {
            fit: [logoMaxW, logoMaxH],
            align: "center",
          });
          y += logoMaxH + 20;
        }
      } catch (e) {
        y += 20;
      }
    } else {
      y += 20;
    }

    doc.moveTo(PAGE_LEFT + 80, y).lineTo(PAGE_RIGHT - 80, y).lineWidth(1).stroke("#1a56db");
    y += 40;

    doc.font("Bold").fontSize(28).fillColor("#111");
    doc.text("Flexible Feeding System", PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
    y += 40;

    doc.font("Bold").fontSize(22).fillColor("#1a56db");
    doc.text("Test Report", PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
    y += 50;

    doc.moveTo(PAGE_LEFT + 80, y).lineTo(PAGE_RIGHT - 80, y).lineWidth(0.5).stroke("#ccc");
    y += 50;

    const boxW = (PAGE_WIDTH - 30) / 2;
    const boxLeft = PAGE_LEFT;
    const boxRight = PAGE_LEFT + boxW + 30;
    const boxRadius = 6;
    const headerH = 32;
    const rowH = 22;

    const drawInfoBox = (
      x: number,
      startY: number,
      title: string,
      rows: { label: string; value: string }[],
    ) => {
      const contentH = rows.length * rowH + 12;
      const totalH = headerH + contentH;

      doc.save();
      doc.roundedRect(x, startY, boxW, totalH, boxRadius).fill("#f8fafc");
      doc.restore();

      doc.save();
      doc.roundedRect(x, startY, boxW, headerH, boxRadius);
      doc.rect(x, startY + boxRadius, boxW, headerH - boxRadius);
      doc.fill("#1a56db");
      doc.restore();

      doc.font("Bold").fontSize(11).fillColor("#ffffff");
      doc.text(title, x + 14, startY + 9, { width: boxW - 28 });

      let rY = startY + headerH + 8;
      for (const row of rows) {
        doc.font("Regular").fontSize(9).fillColor("#666");
        doc.text(row.label, x + 14, rY, { width: 70 });
        doc.font("Regular").fontSize(9.5).fillColor("#111");
        doc.text(row.value || "-", x + 88, rY, { width: boxW - 102 });
        rY += rowH;
      }

      return totalH;
    };

    const staffRows = [
      { label: "Name", value: input.staff.name },
      { label: "Phone", value: input.staff.phone },
      { label: "E-mail", value: input.staff.email },
    ];

    const customerRows = [
      { label: "Company", value: input.customer.company },
      { label: "Name", value: [input.customer.contactName, input.customer.title].filter(Boolean).join(", ") },
      { label: "Phone", value: input.customer.phone },
      { label: "E-mail", value: input.customer.email },
    ];

    const h1 = drawInfoBox(boxLeft, y, "Written by", staffRows);
    const h2 = drawInfoBox(boxRight, y, "Customer", customerRows);
    y += Math.max(h1, h2) + 60;

    if (companyInfo) {
      doc.moveTo(PAGE_LEFT + 120, y).lineTo(PAGE_RIGHT - 120, y).lineWidth(0.5).stroke("#ddd");
      y += 25;

      doc.font("Regular").fontSize(8.5).fillColor("#888");
      if (companyInfo.address) {
        doc.text(companyInfo.address, PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
        y += 14;
      }

      const contactParts: string[] = [];
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
      if (companyInfo.fax) contactParts.push(`Fax: ${companyInfo.fax}`);
      if (companyInfo.email) contactParts.push(companyInfo.email);
      if (contactParts.length > 0) {
        doc.text(contactParts.join("  |  "), PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
        y += 14;
      }

      if (companyInfo.website) {
        doc.font("Regular").fontSize(8.5).fillColor("#1a56db");
        doc.text(companyInfo.website, PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
      }
    }

    doc.rect(0, PAGE_H - 6, PAGE_W, 6).fill("#1a56db");

    doc.end();
  });
}
