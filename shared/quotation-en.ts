// 영문(USD) 견적서 문구 — 회사 설정에서 비워두면 기본값을 쓴다 (2024 A24-04 양식 기준)
export const DEFAULT_HEADER_EN = [
  "AIM company",
  "A-#1212, Geumgang Penterium iX tower,",
  "27 Dongtancheomdansaneop 1-ro, Hwaseong-si,",
  "Gyeonggi-do, ZIP : 18469",
  "Tel : 82-31-548-0748  Fax : 82-70-8299-0749",
  "E-Mail : houns9@aim-fa.com",
  "Vat code : 370-87-00308",
].join("\n");

export const DEFAULT_TERMS_EN = [
  "This quotation may be accepted to form a binding contract upon any one of the following options:",
  "a. Signature below and payment to AIM company for the items listed in this quote prior to the expiration date.",
  "b. Issuance of a purchase order to AIM company referencing this quote and the terms and conditions herein prior to the expiration date above.",
].join("\n");

// 새 해외 견적 기본값. 배송은 고객이 자기 특송 계정으로 픽업하도록(EXW) 유도한다.
export const DEFAULT_LEAD_TIME = "6 weeks";
export const DEFAULT_INCOTERMS = "EXW Hwaseong, Korea (buyer's courier account)";
export const DEFAULT_PAYMENT_TERMS_EN = "30% down payment at order confirmation, 70% before shipping (T/T)";

// 견적서 하단 납기·픽업 문구 (인도조건·결제조건 자체는 결제조건 표에 표시)
export function deliveryTermsEn(q: { leadTime?: string | null; incoterms?: string | null }): string[] {
  const lines: string[] = [];
  const exw = !q.incoterms || /^EXW/i.test(q.incoterms.trim());
  if (q.leadTime) {
    lines.push(exw
      ? `Goods will be ready for pickup within ${q.leadTime} after AIM company's receipt of payment.`
      : `Delivery will be made within ${q.leadTime} after AIM company's receipt of payment.`);
  }
  if (exw) {
    lines.push("Pickup is to be arranged by the buyer using its own courier account (UPS / DHL / FedEx) or forwarder. Please provide your account number with the order.");
    lines.push("Freight, insurance, import duties and taxes are for the buyer's account.");
  }
  return lines;
}
