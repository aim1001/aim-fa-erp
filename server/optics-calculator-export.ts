import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { storage } from "./storage";

const FONT_DIR = path.join(process.cwd(), "server", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Pretendard-Regular.otf");
const FONT_BOLD = path.join(FONT_DIR, "Pretendard-Bold.otf");

export interface OpticsCalculatorPdfInput {
  inquiryNumber?: string;
  customerName?: string;
  staff?: {
    name: string;
    phone: string;
    email: string;
  };
  customer?: {
    company: string;
    contactName: string;
    title: string;
    phone: string;
    email: string;
  };
  camera: {
    brand: string;
    model: string;
    resolutionX: number;
    resolutionY: number;
    sensorWidth: number;
    sensorHeight: number;
  };
  lensFocal: number;
  workingDistance: number;
  aiveModel: string;
  product: {
    width: number;
    height: number;
    heightZ: number;
  };
  results: {
    fovX: number;
    fovY: number;
    inspectionArea: number;
    pixelSize: number;
    angleX: number;
    angleY: number;
    avgError: number;
    shapeErrorX: number;
    shapeErrorY: number;
    maxErrorX: number;
    maxErrorY: number;
    productsPerFov: number;
    coverage: number;
    efficiency: string;
    theoreticalProductCount: number;
  };
  canvasImage?: string;
}

export async function generateOpticsCalculatorPDF(input: OpticsCalculatorPdfInput): Promise<Buffer> {
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

    if (input.staff && input.customer) {
      doc.rect(0, 0, PAGE_W, 6).fill("#1a56db");

      let cy = 60;

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
            doc.image(logoSource, CENTER_X - logoMaxW / 2, cy, {
              fit: [logoMaxW, logoMaxH],
              align: "center",
            });
            cy += logoMaxH + 20;
          }
        } catch {
          cy += 20;
        }
      } else {
        cy += 20;
      }

      doc.moveTo(PAGE_LEFT + 80, cy).lineTo(PAGE_RIGHT - 80, cy).lineWidth(1).stroke("#1a56db");
      cy += 40;

      doc.font("Bold").fontSize(28).fillColor("#111");
      doc.text("Flexible Feeding System", PAGE_LEFT, cy, { width: PAGE_WIDTH, align: "center" });
      cy += 40;

      doc.font("Bold").fontSize(22).fillColor("#1a56db");
      doc.text("Test Report", PAGE_LEFT, cy, { width: PAGE_WIDTH, align: "center" });
      cy += 50;

      doc.moveTo(PAGE_LEFT + 80, cy).lineTo(PAGE_RIGHT - 80, cy).lineWidth(0.5).stroke("#ccc");
      cy += 50;

      const boxW = (PAGE_WIDTH - 30) / 2;
      const boxLeft = PAGE_LEFT;
      const boxRight = PAGE_LEFT + boxW + 30;
      const boxRadius = 6;
      const coverHeaderH = 32;
      const coverRowH = 22;

      const drawInfoBox = (
        x: number,
        startY: number,
        title: string,
        rows: { label: string; value: string }[],
      ) => {
        const contentH = rows.length * coverRowH + 12;
        const totalH = coverHeaderH + contentH;

        doc.save();
        doc.roundedRect(x, startY, boxW, totalH, boxRadius).fill("#f8fafc");
        doc.restore();

        doc.save();
        doc.roundedRect(x, startY, boxW, coverHeaderH, boxRadius);
        doc.rect(x, startY + boxRadius, boxW, coverHeaderH - boxRadius);
        doc.fill("#1a56db");
        doc.restore();

        doc.font("Bold").fontSize(11).fillColor("#ffffff");
        doc.text(title, x + 14, startY + 9, { width: boxW - 28 });

        let rY = startY + coverHeaderH + 8;
        for (const row of rows) {
          doc.font("Regular").fontSize(9).fillColor("#666");
          doc.text(row.label, x + 14, rY, { width: 70 });
          doc.font("Regular").fontSize(9.5).fillColor("#111");
          doc.text(row.value || "-", x + 88, rY, { width: boxW - 102 });
          rY += coverRowH;
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

      const ch1 = drawInfoBox(boxLeft, cy, "Written by", staffRows);
      const ch2 = drawInfoBox(boxRight, cy, "Customer", customerRows);
      cy += Math.max(ch1, ch2) + 60;

      if (companyInfo) {
        doc.moveTo(PAGE_LEFT + 120, cy).lineTo(PAGE_RIGHT - 120, cy).lineWidth(0.5).stroke("#ddd");
        cy += 25;

        doc.font("Regular").fontSize(8.5).fillColor("#888");
        if (companyInfo.address) {
          doc.text(companyInfo.address, PAGE_LEFT, cy, { width: PAGE_WIDTH, align: "center" });
          cy += 14;
        }

        const contactParts: string[] = [];
        if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
        if (companyInfo.fax) contactParts.push(`Fax: ${companyInfo.fax}`);
        if (companyInfo.email) contactParts.push(companyInfo.email);
        if (contactParts.length > 0) {
          doc.text(contactParts.join("  |  "), PAGE_LEFT, cy, { width: PAGE_WIDTH, align: "center" });
          cy += 14;
        }

        if (companyInfo.website) {
          doc.font("Regular").fontSize(8.5).fillColor("#1a56db");
          doc.text(companyInfo.website, PAGE_LEFT, cy, { width: PAGE_WIDTH, align: "center" });
        }
      }

      doc.rect(0, PAGE_H - 6, PAGE_W, 6).fill("#1a56db");

      doc.addPage();
    }

    doc.rect(0, 0, PAGE_W, 6).fill("#1a56db");

    let y = 30;

    if (companyInfo?.logoData || companyInfo?.logoUrl) {
      try {
        const logoMaxH = 40;
        const logoMaxW = 140;
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
          doc.image(logoSource, PAGE_LEFT, y, { fit: [logoMaxW, logoMaxH] });
          y += logoMaxH + 10;
        }
      } catch {
        y += 10;
      }
    } else {
      y += 10;
    }

    doc.font("Bold").fontSize(18).fillColor("#111");
    doc.text("광학 계산기 리포트", PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
    y += 28;

    doc.font("Regular").fontSize(9).fillColor("#666");
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    doc.text(`생성일: ${dateStr}`, PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
    y += 20;

    if (input.inquiryNumber || input.customerName) {
      doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).stroke("#ddd");
      y += 12;

      const infoItems: string[] = [];
      if (input.inquiryNumber) infoItems.push(`영업번호: ${input.inquiryNumber}`);
      if (input.customerName) infoItems.push(`고객사: ${input.customerName}`);

      doc.font("Bold").fontSize(10).fillColor("#1a56db");
      doc.text(infoItems.join("    |    "), PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" });
      y += 20;
    }

    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(1).stroke("#1a56db");
    y += 20;

    const colW = (PAGE_WIDTH - 20) / 2;
    const leftCol = PAGE_LEFT;
    const rightCol = PAGE_LEFT + colW + 20;

    const drawTable = (x: number, startY: number, title: string, rows: { label: string; value: string }[]): number => {
      const headerH = 24;
      const rowH = 18;
      const tableW = colW;
      const totalH = headerH + rows.length * rowH + 4;

      doc.save();
      doc.roundedRect(x, startY, tableW, totalH, 4).fill("#f8fafc");
      doc.restore();

      doc.save();
      doc.roundedRect(x, startY, tableW, headerH, 4);
      doc.rect(x, startY + 4, tableW, headerH - 4);
      doc.fill("#1a56db");
      doc.restore();

      doc.font("Bold").fontSize(10).fillColor("#ffffff");
      doc.text(title, x + 10, startY + 6, { width: tableW - 20 });

      let rY = startY + headerH + 4;
      rows.forEach((row, i) => {
        if (i % 2 === 1) {
          doc.save();
          doc.rect(x + 2, rY - 2, tableW - 4, rowH).fill("#f0f4f8");
          doc.restore();
        }
        doc.font("Regular").fontSize(8.5).fillColor("#666");
        doc.text(row.label, x + 10, rY, { width: 80 });
        doc.font("Regular").fontSize(9).fillColor("#111");
        doc.text(row.value, x + 95, rY, { width: tableW - 110 });
        rY += rowH;
      });

      return totalH;
    };

    const cameraRows = [
      { label: "카메라", value: `${input.camera.brand} ${input.camera.model}` },
      { label: "해상도", value: `${input.camera.resolutionX} × ${input.camera.resolutionY} px` },
      { label: "센서 크기", value: `${input.camera.sensorWidth} × ${input.camera.sensorHeight} mm` },
      { label: "렌즈 초점", value: `${input.lensFocal} mm` },
      { label: "작업거리", value: `${input.workingDistance} mm` },
      { label: "시스템", value: input.aiveModel },
    ];

    const productRows = [
      { label: "제품 가로", value: `${input.product.width} mm` },
      { label: "제품 세로", value: `${input.product.height} mm` },
      { label: "제품 높이", value: `${input.product.heightZ} mm` },
    ];

    const h1 = drawTable(leftCol, y, "입력 파라미터 - 카메라/렌즈", cameraRows);
    const h2 = drawTable(rightCol, y, "입력 파라미터 - 제품", productRows);
    y += Math.max(h1, h2) + 16;

    const r = input.results;
    const resultRows = [
      { label: "FOV", value: `${r.fovX} × ${r.fovY} mm` },
      { label: "검사 영역", value: `${r.inspectionArea} mm²` },
      { label: "픽셀 크기", value: `${r.pixelSize} mm` },
      { label: "시야각", value: `${r.angleX}° × ${r.angleY}°` },
      { label: "평균 오차", value: `±${r.avgError} mm` },
      { label: "이론 수량", value: `${r.theoreticalProductCount}개` },
      { label: "커버리지", value: `${r.coverage}%` },
      { label: "효율성", value: r.efficiency },
    ];

    const errorRows = [
      { label: "Shape 오차 X", value: `${r.shapeErrorX} mm` },
      { label: "Shape 오차 Y", value: `${r.shapeErrorY} mm` },
      { label: "최대 오차 X", value: `${r.maxErrorX} mm` },
      { label: "최대 오차 Y", value: `${r.maxErrorY} mm` },
    ];

    const h3 = drawTable(leftCol, y, "계산 결과", resultRows);
    const h4 = drawTable(rightCol, y, "높이 오차 분석", errorRows);
    y += Math.max(h3, h4) + 20;

    if (input.canvasImage) {
      try {
        const matches = input.canvasImage.match(/^data:[^;]+;base64,(.+)$/);
        if (matches) {
          const imgBuffer = Buffer.from(matches[1], "base64");

          const remainingH = PAGE_H - y - 70;
          const imgW = PAGE_WIDTH;
          const imgH = Math.min(remainingH, imgW * 0.6);

          if (imgH > 100) {
            doc.font("Bold").fontSize(10).fillColor("#1a56db");
            doc.text("FOV 시각화", PAGE_LEFT, y, { width: PAGE_WIDTH });
            y += 16;

            doc.save();
            doc.roundedRect(PAGE_LEFT, y, imgW, imgH, 4).stroke("#ddd");
            doc.restore();

            doc.image(imgBuffer, PAGE_LEFT + 2, y + 2, {
              fit: [imgW - 4, imgH - 4],
              align: "center",
              valign: "center",
            });
            y += imgH + 10;
          }
        }
      } catch {
      }
    }

    if (companyInfo) {
      const footerY = PAGE_H - 50;
      doc.moveTo(PAGE_LEFT + 80, footerY).lineTo(PAGE_RIGHT - 80, footerY).lineWidth(0.5).stroke("#ddd");

      let fY = footerY + 8;
      doc.font("Regular").fontSize(7.5).fillColor("#888");

      const contactParts: string[] = [];
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
      if (companyInfo.fax) contactParts.push(`Fax: ${companyInfo.fax}`);
      if (companyInfo.email) contactParts.push(companyInfo.email);
      if (contactParts.length > 0) {
        doc.text(contactParts.join("  |  "), PAGE_LEFT, fY, { width: PAGE_WIDTH, align: "center" });
        fY += 12;
      }
      if (companyInfo.website) {
        doc.font("Regular").fontSize(7.5).fillColor("#1a56db");
        doc.text(companyInfo.website, PAGE_LEFT, fY, { width: PAGE_WIDTH, align: "center" });
      }
    }

    doc.rect(0, PAGE_H - 6, PAGE_W, 6).fill("#1a56db");

    doc.end();
  });
}
