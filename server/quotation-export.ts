import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
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
    const cat = item.category1 || "기타";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return map;
}

export async function generateQuotationPDF(quotationId: string, inquiry: any): Promise<Buffer> {
  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");
  const { quotation, items } = result;

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const adjustment = quotation.adjustmentAmount || 0;
  const adjustedSubtotal = subtotal + adjustment;
  const tax = Math.round(adjustedSubtotal * 0.1);
  const total = adjustedSubtotal + tax;
  const grouped = groupByCategory(items);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold", FONT_BOLD);

    doc.font("Bold").fontSize(22).text("견 적 서", { align: "center" });
    doc.moveDown(0.5);
    doc.font("Regular").fontSize(9).fillColor("#666")
      .text(`견적번호: ${quotation.quoteNumber}    견적일자: ${fmtDate(quotation.quoteDate)}    유효기한: ${fmtDate(quotation.validUntil)}`, { align: "center" });
    doc.moveDown(1);

    doc.font("Bold").fontSize(11).fillColor("#000").text("수신");
    doc.moveDown(0.3);
    doc.font("Regular").fontSize(10);
    doc.text(`회사명: ${inquiry.snapshotCompanyName || inquiry.customerName || "-"}`);
    if (inquiry.snapshotContactName) doc.text(`담당자: ${inquiry.snapshotContactName}`);
    if (inquiry.snapshotPhone) doc.text(`연락처: ${inquiry.snapshotPhone}`);
    if (inquiry.snapshotEmail) doc.text(`이메일: ${inquiry.snapshotEmail}`);
    if (inquiry.snapshotAddress) doc.text(`주소: ${inquiry.snapshotAddress}`);
    doc.moveDown(0.5);

    doc.font("Bold").fontSize(12).text(`합계 금액: ${fmtNum(total)}원 (부가세 포함)`);
    doc.moveDown(0.8);

    const tableTop = doc.y;
    const colX = [50, 75, 150, 310, 365, 420, 480];
    const colW = [25, 75, 160, 55, 55, 60, 65];
    const headers = ["No", "품목코드", "품목명/사양", "수량", "단가", "금액", "비고"];

    doc.rect(50, tableTop, 495, 20).fill("#E8E8E8");
    doc.fillColor("#000").font("Bold").fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop + 5, { width: colW[i], align: i >= 3 ? "right" : "left" });
    });

    let y = tableTop + 22;
    let globalIdx = 0;

    for (const [cat, catItems] of grouped) {
      if (y > 730) { doc.addPage(); y = 50; }
      doc.rect(50, y - 2, 495, 16).fill("#F0F4F8");
      doc.fillColor("#333").font("Bold").fontSize(8);
      doc.text(cat, 55, y, { width: 300 });
      y += 18;

      doc.font("Regular").fontSize(8).fillColor("#000");
      for (const item of catItems) {
        if (y > 750) { doc.addPage(); y = 50; }
        globalIdx++;
        const rowH = 16;
        if (globalIdx % 2 === 0) {
          doc.rect(50, y - 2, 495, rowH).fill("#FAFAFA");
          doc.fillColor("#000");
        }
        doc.text(String(globalIdx), colX[0], y, { width: colW[0] });
        doc.text(item.itemCode || "-", colX[1], y, { width: colW[1] });
        const nameSpec = item.spec ? `${item.itemName} (${item.spec})` : item.itemName;
        doc.text(nameSpec, colX[2], y, { width: colW[2] });
        doc.text(fmtNum(item.quantity), colX[3], y, { width: colW[3], align: "right" });
        doc.text(fmtNum(item.unitPrice), colX[4], y, { width: colW[4], align: "right" });
        doc.text(fmtNum(item.amount), colX[5], y, { width: colW[5], align: "right" });
        y += rowH;
      }

      const catSubtotal = catItems.reduce((s, i) => s + (i.amount || 0), 0);
      if (y > 750) { doc.addPage(); y = 50; }
      doc.font("Bold").fontSize(8);
      doc.text(`소계`, 310, y, { width: 110, align: "right" });
      doc.text(`${fmtNum(catSubtotal)}원`, 420, y, { width: 125, align: "right" });
      y += 18;
      doc.font("Regular").fontSize(8);
    }

    y += 5;
    doc.moveTo(50, y).lineTo(545, y).stroke("#ccc");
    y += 10;

    doc.font("Regular").fontSize(9);
    doc.text(`공급가액:`, 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(subtotal)}원`, 465, y, { width: 80, align: "right" });
    y += 15;

    if (adjustment !== 0) {
      const adjLabel = adjustment < 0 ? "할인:" : "추가:";
      doc.text(`${adjLabel}`, 360, y, { width: 100, align: "right" });
      doc.text(`${fmtNum(adjustment)}원`, 465, y, { width: 80, align: "right" });
      y += 15;
      if (quotation.adjustmentNote) {
        doc.fontSize(8).fillColor("#666").text(`(${quotation.adjustmentNote})`, 360, y, { width: 185, align: "right" });
        doc.fillColor("#000").fontSize(9);
        y += 15;
      }
      doc.text(`조정 후 공급가액:`, 360, y, { width: 100, align: "right" });
      doc.text(`${fmtNum(adjustedSubtotal)}원`, 465, y, { width: 80, align: "right" });
      y += 15;
    }

    doc.text(`부가세(10%):`, 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(tax)}원`, 465, y, { width: 80, align: "right" });
    y += 15;
    doc.font("Bold").fontSize(10);
    doc.text(`합계:`, 360, y, { width: 100, align: "right" });
    doc.text(`${fmtNum(total)}원`, 465, y, { width: 80, align: "right" });

    if (quotation.notes) {
      y += 30;
      doc.font("Bold").fontSize(10).text("비고", 50, y);
      y += 15;
      doc.font("Regular").fontSize(9).text(quotation.notes, 50, y, { width: 495 });
    }

    doc.end();
  });
}

export async function generateQuotationExcel(quotationId: string, inquiry: any): Promise<Buffer> {
  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");
  const { quotation, items } = result;

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const adjustment = quotation.adjustmentAmount || 0;
  const adjustedSubtotal = subtotal + adjustment;
  const tax = Math.round(adjustedSubtotal * 0.1);
  const total = adjustedSubtotal + tax;
  const grouped = groupByCategory(items);

  const wb = new ExcelJS.Workbook();

  const infoSheet = wb.addWorksheet("견적정보");
  infoSheet.columns = [
    { header: "항목", key: "key", width: 20 },
    { header: "값", key: "value", width: 40 },
  ];
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
    { key: "공급가액", value: subtotal },
    { key: "가격조정", value: adjustment },
    { key: "조정사유", value: quotation.adjustmentNote || "" },
    { key: "조정후공급가액", value: adjustedSubtotal },
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
