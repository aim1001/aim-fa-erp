import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { storage } from "./storage";

const FONT_DIR = path.join(process.cwd(), "server", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Pretendard-Regular.otf");
const FONT_BOLD = path.join(FONT_DIR, "Pretendard-Bold.otf");

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("ko-KR");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  return d.length > 10 ? d.substring(0, 10) : d;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export async function generatePurchaseOrderPDF(orderId: string): Promise<Buffer> {
  const order = await storage.getPurchaseOrder(orderId);
  if (!order) throw new Error("발주를 찾을 수 없습니다");

  const orderItems = await storage.getPurchaseOrderItems(orderId);
  const companyInfo = await storage.getCompanySettings();

  const vendors = await storage.getVendors();
  const vendorRecord = order.vendorId
    ? vendors.find(v => v.id === order.vendorId)
    : order.vendor
      ? vendors.find(v => v.companyName === order.vendor)
      : null;

  const regularItems = orderItems.filter(i => !i.isAdjustment);
  const supplyAmount = order.supplyAmount || regularItems.reduce((s, i) => s + (i.amount || 0), 0);
  const taxAmount = order.taxAmount || Math.round(supplyAmount * 0.1);
  const totalAmount = order.totalAmount || (supplyAmount + taxAmount);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold", FONT_BOLD);

    const PAGE_LEFT = 50;
    const PAGE_RIGHT = 545;
    const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;
    const headerTop = 40;
    const pageBottom = 842 - 25;

    doc.font("Bold").fontSize(22).fillColor("#000").text("발 주 서", PAGE_LEFT, headerTop);

    let rightBlockBottom = headerTop;
    if (companyInfo) {
      const rightBlockX = 300;
      const rightTextW = PAGE_RIGHT - rightBlockX;
      let rY = headerTop;

      if (companyInfo.logoData || companyInfo.logoUrl) {
        try {
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
            doc.image(logoSource, PAGE_RIGHT - 70, rY, { width: 70, height: 18, fit: [70, 18] });
            rY += 23;
          }
        } catch (e) {}
      }

      if (companyInfo.companyName) {
        doc.font("Bold").fontSize(11).fillColor("#000");
        doc.text(companyInfo.companyName, rightBlockX, rY, { width: rightTextW, align: "right" });
        rY += 16;
      }
      doc.font("Regular").fontSize(7.5).fillColor("#444");
      if (companyInfo.address) { doc.text(companyInfo.address, rightBlockX, rY, { width: rightTextW, align: "right" }); rY += 11; }
      const telFax = [companyInfo.phone ? `Tel ${companyInfo.phone}` : "", companyInfo.fax ? `Fax ${companyInfo.fax}` : ""].filter(Boolean).join("  ");
      if (telFax) { doc.text(telFax, rightBlockX, rY, { width: rightTextW, align: "right" }); rY += 11; }
      if (companyInfo.representative) { doc.text(`대표이사 ${companyInfo.representative}`, rightBlockX, rY, { width: rightTextW, align: "right" }); rY += 11; }
      if (companyInfo.email) { doc.text(companyInfo.email, rightBlockX, rY, { width: rightTextW, align: "right" }); rY += 11; }
      rightBlockBottom = rY;
    }

    const metaTop = headerTop + 34;
    const metaLabelW = 75;
    const metaValX = PAGE_LEFT + metaLabelW;
    const metaRows = [
      { label: "발주 No", value: order.orderNumber || "-" },
      { label: "발주일자", value: fmtDate(todayStr()) },
      { label: "납품예정일", value: fmtDate(order.expectedDeliveryDate) || "-" },
    ];
    let mY = metaTop;
    for (const row of metaRows) {
      doc.font("Bold").fontSize(8).fillColor("#333").text(row.label, PAGE_LEFT, mY, { width: metaLabelW });
      doc.font("Regular").fontSize(8).fillColor("#000").text(row.value, metaValX, mY, { width: 200 });
      mY += 14;
    }

    const vendorTop = Math.max(mY, rightBlockBottom) + 8;
    doc.moveTo(PAGE_LEFT, vendorTop).lineTo(PAGE_RIGHT, vendorTop).lineWidth(1).stroke("#333");

    const vendorRowH = 18;
    const vendorLabelW = 50;
    const vendorMidX = PAGE_LEFT + Math.round(PAGE_WIDTH * 0.55);

    const vendorName = order.vendor || "-";
    const vendorContact = vendorRecord?.contactName || "-";
    const vendorEmail = vendorRecord?.contactEmail || "-";
    const vendorPhone = vendorRecord?.contactPhone || vendorRecord?.phone || "-";
    const vendorAddress = vendorRecord?.address || "-";

    const vendorRows = [
      { leftVal: vendorName, rightLabel: "담당자 :", rightVal: vendorContact },
      { leftVal: vendorAddress, rightLabel: "E-mail :", rightVal: vendorEmail },
      { leftVal: "", rightLabel: "연락처 :", rightVal: vendorPhone },
    ];

    doc.rect(PAGE_LEFT, vendorTop + 1, vendorLabelW, vendorRows.length * vendorRowH).fill("#E8E8E8");
    doc.fillColor("#333").font("Bold").fontSize(8);
    doc.text("구매처", PAGE_LEFT + 4, vendorTop + 4, { width: vendorLabelW - 8 });

    let vY = vendorTop + 2;
    doc.font("Regular").fontSize(8).fillColor("#000");
    const rightLabelW = 55;
    for (let i = 0; i < vendorRows.length; i++) {
      const r = vendorRows[i];
      if (r.leftVal) {
        doc.text(r.leftVal, PAGE_LEFT + vendorLabelW + 5, vY + 3, { width: vendorMidX - PAGE_LEFT - vendorLabelW - 10 });
      }
      doc.font("Regular").fontSize(7.5).fillColor("#555");
      doc.text(r.rightLabel, vendorMidX + 5, vY + 4, { width: rightLabelW });
      doc.font("Regular").fontSize(8).fillColor("#000");
      doc.text(r.rightVal, vendorMidX + 5 + rightLabelW, vY + 3, { width: PAGE_RIGHT - vendorMidX - rightLabelW - 10 });
      vY += vendorRowH;
    }

    doc.moveTo(PAGE_LEFT, vY).lineTo(PAGE_RIGHT, vY).lineWidth(0.5).stroke("#999");
    doc.moveTo(vendorMidX, vendorTop).lineTo(vendorMidX, vY).lineWidth(0.5).stroke("#999");
    doc.moveTo(PAGE_LEFT, vendorTop).lineTo(PAGE_LEFT, vY).lineWidth(0.5).stroke("#999");
    doc.moveTo(PAGE_RIGHT, vendorTop).lineTo(PAGE_RIGHT, vY).lineWidth(0.5).stroke("#999");
    for (let i = 1; i < vendorRows.length; i++) {
      const lineY = vendorTop + i * vendorRowH;
      doc.moveTo(PAGE_LEFT + vendorLabelW, lineY).lineTo(PAGE_RIGHT, lineY).lineWidth(0.3).stroke("#ccc");
    }

    let y = vY + 12;

    if (order.description) {
      doc.font("Bold").fontSize(8).fillColor("#333").text("내용:", PAGE_LEFT, y, { width: 40 });
      doc.font("Regular").fontSize(8).fillColor("#000").text(order.description, PAGE_LEFT + 40, y, { width: PAGE_WIDTH - 40 });
      y += 16;
    }

    y += 4;

    const colX = [50, 75, 200, 310, 355, 415, 475];
    const colW = [25, 125, 110, 45, 60, 60, 70];
    const headers = ["No", "품명", "규격/브랜드", "수량", "단가", "금액", "비고"];

    doc.rect(50, y, 495, 18).fill("#E8E8E8");
    doc.fillColor("#000").font("Bold").fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, colX[i], y + 4, { width: colW[i], align: i >= 3 ? "right" : "left" });
    });
    y += 20;

    let idx = 0;
    for (const item of orderItems) {
      if (item.isAdjustment) continue;
      idx++;

      doc.font("Regular").fontSize(8);
      const specBrand = [item.spec, item.brand].filter(Boolean).join(" / ");
      const specH = specBrand ? doc.heightOfString(specBrand, { width: colW[2] - 4 }) : 0;
      const rowH = Math.max(16, specH + 6);

      if (idx % 2 === 0) doc.rect(50, y - 2, 495, rowH).fill("#FAFAFA");
      doc.fillColor("#000").font("Regular").fontSize(8);
      doc.text(String(idx), colX[0], y, { width: colW[0] });
      doc.text(item.itemName || "-", colX[1], y, { width: colW[1] });
      if (specBrand) doc.text(specBrand, colX[2], y, { width: colW[2] - 4 });
      doc.text(fmtNum(item.quantity), colX[3], y, { width: colW[3], align: "right" });
      doc.text(fmtNum(item.unitPrice), colX[4], y, { width: colW[4], align: "right" });
      doc.text(fmtNum(item.amount), colX[5], y, { width: colW[5], align: "right" });
      y += rowH;

      if (y > pageBottom - 180) {
        doc.addPage();
        y = 50;
        doc.rect(50, y, 495, 18).fill("#E8E8E8");
        doc.fillColor("#000").font("Bold").fontSize(8);
        headers.forEach((h, i) => {
          doc.text(h, colX[i], y + 4, { width: colW[i], align: i >= 3 ? "right" : "left" });
        });
        y += 20;
      }
    }

    y += 5;
    doc.moveTo(50, y).lineTo(545, y).stroke("#ccc");
    y += 10;

    doc.font("Regular").fontSize(9).fillColor("#000");
    doc.text("공급가액:", 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(supplyAmount)}원`, 465, y, { width: 80, align: "right" });
    y += 17;

    doc.text("부가세(10%):", 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(taxAmount)}원`, 465, y, { width: 80, align: "right" });
    y += 17;

    doc.font("Bold").fontSize(10).fillColor("#000");
    doc.text("합계:", 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(totalAmount)}원`, 465, y, { width: 80, align: "right" });
    y += 20;

    const contractDetails = [
      { label: "지급조건", value: order.paymentTerms },
      { label: "입고장소", value: order.deliveryLocation },
      { label: "담당자", value: order.contactPerson },
      { label: "보증조건", value: order.warrantyTerms },
    ].filter(d => d.value);

    if (contractDetails.length > 0) {
      doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).stroke("#ccc");
      y += 6;
      doc.font("Bold").fontSize(7).fillColor("#000").text("■ 계약 상세", PAGE_LEFT, y);
      y += 12;
      const cdLabelW = 55;
      for (const cd of contractDetails) {
        doc.font("Bold").fontSize(7.5).fillColor("#555").text(cd.label, PAGE_LEFT + 5, y, { width: cdLabelW });
        doc.font("Regular").fontSize(7.5).fillColor("#000").text(cd.value!, PAGE_LEFT + 5 + cdLabelW, y, { width: PAGE_WIDTH - cdLabelW - 10 });
        y += 13;
      }
      y += 5;
    }

    const signHeaderH = 14;
    const signBoxH = 35;
    const signInset = 40;
    const signGapW = 12;
    const signAreaW = PAGE_WIDTH - signInset * 2;
    const signW = (signAreaW - signGapW) / 2;
    const signLeftX = PAGE_LEFT + signInset;
    const signRightX = signLeftX + signW + signGapW;

    const signY = Math.max(y, pageBottom - signHeaderH - signBoxH - 60);

    doc.rect(signLeftX, signY, signW, signHeaderH).fill("#E8E8E8");
    doc.font("Bold").fontSize(7).fillColor("#000");
    doc.text("발주처 (확인)", signLeftX, signY + 3, { width: signW, align: "center", lineBreak: false });
    doc.rect(signRightX, signY, signW, signHeaderH).fill("#E8E8E8");
    doc.text("구매처 (확인)", signRightX, signY + 3, { width: signW, align: "center", lineBreak: false });

    const signBodyY = signY + signHeaderH;
    doc.rect(signLeftX, signBodyY, signW, signBoxH).lineWidth(0.5).stroke("#999");
    doc.rect(signRightX, signBodyY, signW, signBoxH).lineWidth(0.5).stroke("#999");

    if (companyInfo) {
      const sellerName = companyInfo.companyName || "";
      const sellerRep = companyInfo.representative ? `대표이사 ${companyInfo.representative}` : "";
      const sellerLine = [sellerName, sellerRep].filter(Boolean).join(" ");
      if (sellerLine) {
        doc.font("Regular").fontSize(6.5).fillColor("#000");
        doc.text(sellerLine, signLeftX + 4, signBodyY + 3, { width: signW - 8, align: "center", lineBreak: false });
      }
      if (companyInfo.signatureData || companyInfo.signatureUrl) {
        try {
          let sigSource: string | Buffer | undefined;
          if (companyInfo.signatureData) {
            const matches = companyInfo.signatureData.match(/^data:[^;]+;base64,(.+)$/);
            if (matches) sigSource = Buffer.from(matches[1], "base64");
          }
          if (!sigSource && companyInfo.signatureUrl) {
            const sigPath = path.join(process.cwd(), "server", "uploads", path.basename(companyInfo.signatureUrl));
            if (fs.existsSync(sigPath)) sigSource = sigPath;
          }
          if (sigSource) {
            doc.image(sigSource, signLeftX + 10, signBodyY + 13, { width: 40, height: 18, fit: [40, 18] });
          }
        } catch (e) {}
      }
      doc.font("Regular").fontSize(6.5).fillColor("#000");
      doc.text(fmtDate(todayStr()), signLeftX + 4, signBodyY + 16, { width: signW - 8, align: "right", lineBreak: false });
    }

    const vendorNameForSign = order.vendor || "";
    if (vendorNameForSign) {
      doc.font("Regular").fontSize(6.5).fillColor("#000");
      doc.text(vendorNameForSign, signRightX + 4, signBodyY + 3, { width: signW - 8, align: "center", lineBreak: false });
    }

    let bY = signBodyY + signBoxH + 8;

    if (order.memo) {
      doc.moveTo(PAGE_LEFT, bY).lineTo(PAGE_RIGHT, bY).lineWidth(0.5).stroke("#ccc");
      bY += 6;
      doc.font("Bold").fontSize(7).fillColor("#000").text("■ 비고", PAGE_LEFT, bY);
      bY += 10;
      doc.font("Regular").fontSize(6.5).fillColor("#333").text(order.memo, PAGE_LEFT, bY, { width: PAGE_WIDTH, lineGap: 0.5 });
      bY += doc.heightOfString(order.memo, { width: PAGE_WIDTH, lineGap: 0.5 }) + 8;
    }

    const footerY = pageBottom - 16;
    doc.moveTo(PAGE_LEFT, footerY).lineTo(PAGE_RIGHT, footerY).lineWidth(0.8).stroke("#333");
    doc.font("Bold").fontSize(7.5).fillColor("#000");
    doc.text("www.aim-fa.com", PAGE_LEFT, footerY + 3, { width: PAGE_WIDTH, align: "center", lineBreak: false });

    doc.end();
  });
}
