// 해외(USD) 견적 Excel. PDF는 국내 양식을 번역해 quotation-export.ts에서 함께 만든다.
import ExcelJS from "exceljs";
import { storage } from "./storage";
import { num } from "@shared/fx";

async function loadContext(quotationId: string) {
  const result = await storage.getQuotationWithItems(quotationId);
  if (!result) throw new Error("견적서를 찾을 수 없습니다");
  const items = [...result.items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const subtotal = items.reduce((s, i) => s + num(i.amountFx), 0);
  return { quotation: result.quotation, items, subtotal: Math.round(subtotal * 100) / 100 };
}

export async function generateQuotationExcelEn(quotationId: string, inquiry: any): Promise<Buffer> {
  const { quotation, items, subtotal } = await loadContext(quotationId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quotation");
  ws.columns = [
    { header: "Name", key: "name", width: 22 },
    { header: "Description", key: "desc", width: 40 },
    { header: "Price (USD)", key: "price", width: 14 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "", key: "label", width: 14 },
    { header: "Total (USD)", key: "total", width: 14 },
    { header: "KRW base", key: "krw", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const it of items) {
    ws.addRow({
      name: it.itemName,
      desc: it.spec || "",
      price: num(it.unitPriceFx),
      qty: it.quantity,
      total: num(it.amountFx),
      krw: it.unitPrice,
    });
  }
  ws.addRow({});
  const discount = num(quotation.discountValueFx);
  const total = Math.round((subtotal - discount) * 100) / 100;
  ws.addRow({ label: "Subtotal", total: subtotal });
  if (discount > 0) ws.addRow({ label: "Discount", total: -discount });
  ws.addRow({ label: "Total (USD)", total }).font = { bold: true };
  ws.addRow({});
  ws.addRow({ name: "Quote No", desc: quotation.quoteNumber });
  ws.addRow({ name: "Lead time (days)", desc: quotation.deliveryDays || "" });
  ws.addRow({ name: "Base rate (KRW/USD)", desc: num(quotation.baseRate) || "" });
  ws.addRow({ name: "Safety margin (%)", desc: num(quotation.safetyMargin) });
  ws.addRow({ name: "Applied rate", desc: num(quotation.appliedRate) || "" });
  for (const col of ["price", "total"]) ws.getColumn(col).numFmt = "#,##0.00";
  ws.getColumn("krw").numFmt = "#,##0";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
