// 해외(USD) 견적 금액 규칙 — 서버 저장값과 화면 미리보기가 같은 계산을 쓰도록 공용으로 둔다.
// 모든 USD 금액은 센트(정수)로 계산한 뒤 센트 미만은 절사한다.

export const DEFAULT_SAFETY_MARGIN = 3;

// numeric 컬럼은 문자열로 오므로 숫자로 정규화
export function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// 적용환율 = 기준환율 × (1 − 안전율%). 환율을 낮게 잡아 USD 단가에 안전마진을 얹는다.
export function calcAppliedRate(baseRate: number, safetyMargin: number): number {
  if (!(baseRate > 0)) return 0;
  return Math.round(baseRate * (1 - safetyMargin / 100) * 10000) / 10000;
}

// 원화 기준가 → USD 단가 (센트 미만 절사)
export function krwToUsd(krw: number, appliedRate: number): number {
  if (!(appliedRate > 0) || !krw) return 0;
  return Math.floor((krw / appliedRate) * 100 + 1e-9) / 100;
}

// 품목 금액 = 단가 × 수량 × (1 − 할인율%), 센트 미만 절사
export function usdLineAmount(unitPriceFx: number, quantity: number, discountRate: number): number {
  const cents = Math.round(unitPriceFx * 100) * (quantity || 0) * (100 - (discountRate || 0)) / 100;
  return Math.floor(cents + 1e-6) / 100;
}

// USD 금액의 원화 환산(내부 마진·인콰이어리 판매가용). 안전율을 빼기 전 기준환율로 환산한다.
export function usdToKrw(usd: number, baseRate: number): number {
  return Math.round(usd * (baseRate || 0));
}

export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// DB numeric 컬럼에 넣을 문자열
export function toNumericStr(n: number, digits = 2): string {
  return n.toFixed(digits);
}
