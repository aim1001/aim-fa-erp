// 영문(USD) 견적서 문구 — 국내 견적서와 같은 입력(납기 일수·계약조건 비율·계약내용·비고)을 영어로 출력한다.
// 회사 설정에서 비워두면 아래 기본값을 쓴다.
export const DEFAULT_HEADER_EN = [
  "AIM company",
  "A-#1212, Geumgang Penterium iX tower,",
  "27 Dongtancheomdansaneop 1-ro, Hwaseong-si,",
  "Gyeonggi-do, ZIP : 18469",
  "Tel : 82-31-548-0748  Fax : 82-70-8299-0749",
  "E-Mail : houns9@aim-fa.com",
  "Vat code : 370-87-00308",
].join("\n");

// 해외 인콰이어리 계약내용 기본값 (국내 "■ 지급 및 납기 / ■ 보증 및 책임 범위" 구조와 같음).
// 배송은 고객이 자기 특송 계정으로 픽업하도록(EXW) 유도한다.
export const DEFAULT_CONTRACT_EN = [
  "■ Delivery & Payment",
  "- Delivery term: EXW Hwaseong, Korea.",
  "- Pickup is to be arranged by the buyer using its own courier account (UPS / DHL / FedEx) or forwarder. Please provide your account number with the order.",
  "- Freight, insurance, import duties and taxes are for the buyer's account.",
  "- This quotation may be accepted by signing below and paying, or by issuing a purchase order referencing this quote, prior to the expiration date.",
  "■ Warranty & Liability",
  "- Warranty: 12 months from the date of shipment.",
  "- The warranty does not cover damage caused by misuse, unauthorized modification or improper installation.",
].join("\n");

// 해외 견적 비고 기본값 (국내 [제외사항]/[기술지원] 템플릿의 영문판)
export const DEFAULT_NOTES_EN = [
  "[Exclusions]",
  "- On-site installation, wiring and integration with existing equipment",
  "- Customs clearance, import duties and local taxes",
  "",
  "[Technical support]",
  "- Remote support (online) for setup and operation",
  "- On-site support is quoted separately",
].join("\n");

// 결제조건 번역 (인콰이어리 계약조건의 국내 시기 코드 → 영문)
const TIMING_EN: Record<string, (days?: number | null) => string> = {
  end_of_next_month: () => "end of the following month",
  two_weeks: () => "within 2 weeks",
  end_of_month: () => "end of the month",
  specific_days: (d) => (d ? `${d} days` : "on agreed date"),
  within_days: (d) => (d ? `within ${d} days` : "within agreed days"),
};

export function paymentTimingEn(type: string | null | undefined, days: number | null | undefined, afterDelivery?: string | null): string {
  if (!type) return "";
  const label = (TIMING_EN[type] || (() => type))(days);
  const base = afterDelivery === "true" || afterDelivery === "yes" ? "after delivery" : "after order confirmation";
  return `${label} ${base}`;
}

export const PAYMENT_STAGE_EN = { contract: "Down payment", mid: "Interim", final: "Balance" } as const;

export function leadTimeEn(days: number | null | undefined): string {
  return days ? `${days} days after order confirmation` : "-";
}
