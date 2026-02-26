import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { uploadFileToFolder } from "./onedrive";
import type { QuotationItem } from "@shared/schema";

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

function groupByCategory(items: QuotationItem[]): Map<string, QuotationItem[]> {
  const map = new Map<string, QuotationItem[]>();
  for (const item of items) {
    const cat = item.category1 || item.category2 || "기타";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return map;
}

export async function generateQuotationPDF(quotationId: string, inquiry: any): Promise<Buffer> {
  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");
  const { quotation, items } = result;

  const companyInfo = await storage.getCompanySettings();

  const regularItems = items.filter(i => !i.isAdjustment);
  const adjustmentItems = items.filter(i => i.isAdjustment);

  const regularSubtotal = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
  const adjTotal = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
  const supplyAmount = regularSubtotal + adjTotal;

  const discountType = quotation.discountType || "amount";
  const discountValue = quotation.discountValue || 0;
  const discountTruncUnit = parseInt((quotation.discountTruncUnit as string) || "0") || 0;
  const discountAmount = discountValue > 0
    ? (discountType === "percent" ? Math.round(supplyAmount * discountValue / 100) : discountValue)
    : 0;
  let afterDiscount = supplyAmount - discountAmount;
  if (discountTruncUnit > 0 && discountAmount > 0) afterDiscount = Math.floor(afterDiscount / discountTruncUnit) * discountTruncUnit;
  const actualDiscount = supplyAmount - afterDiscount;
  const truncLabel = discountTruncUnit === 1000000 ? "백만원절사" : discountTruncUnit === 100000 ? "십만원절사" : discountTruncUnit === 10000 ? "만원절사" : discountTruncUnit === 1000 ? "천원절사" : "";

  const tax = Math.round(afterDiscount * 0.1);
  const total = afterDiscount + tax;
  const grouped = groupByCategory(regularItems);

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

    doc.font("Bold").fontSize(22).fillColor("#000").text("견 적 서", PAGE_LEFT, headerTop);

    let rightBlockBottom = headerTop;
    if (companyInfo) {
      const rightBlockX = 300;
      const rightTextW = PAGE_RIGHT - rightBlockX;
      let rY = headerTop;

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

      if (companyInfo?.logoUrl) {
        const logoPath = path.join(process.cwd(), "server", "uploads", path.basename(companyInfo.logoUrl));
        if (fs.existsSync(logoPath)) {
          try {
            const logoMaxH = 35;
            const logoMaxW = 90;
            const logoX = PAGE_RIGHT - logoMaxW;
            doc.image(logoPath, logoX, rY, { width: logoMaxW, height: logoMaxH, fit: [logoMaxW, logoMaxH] });
            rY += logoMaxH + 4;
          } catch (e) {}
        }
      }

      rightBlockBottom = rY;
    }

    const metaTop = headerTop + 34;
    const metaLabelW = 75;
    const metaValX = PAGE_LEFT + metaLabelW;
    const validText = quotation.validUntil ? `제출일로 부터 30일` : "-";

    doc.font("Regular").fontSize(8).fillColor("#333");
    const metaDeliveryText = quotation.deliveryDays ? `${quotation.deliveryDays}일` : "-";
    const metaRows = [
      { label: "견 적 No", value: quotation.quoteNumber },
      { label: "제출일자", value: fmtDate(quotation.quoteDate) },
      { label: "견적 유효기간", value: validText },
      { label: "납기", value: metaDeliveryText },
    ];
    let mY = metaTop;
    for (const row of metaRows) {
      doc.font("Bold").fontSize(8).fillColor("#333").text(row.label, PAGE_LEFT, mY, { width: metaLabelW });
      doc.font("Regular").fontSize(8).fillColor("#000").text(row.value, metaValX, mY, { width: 200 });
      mY += 14;
    }

    const custTop = Math.max(mY, rightBlockBottom) + 8;
    doc.moveTo(PAGE_LEFT, custTop).lineTo(PAGE_RIGHT, custTop).lineWidth(1).stroke("#333");

    const custLabelBg = "#E8E8E8";
    const custRowH = 18;
    const custMidX = PAGE_LEFT + Math.round(PAGE_WIDTH * 0.55);
    const custLabelW = 50;
    const custRows = [
      {
        leftLabel: "",
        leftVal: inquiry.snapshotCompanyName || inquiry.customerName || "-",
        rightLabel: "Customer name :",
        rightVal: inquiry.snapshotContactName || "-",
        rightLabelW: 85,
      },
      {
        leftLabel: "",
        leftVal: inquiry.snapshotAddress || "-",
        rightLabel: "E-mail :",
        rightVal: inquiry.snapshotEmail || "-",
        rightLabelW: 85,
      },
      {
        leftLabel: "",
        leftVal: "",
        rightLabel: "Phone number :",
        rightVal: inquiry.snapshotPhone || "-",
        rightLabelW: 85,
      },
    ];

    doc.rect(PAGE_LEFT, custTop + 1, custLabelW, custRows.length * custRowH).fill(custLabelBg);
    doc.fillColor("#333").font("Bold").fontSize(8);
    doc.text("고객사", PAGE_LEFT + 4, custTop + 4, { width: custLabelW - 8 });

    let cY = custTop + 2;
    doc.font("Regular").fontSize(8).fillColor("#000");
    for (let i = 0; i < custRows.length; i++) {
      const r = custRows[i];
      if (r.leftVal) {
        doc.text(r.leftVal, PAGE_LEFT + custLabelW + 5, cY + 3, { width: custMidX - PAGE_LEFT - custLabelW - 10 });
      }
      doc.font("Regular").fontSize(7.5).fillColor("#555");
      doc.text(r.rightLabel, custMidX + 5, cY + 4, { width: r.rightLabelW });
      doc.font("Regular").fontSize(8).fillColor("#000");
      doc.text(r.rightVal, custMidX + 5 + r.rightLabelW, cY + 3, { width: PAGE_RIGHT - custMidX - r.rightLabelW - 10 });
      cY += custRowH;
    }

    doc.moveTo(PAGE_LEFT, cY).lineTo(PAGE_RIGHT, cY).lineWidth(0.5).stroke("#999");
    doc.moveTo(custMidX, custTop).lineTo(custMidX, cY).lineWidth(0.5).stroke("#999");
    doc.moveTo(PAGE_LEFT, custTop).lineTo(PAGE_LEFT, cY).lineWidth(0.5).stroke("#999");
    doc.moveTo(PAGE_RIGHT, custTop).lineTo(PAGE_RIGHT, cY).lineWidth(0.5).stroke("#999");
    for (let i = 1; i < custRows.length; i++) {
      const lineY = custTop + i * custRowH;
      doc.moveTo(PAGE_LEFT + custLabelW, lineY).lineTo(PAGE_RIGHT, lineY).lineWidth(0.3).stroke("#ccc");
    }

    doc.y = cY + 10;
    doc.moveDown(0.8);

    const tableTop = doc.y;
    const sumColX = [50, 75, 310, 410];
    const sumColW = [25, 235, 100, 135];
    const sumHeaders = ["No", "카테고리", "수량", "금액"];

    doc.rect(50, tableTop, 495, 20).fill("#E8E8E8");
    doc.fillColor("#000").font("Bold").fontSize(8);
    sumHeaders.forEach((h, i) => {
      doc.text(h, sumColX[i], tableTop + 5, { width: sumColW[i], align: i >= 2 ? "right" : "left" });
    });

    let y = tableTop + 22;
    let catIdx = 0;

    for (const [cat, catItems] of grouped) {
      catIdx++;
      const catQty = catItems.reduce((s, i) => s + (i.quantity || 0), 0);
      const catSubtotal = catItems.reduce((s, i) => s + (i.amount || 0), 0);
      const rowH = 16;
      if (catIdx % 2 === 0) {
        doc.rect(50, y - 2, 495, rowH).fill("#FAFAFA");
      }
      doc.fillColor("#000").font("Regular").fontSize(8);
      doc.text(String(catIdx), sumColX[0], y, { width: sumColW[0] });
      doc.text(cat, sumColX[1], y, { width: sumColW[1] });
      doc.text(fmtNum(catQty), sumColX[2], y, { width: sumColW[2], align: "right" });
      doc.text(`${fmtNum(catSubtotal)}원`, sumColX[3], y, { width: sumColW[3], align: "right" });
      y += rowH;
    }

    if (adjustmentItems.length > 0) {
      catIdx++;
      const adjQty = adjustmentItems.reduce((s, i) => s + (i.quantity || 0), 0);
      const adjSubtotal = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
      const rowH = 16;
      if (catIdx % 2 === 0) {
        doc.rect(50, y - 2, 495, rowH).fill("#FAFAFA");
      }
      doc.fillColor("#000").font("Regular").fontSize(8);
      doc.text(String(catIdx), sumColX[0], y, { width: sumColW[0] });
      doc.text("추가", sumColX[1], y, { width: sumColW[1] });
      doc.text(fmtNum(adjQty), sumColX[2], y, { width: sumColW[2], align: "right" });
      doc.text(`${fmtNum(adjSubtotal)}원`, sumColX[3], y, { width: sumColW[3], align: "right" });
      y += rowH;
    }

    y += 5;
    doc.moveTo(50, y).lineTo(545, y).stroke("#ccc");
    y += 10;

    const sumStartY = y;

    const ptLabelW = 55;
    const ptValW = 80;
    const ptTableW = ptLabelW + ptValW + 10;
    const ptRowH = 15;
    const ptX = PAGE_LEFT;
    let ptY = sumStartY;

    doc.rect(ptX, ptY, ptTableW, ptRowH).fill("#E8E8E8");
    doc.fillColor("#333").font("Bold").fontSize(7.5);
    doc.text("결재조건 (현금)", ptX + 2, ptY + 3, { width: ptTableW - 4, align: "center" });
    ptY += ptRowH;

    const ptRows = [
      { label: "계약금", value: inquiry.contractRatio ? `${inquiry.contractRatio}%` : "-" },
      { label: "중도금", value: inquiry.midRatio ? `${inquiry.midRatio}%` : "-" },
      { label: "잔금", value: inquiry.finalRatio ? `${inquiry.finalRatio}%` : "-" },
    ];

    doc.font("Regular").fontSize(7.5);
    for (const row of ptRows) {
      doc.rect(ptX, ptY, ptLabelW, ptRowH).fill("#F5F5F5");
      doc.fillColor("#333").font("Bold").fontSize(7);
      doc.text(row.label, ptX + 3, ptY + 3, { width: ptLabelW - 6 });
      doc.font("Regular").fontSize(7.5).fillColor("#000");
      doc.text(row.value, ptX + ptLabelW + 3, ptY + 3, { width: ptValW });
      doc.moveTo(ptX, ptY + ptRowH).lineTo(ptX + ptTableW, ptY + ptRowH).lineWidth(0.3).stroke("#ccc");
      ptY += ptRowH;
    }
    doc.moveTo(ptX, sumStartY).lineTo(ptX, ptY).lineWidth(0.5).stroke("#999");
    doc.moveTo(ptX + ptTableW, sumStartY).lineTo(ptX + ptTableW, ptY).lineWidth(0.5).stroke("#999");
    doc.moveTo(ptX, sumStartY).lineTo(ptX + ptTableW, sumStartY).lineWidth(0.5).stroke("#999");

    doc.font("Regular").fontSize(9).fillColor("#000");
    doc.text(`공급가액:`, 360, sumStartY, { width: 100, align: "right" });
    doc.text(`${fmtNum(supplyAmount)}원`, 465, sumStartY, { width: 80, align: "right" });
    let sY = sumStartY + 15;

    if (actualDiscount > 0) {
      const discPct = supplyAmount > 0 ? ((actualDiscount / supplyAmount) * 100).toFixed(1) : "0";
      doc.text(`할인:`, 360, sY, { width: 100, align: "right" });
      doc.text(`-${fmtNum(actualDiscount)}원 (${discPct}%)`, 465, sY, { width: 80, align: "right" });
      sY += 15;

      const hlX = 355; const hlW = 195; const hlH = 16;
      doc.rect(hlX, sY - 2, hlW, hlH).fill("#000");
      doc.font("Bold").fontSize(9).fillColor("#fff");
      doc.text(`최종 공급가액:`, hlX + 5, sY, { width: 100, align: "right" });
      doc.text(`${fmtNum(afterDiscount)}원`, 465, sY, { width: 80, align: "right" });
      doc.fillColor("#000").font("Regular").fontSize(9);
      sY += 18;
    }

    doc.text(`부가세(10%):`, 360, sY, { width: 100, align: "right" });
    doc.text(`${fmtNum(tax)}원`, 465, sY, { width: 80, align: "right" });
    sY += 17;

    doc.font("Bold").fontSize(10).fillColor("#000");
    doc.text(`합계:`, 360, sY, { width: 100, align: "right" });
    doc.text(`${fmtNum(total)}원`, 465, sY, { width: 80, align: "right" });

    y = Math.max(ptY, sY + 18) + 5;

    if (quotation.notes) {
      y += 12;
      if (y > 700) { doc.addPage(); y = 50; }

      const notesText = quotation.notes as string;
      const excludeMatch = notesText.match(/\[제외사항\]\s*([\s\S]*?)(?=\[기술지원\]|$)/);
      const supportMatch = notesText.match(/\[기술지원\]\s*([\s\S]*?)$/);

      if (excludeMatch && supportMatch) {
        const excludeContent = excludeMatch[1].trim();
        const supportContent = supportMatch[1].trim();

        doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).stroke("#ccc");
        y += 6;

        const nColGap = 15;
        const nColW = (PAGE_WIDTH - nColGap) / 2;
        const nRightColX = PAGE_LEFT + nColW + nColGap;
        const nTopY = y;

        doc.font("Bold").fontSize(7).fillColor("#000");
        const nLabelH = doc.heightOfString("■ 제외사항", { width: nColW });

        doc.text("■ 제외사항", PAGE_LEFT, nTopY, { width: nColW });
        doc.font("Regular").fontSize(6.5).fillColor("#333");
        doc.text(excludeContent, PAGE_LEFT, nTopY + nLabelH + 2, { width: nColW, lineGap: 0.5 });
        const nLeftBottom = doc.y;

        doc.font("Bold").fontSize(7).fillColor("#000");
        doc.text("■ 기술지원", nRightColX, nTopY, { width: nColW });
        doc.font("Regular").fontSize(6.5).fillColor("#333");
        doc.text(supportContent, nRightColX, nTopY + nLabelH + 2, { width: nColW, lineGap: 0.5 });
        const nRightBottom = doc.y;

        y = Math.max(nLeftBottom, nRightBottom);
      } else {
        doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).stroke("#ccc");
        y += 6;
        doc.font("Bold").fontSize(7).fillColor("#000").text("■ 비고", PAGE_LEFT, y);
        y += 10;
        doc.font("Regular").fontSize(6.5).fillColor("#333").text(notesText, PAGE_LEFT, y, { width: PAGE_WIDTH, lineGap: 0.5 });
        y = doc.y;
      }
    }

    if (companyInfo?.bankInfo) {
      y += 15;
      if (y > 730) { doc.addPage(); y = 50; }
      doc.font("Bold").fontSize(10).fillColor("#000").text("입금 계좌", 50, y);
      y += 15;
      doc.font("Regular").fontSize(9).text(companyInfo.bankInfo, 50, y, { width: 495 });
      y = doc.y;
    }

    let deliveryText = "";
    let warrantyText = inquiry.warrantyTerms || "";

    if (inquiry.contractClauses) {
      const raw = inquiry.contractClauses as string;
      const splitPattern = /■\s*보증\s*(및|&)\s*책임\s*범위/;
      const splitMatch = raw.match(splitPattern);
      if (splitMatch && splitMatch.index != null && !warrantyText.trim()) {
        deliveryText = raw.substring(0, splitMatch.index).trim();
        warrantyText = raw.substring(splitMatch.index).trim();
      } else {
        deliveryText = raw.trim();
      }
    }

    const bulletize = (text: string) => text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => /^[-*·•]/.test(l) ? l : `- ${l}`)
      .join("\n");

    const deliveryClean = bulletize(deliveryText.replace(/^■\s*지급\s*(및|&)\s*납기\s*\n*/i, "").trim());
    const warrantyClean = bulletize(warrantyText.replace(/^■\s*보증\s*(및|&)\s*책임\s*범위\s*\n*/i, "").trim());

    if (deliveryClean || warrantyClean) {
      y += 12;
      if (y > 700) { doc.addPage(); y = 50; }

      doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).stroke("#ccc");
      y += 6;

      const colGap = 15;
      const colW = (PAGE_WIDTH - colGap) / 2;
      const rightColX = PAGE_LEFT + colW + colGap;
      const termsTopY = y;

      doc.font("Bold").fontSize(7);
      const labelH = doc.heightOfString("■ 지급 및 납기", { width: colW });

      let leftBottomY = termsTopY;
      if (deliveryClean) {
        doc.font("Regular").fontSize(6.5);
        const contentH = doc.heightOfString(deliveryClean, { width: colW, lineGap: 0.5 });
        leftBottomY = termsTopY + labelH + 2 + contentH;
      }

      let rightBottomY = termsTopY;
      if (warrantyClean) {
        doc.font("Regular").fontSize(6.5);
        const contentH = doc.heightOfString(warrantyClean, { width: colW, lineGap: 0.5 });
        rightBottomY = termsTopY + labelH + 2 + contentH;
      }

      if (deliveryClean) {
        doc.font("Bold").fontSize(7).fillColor("#000");
        doc.text("■ 지급 및 납기", PAGE_LEFT, termsTopY, { width: colW });
        doc.font("Regular").fontSize(6.5).fillColor("#333");
        doc.text(deliveryClean, PAGE_LEFT, termsTopY + labelH + 2, { width: colW, lineGap: 0.5 });
      }

      if (warrantyClean) {
        doc.font("Bold").fontSize(7).fillColor("#000");
        doc.text("■ 보증 및 책임 범위", rightColX, termsTopY, { width: colW });
        doc.font("Regular").fontSize(6.5).fillColor("#333");
        doc.text(warrantyClean, rightColX, termsTopY + labelH + 2, { width: colW, lineGap: 0.5 });
      }

      y = Math.max(leftBottomY, rightBottomY);
    }

    const signBoxH = 35;
    const signHeaderH = 14;
    const footerBarH = 16;
    const signInset = 40;
    const signTotalH = signBoxH + signHeaderH + 10;

    if (y + signTotalH > 720) { doc.addPage(); y = 50; }
    y += 8;

    const signAreaW = PAGE_WIDTH - signInset * 2;
    const signGap = 12;
    const signW = (signAreaW - signGap) / 2;
    const signLeftX = PAGE_LEFT + signInset;
    const signRightX = signLeftX + signW + signGap;

    doc.rect(signLeftX, y, signW, signHeaderH).fill("#E8E8E8");
    doc.font("Bold").fontSize(7).fillColor("#000");
    doc.text("Buyer (Sign)", signLeftX, y + 3, { width: signW, align: "center" });

    doc.rect(signRightX, y, signW, signHeaderH).fill("#E8E8E8");
    doc.text("Seller (Sign)", signRightX, y + 3, { width: signW, align: "center" });

    const signBodyY = y + signHeaderH;
    doc.rect(signLeftX, signBodyY, signW, signBoxH).lineWidth(0.5).stroke("#999");
    doc.rect(signRightX, signBodyY, signW, signBoxH).lineWidth(0.5).stroke("#999");

    if (companyInfo) {
      const sellerName = companyInfo.companyName ? `${companyInfo.companyName}` : "";
      const sellerRep = companyInfo.representative ? `대표이사 ${companyInfo.representative}` : "";
      const sellerLine = [sellerName, sellerRep].filter(Boolean).join(" ");
      if (sellerLine) {
        doc.font("Regular").fontSize(6.5).fillColor("#000");
        doc.text(sellerLine, signRightX + 4, signBodyY + 3, { width: signW - 8, align: "center" });
      }

      if (companyInfo.signatureUrl) {
        const sigPath = path.join(process.cwd(), "server", "uploads", path.basename(companyInfo.signatureUrl));
        if (fs.existsSync(sigPath)) {
          try {
            const sigImgW = 40;
            const sigImgH = 18;
            const sigX = signRightX + 10;
            const sigY = signBodyY + 13;
            doc.image(sigPath, sigX, sigY, { width: sigImgW, height: sigImgH, fit: [sigImgW, sigImgH] });
          } catch (e) {}
        }
      }

      doc.font("Regular").fontSize(6.5).fillColor("#000");
      doc.text(fmtDate(quotation.quoteDate), signRightX + 4, signBodyY + 16, { width: signW - 8, align: "right" });
    }

    const pageBottom = 842 - 30;
    const footerY = pageBottom - footerBarH;
    doc.rect(PAGE_LEFT, footerY, PAGE_WIDTH, footerBarH).fill("#555");
    doc.font("Regular").fontSize(7).fillColor("#fff");
    const websiteUrl = companyInfo?.email ? `www.${companyInfo.email.split("@")[1]}` : "";
    if (websiteUrl) {
      doc.text(websiteUrl, PAGE_LEFT, footerY + 4, { width: PAGE_WIDTH, align: "center" });
    }

    const detColX = [50, 75, 165, 310, 355, 410, 470];
    const detColW = [25, 90, 145, 45, 55, 60, 75];
    const detHeaders = ["No", "품목", "규격", "수량", "단가", "금액", "비고"];

    let dy = 0;

    const renderDetailPageHeader = () => {
      doc.addPage();
      doc.font("Bold").fontSize(14).fillColor("#000");
      doc.text("품목 상세", PAGE_LEFT, 40);
      doc.font("Regular").fontSize(8).fillColor("#555");
      doc.text(`${quotation.quoteNumber}`, PAGE_LEFT + 120, 44);
      dy = 65;
      renderDetailTableHeader();
    };

    const renderDetailTableHeader = () => {
      doc.rect(50, dy, 495, 18).fill("#E8E8E8");
      doc.fillColor("#000").font("Bold").fontSize(8);
      detHeaders.forEach((h, i) => {
        doc.text(h, detColX[i], dy + 4, { width: detColW[i], align: i >= 3 ? "right" : "left" });
      });
      dy += 20;
    };

    const checkDetailPageBreak = (needed: number) => {
      if (dy + needed > 780) {
        doc.addPage();
        dy = 50;
        renderDetailTableHeader();
      }
    };

    renderDetailPageHeader();

    let detIdx = 0;

    const renderDetailRow = (item: QuotationItem) => {
      detIdx++;
      doc.font("Regular").fontSize(8);
      const specText = item.spec || "";
      const specH = specText ? doc.heightOfString(specText, { width: detColW[2] - 4 }) : 0;
      const minRowH = 16;
      const rowH = Math.max(minRowH, specH + 6);

      checkDetailPageBreak(rowH);
      if (detIdx % 2 === 0) {
        doc.rect(50, dy - 2, 495, rowH).fill("#FAFAFA");
      }
      doc.fillColor("#000").font("Regular").fontSize(8);
      doc.text(String(detIdx), detColX[0], dy, { width: detColW[0] });
      doc.text(item.itemName || "-", detColX[1], dy, { width: detColW[1] });
      if (specText) {
        doc.text(specText, detColX[2], dy, { width: detColW[2] - 4 });
      }
      doc.text(fmtNum(item.quantity), detColX[3], dy, { width: detColW[3], align: "right" });
      doc.text(fmtNum(item.unitPrice), detColX[4], dy, { width: detColW[4], align: "right" });
      doc.text(fmtNum(item.amount), detColX[5], dy, { width: detColW[5], align: "right" });
      dy += rowH;
    };

    for (const [cat, catItems] of grouped) {
      checkDetailPageBreak(16);
      doc.rect(50, dy - 2, 495, 16).fill("#F0F4F8");
      doc.fillColor("#333").font("Bold").fontSize(8);
      doc.text(cat, 55, dy, { width: 300 });
      dy += 18;

      for (const item of catItems) {
        renderDetailRow(item);
      }

      const catSubtotal = catItems.reduce((s, i) => s + (i.amount || 0), 0);
      checkDetailPageBreak(18);
      doc.font("Bold").fontSize(8).fillColor("#000");
      doc.text(`소계`, 310, dy, { width: 110, align: "right" });
      doc.text(`${fmtNum(catSubtotal)}원`, 420, dy, { width: 125, align: "right" });
      dy += 18;
      doc.font("Regular").fontSize(8);
    }

    if (adjustmentItems.length > 0) {
      checkDetailPageBreak(16);
      doc.rect(50, dy - 2, 495, 16).fill("#F0F4F8");
      doc.fillColor("#333").font("Bold").fontSize(8);
      doc.text("추가", 55, dy, { width: 300 });
      dy += 18;

      for (const item of adjustmentItems) {
        renderDetailRow(item);
      }

      const adjSubtotal = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
      checkDetailPageBreak(18);
      doc.font("Bold").fontSize(8).fillColor("#000");
      doc.text(`소계`, 310, dy, { width: 110, align: "right" });
      doc.text(`${fmtNum(adjSubtotal)}원`, 420, dy, { width: 125, align: "right" });
      dy += 18;
    }

    doc.end();
  });
}

export async function generateQuotationExcel(quotationId: string, inquiry: any): Promise<Buffer> {
  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");
  const { quotation, items } = result;

  const regularItems = items.filter(i => !i.isAdjustment);
  const adjustmentItems = items.filter(i => i.isAdjustment);

  const regularSubtotal = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
  const adjTotal = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
  const supplyAmount = regularSubtotal + adjTotal;

  const xlDiscountType = quotation.discountType || "amount";
  const xlDiscountValue = quotation.discountValue || 0;
  const xlDiscountTruncUnit = parseInt((quotation.discountTruncUnit as string) || "0") || 0;
  const xlDiscountAmount = xlDiscountValue > 0
    ? (xlDiscountType === "percent" ? Math.round(supplyAmount * xlDiscountValue / 100) : xlDiscountValue)
    : 0;
  let afterDiscount = supplyAmount - xlDiscountAmount;
  if (xlDiscountTruncUnit > 0 && xlDiscountAmount > 0) afterDiscount = Math.floor(afterDiscount / xlDiscountTruncUnit) * xlDiscountTruncUnit;
  const xlActualDiscount = supplyAmount - afterDiscount;
  const xlTruncLabel = xlDiscountTruncUnit === 1000000 ? "백만원절사" : xlDiscountTruncUnit === 100000 ? "십만원절사" : xlDiscountTruncUnit === 10000 ? "만원절사" : xlDiscountTruncUnit === 1000 ? "천원절사" : "";

  const tax = Math.round(afterDiscount * 0.1);
  const total = afterDiscount + tax;
  const grouped = groupByCategory(regularItems);

  const wb = new ExcelJS.Workbook();

  const infoSheet = wb.addWorksheet("견적정보");
  infoSheet.columns = [
    { header: "항목", key: "key", width: 20 },
    { header: "값", key: "value", width: 40 },
  ];

  const truncSuffix = xlTruncLabel ? ` (${xlTruncLabel})` : "";
  const discountTypeDesc = xlDiscountType === "percent" ? `${xlDiscountValue}%` : `${fmtNum(xlDiscountValue)}원`;
  const discountDesc = xlDiscountValue > 0
    ? `${discountTypeDesc} → ${fmtNum(xlActualDiscount)}원${truncSuffix}`
    : "-";

  infoSheet.addRows([
    { key: "견적번호", value: quotation.quoteNumber },
    { key: "견적일자", value: fmtDate(quotation.quoteDate) },
    { key: "유효기한", value: fmtDate(quotation.validUntil) },
    { key: "상태", value: quotation.status },
    { key: "", value: "" },
    { key: "고객사명", value: inquiry.snapshotCompanyName || inquiry.customerName || "" },
    { key: "담당자", value: inquiry.snapshotContactName || "" },
    { key: "연락처", value: inquiry.snapshotPhone || "" },
    { key: "이메일", value: inquiry.snapshotEmail || "" },
    { key: "주소", value: inquiry.snapshotAddress || "" },
    { key: "", value: "" },
    { key: "공급가액", value: supplyAmount },
    { key: "할인", value: discountDesc },
    { key: "할인금액", value: xlActualDiscount },
    { key: "부가세", value: tax },
    { key: "합계", value: total },
    { key: "", value: "" },
    { key: "비고", value: quotation.notes || "" },
  ]);
  infoSheet.getRow(1).font = { bold: true };

  const itemSheet = wb.addWorksheet("품목목록");
  itemSheet.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "카테고리", key: "category1", width: 15 },
    { header: "품목코드", key: "itemCode", width: 15 },
    { header: "품목명", key: "itemName", width: 30 },
    { header: "사양", key: "spec", width: 25 },
    { header: "수량", key: "quantity", width: 10 },
    { header: "원가", key: "costPrice", width: 12 },
    { header: "판매단가", key: "unitPrice", width: 15 },
    { header: "금액", key: "amount", width: 15 },
    { header: "마진율(%)", key: "margin", width: 12 },
  ];

  let rowIdx = 0;
  for (const [cat, catItems] of grouped) {
    for (const item of catItems) {
      rowIdx++;
      const cost = item.costPrice || 0;
      const marginRate = item.unitPrice > 0 && cost > 0
        ? Math.round(((item.unitPrice - cost) / item.unitPrice) * 100)
        : 0;
      itemSheet.addRow({
        no: rowIdx,
        category1: item.category1 || "",
        itemCode: item.itemCode || "",
        itemName: item.itemName,
        spec: item.spec || "",
        quantity: item.quantity,
        costPrice: cost,
        unitPrice: item.unitPrice,
        amount: item.amount,
        margin: marginRate,
      });
    }
    const catSubtotal = catItems.reduce((s, i) => s + (i.amount || 0), 0);
    const catCostTotal = catItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
    const subtotalRow = itemSheet.addRow({
      no: "",
      category1: "",
      itemCode: "",
      itemName: `[${cat} 소계]`,
      spec: "",
      quantity: "",
      costPrice: catCostTotal,
      unitPrice: "",
      amount: catSubtotal,
      margin: "",
    });
    subtotalRow.font = { bold: true };
    subtotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
  }

  if (adjustmentItems.length > 0) {
    for (const item of adjustmentItems) {
      rowIdx++;
      const cost = item.costPrice || 0;
      const marginRate = item.unitPrice > 0 && cost > 0
        ? Math.round(((item.unitPrice - cost) / item.unitPrice) * 100)
        : 0;
      itemSheet.addRow({
        no: rowIdx,
        category1: "추가",
        itemCode: item.itemCode || "",
        itemName: item.itemName,
        spec: item.spec || "",
        quantity: item.quantity,
        costPrice: cost,
        unitPrice: item.unitPrice,
        amount: item.amount,
        margin: marginRate,
      });
    }
    const adjSubRow = itemSheet.addRow({
      no: "",
      category1: "",
      itemCode: "",
      itemName: "[추가 항목 소계]",
      spec: "",
      quantity: "",
      costPrice: adjustmentItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0),
      unitPrice: "",
      amount: adjTotal,
      margin: "",
    });
    adjSubRow.font = { bold: true };
    adjSubRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
  }

  itemSheet.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function exportQuotationToOneDrive(quotationId: string, inquiryId: string): Promise<{ message: string }> {
  const inquiry = await storage.getInquiry(inquiryId);
  if (!inquiry) throw new Error("인콰이어리를 찾을 수 없습니다");
  if (!inquiry.onedriveFolderId) throw new Error("OneDrive 폴더가 연결되지 않은 인콰이어리입니다");

  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");

  const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
  const date = fmtDate(result.quotation.quoteDate).replace(/-/g, "");

  const [pdfBuf, xlsxBuf] = await Promise.all([
    generateQuotationPDF(quotationId, inquiry),
    generateQuotationExcel(quotationId, inquiry),
  ]);

  const pdfName = `견적서_${safeNumber}_${date}.pdf`;
  const xlsxName = `견적서_${safeNumber}_${date}.xlsx`;

  await Promise.all([
    uploadFileToFolder(inquiry.onedriveFolderId, pdfName, pdfBuf),
    uploadFileToFolder(inquiry.onedriveFolderId, xlsxName, xlsxBuf),
  ]);

  return { message: `${pdfName}, ${xlsxName} 파일이 OneDrive에 저장되었습니다` };
}
