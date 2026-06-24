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

  if (cat.includes("가지급") || /가지급/.test(text)) return "가지급금";
  if (cat.includes("대출") || /대출|이자|원금상환|보증기금/.test(text)) return "금융";
  if (cat.includes("세금") || /부가세|법인세|원천세|근로소득세|지방세|국세|관세|세관/.test(text)) return "세금";
  if (/급여|인건|4대보험|사회보험/.test(text)) return "인건비";
  if (/임대료|관리비|통신비|전화|인터넷|기장료|세무|월정액|구독|유플러스|엘지유플러스/.test(text)) return "정기운영비";
  // 명시적 카드 거래
  if (/카드|승인출금|마스타|체크카드|KB체크|국민카드|삼성카드|신한카드|현대카드|하나카드|비자|VISA/i.test(text)) return "카드";

  // 지출 중 가맹점 결제(카드·경비) — 은행엔 가맹점명만 찍히고 결제수단 정보가 없어, 패턴으로 추정
  const isExpense = e.type !== "income";
  if (isExpense && (
    /커피|카페|coffee|스타벅스|스벅|이디야|할리스|투썸|메가커피|컴포즈|빽다방|커피빈|폴바셋|매머드|투비|cuppa|커파|던킨|베이커리|파리바게|뚜레쥬르/i.test(text) ||
    /씨유|CU\)|지에스25|GS25|이마트24|세븐일레븐|미니스톱|편의점/i.test(text) ||
    /주유소|석유|칼텍스|S-OIL|에쓰오일/i.test(text) ||
    /하이패스|티머니|택시|고속도로|휴게소/i.test(text) ||
    /우아한형제들|배달의민족|요기요|쿠팡이츠|배달/i.test(text) ||
    /국밥|국수|쌀국수|짬뽕|찌개|부대찌개|육개장|비빔|김밥|분식|도시락|치킨|피자|버거|곱창|삼겹|돈까스|우동|라멘|초밥|뷔페|맛집/i.test(text)
  )) return "카드";

  if (e.type === "income") return "수금";
  // 명시적 매입계산서 연결이면 매입, 그 외 지출은 기본 매입(=업체 송금) 버킷
  return "매입";
}

// 간소화 카테고리 — 화면 표시용. 인건비·정기운영비·세금·금융을 "정기" 하나로 통일.
export type SimpleCashCategory = "수금" | "매입" | "정기" | "카드" | "가지급금" | "기타";
export const SIMPLE_CASH_CATEGORIES: SimpleCashCategory[] = ["수금", "매입", "정기", "카드", "가지급금", "기타"];
export function simplifyCategory(c: CashCategory): SimpleCashCategory {
  if (c === "인건비" || c === "정기운영비" || c === "세금" || c === "금융") return "정기";
  if (c === "수금" || c === "매입" || c === "카드" || c === "가지급금") return c;
  return "기타";
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
