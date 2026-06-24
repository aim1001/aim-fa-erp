import { deriveCashCategory, type CashCategory, type CashCategoryInput, type SimpleCashCategory } from "@shared/cash-category";

// 간소화 카테고리 → 행 배경/왼쪽막대/라벨색 (예정 행 강조용)
export const SIMPLE_CAT_STYLE: Record<SimpleCashCategory, { label: string; bar: string; bg: string; text: string }> = {
  수금:    { label: "수금",   bar: "border-l-green-500",  bg: "bg-green-50/70 dark:bg-green-950/25",   text: "text-green-700 dark:text-green-400" },
  매입:    { label: "매입",   bar: "border-l-slate-400",  bg: "bg-slate-50/70 dark:bg-slate-900/40",   text: "text-slate-600 dark:text-slate-300" },
  정기:    { label: "정기",   bar: "border-l-blue-500",   bg: "bg-blue-50/70 dark:bg-blue-950/25",     text: "text-blue-700 dark:text-blue-400" },
  카드:    { label: "카드",   bar: "border-l-amber-500",  bg: "bg-amber-50/70 dark:bg-amber-950/25",   text: "text-amber-700 dark:text-amber-400" },
  가지급금: { label: "가지급", bar: "border-l-violet-500", bg: "bg-violet-50/70 dark:bg-violet-950/25", text: "text-violet-700 dark:text-violet-400" },
  기타:    { label: "기타",   bar: "border-l-gray-300 dark:border-l-gray-700", bg: "bg-muted/40",      text: "text-muted-foreground" },
};

// 용도(카테고리)별 고유 색 + 표시 라벨. neutral 뭉침을 없애 카드/매입/가지급금이 구분되게 한다.
export const CAT_STYLE: Record<CashCategory, { label: string; cls: string }> = {
  수금:    { label: "수금",   cls: "bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800" },
  매입:    { label: "매입",   cls: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600" },
  인건비:  { label: "인건비", cls: "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800" },
  세금:    { label: "세금",   cls: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" },
  금융:    { label: "금융",   cls: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800" },
  정기운영비: { label: "정기", cls: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" },
  카드:    { label: "카드",   cls: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800" },
  가지급금: { label: "가지급", cls: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 dark:border-fuchsia-800" },
  기타:    { label: "기타",   cls: "bg-muted text-muted-foreground border-border" },
};

export function categoryOf(e: CashCategoryInput): CashCategory {
  return deriveCashCategory(e);
}

/** 용도 칩 — 색+글자로 한눈에 구분 */
export function CategoryChip({ category, className = "" }: { category: CashCategory; className?: string }) {
  const s = CAT_STYLE[category] || CAT_STYLE.기타;
  return (
    <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}
