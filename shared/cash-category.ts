// 자금계획 구분(카테고리) 분류 — 클라이언트/서버 공용
// 한 현금이벤트(payment 또는 은행거래에서 정규화한 입력)를 자금 카테고리로 분류한다.

export type CashCategory =
  | "수금"
  | "매입"
  | "인건비"
  | "세금"
  | "금융"
  | "정기운영비"
  | "카드"
  | "가지급금"
  | "기타";

export const CASH_CATEGORIES: CashCategory[] = [
  "수금", "매입", "인건비", "세금", "금융", "정기운영비", "카드", "가지급금", "기타",
];

export interface CashCategoryInput {
  type?: string | null;            // 'income' | 'expense'
  category?: string | null;        // payments.category / recurring.category
  companyName?: string | null;
  description?: string | null;
  salesInvoiceId?: string | null;
  purchaseInvoiceId?: string | null;
  recurringExpenseId?: string | null;
}

export function deriveCashCategory(e: CashCategoryInput): CashCategory {
  const text = `${e.companyName || ""} ${e.description || ""} ${e.category || ""}`;
  const cat = e.category || "";

  if (cat.includes("가지급")) return "가지급금";
  if (cat.includes("대출") || /대출|이자|원금상환|보증기금/.test(text)) return "금융";
  if (cat.includes("세금") || /부가세|법인세|원천세|근로소득세|지방세|국세|관세|세관/.test(text)) return "세금";
  if (/급여|인건|4대보험|사회보험/.test(text)) return "인건비";
  if (/임대료|관리비|통신비|전화|인터넷|기장료|세무|월정액|구독|유플러스|엘지유플러스/.test(text)) return "정기운영비";
  if (/카드|승인출금|마스타|체크카드|KB체크|국민카드|삼성카드|신한카드|현대카드|하나카드|비자/.test(text)) return "카드";

  if (e.type === "income") return "수금";
  // 명시적 매입계산서 연결이면 매입, 그 외 지출은 기본 매입(=업체 송금) 버킷
  return "매입";
}

// 카테고리별 표시 색 키(UI에서 매핑) — 의미 기반
export function cashCategoryTone(c: CashCategory): "income" | "expense" | "recurring" | "tax" | "finance" | "neutral" {
  switch (c) {
    case "수금": return "income";
    case "세금": return "tax";
    case "금융": return "finance";
    case "인건비":
    case "정기운영비": return "recurring";
    case "매입":
    case "카드":
    case "가지급금":
    case "기타":
    default: return "neutral";
  }
}
