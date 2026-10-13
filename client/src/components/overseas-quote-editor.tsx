// 해외(USD) 견적 전용 부품 — 품목 표는 국내 견적 화면(ItemsTab)을 그대로 쓰고,
// 여기서는 환율·조건 입력줄과 USD 합계만 담당한다.
// USD 단가 = 원화 기준가 ÷ 적용환율(기준환율 × (1 − 안전율)), 센트 미만 절사
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Quotation, QuotationItem } from "@shared/schema";
import { num, fmtUsd, calcAppliedRate } from "@shared/fx";

function fmtKrw(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

// 포커스를 잃거나 Enter일 때만 저장하는 입력칸
function CellInput({ value, onCommit, disabled, align = "right", placeholder }: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      disabled={disabled}
      placeholder={placeholder}
      className={`h-7 text-xs px-1.5 ${align === "right" ? "text-right" : ""}`}
    />
  );
}

export const parseNum = (s: string) => {
  const n = parseFloat(s.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function UsdRateBar({ quotation, isLocked }: { quotation: Quotation; isLocked: boolean }) {
  const { toast } = useToast();
  const patchQuote = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("PATCH", `/api/quotations/${quotation.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", quotation.inquiryId, "quotations"] });
    },
    onError: (e: Error) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const baseRate = num(quotation.baseRate);
  const safety = num(quotation.safetyMargin);
  const applied = num(quotation.appliedRate) || calcAppliedRate(baseRate, safety);

  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="space-y-1">
          <div className="text-muted-foreground">기준 환율 (KRW/USD)</div>
          <CellInput value={baseRate ? String(baseRate) : ""} placeholder="견적일 환율" disabled={isLocked}
            onCommit={v => patchQuote.mutate({ baseRate: parseNum(v) })} />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">안전율 (%)</div>
          <CellInput value={String(safety)} disabled={isLocked}
            onCommit={v => patchQuote.mutate({ safetyMargin: parseNum(v) })} />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">적용 환율</div>
          <div className="h-7 flex items-center justify-end px-1.5 rounded-md bg-background border font-medium" data-testid="text-applied-rate">
            {applied ? applied.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "-"}
          </div>
        </div>
        <div className="text-muted-foreground leading-snug pt-0.5">
          USD 단가 = 원화 기준가 ÷ 적용 환율<br />센트 미만 절사. 환율을 바꾸면 전 품목을 다시 계산합니다.
        </div>
      </div>
      {!baseRate && (
        <div className="text-xs text-amber-700 dark:text-amber-400">기준 환율을 먼저 입력하세요. 환율이 없으면 USD 단가가 자동 계산되지 않습니다.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="space-y-1">
          <div className="text-muted-foreground">Lead time</div>
          <CellInput align="left" value={quotation.leadTime || ""} placeholder="6 weeks" disabled={isLocked}
            onCommit={v => patchQuote.mutate({ leadTime: v || null })} />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground" title="EXW면 고객 특송계정 픽업 문구가 견적서에 자동으로 들어갑니다">Delivery (Incoterms)</div>
          <CellInput align="left" value={quotation.incoterms || ""} placeholder="EXW Hwaseong, Korea (buyer's courier account)" disabled={isLocked}
            onCommit={v => patchQuote.mutate({ incoterms: v || null })} />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">Payment term</div>
          <CellInput align="left" value={quotation.paymentTermsEn || ""} placeholder="30% down payment, 70% before shipping" disabled={isLocked}
            onCommit={v => patchQuote.mutate({ paymentTermsEn: v || null })} />
        </div>
      </div>
    </div>
  );
}

// 국내 견적의 공급가액/부가세/합계 자리에 해당하는 USD 합계
export function UsdTotals({ items }: { items: QuotationItem[] }) {
  const subtotal = Math.round(items.reduce((s, i) => s + num(i.amountFx), 0) * 100) / 100;
  const krwTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const costTotal = items.filter(i => !i.isAdjustment).reduce((s, i) => s + (i.costPrice || 0) * i.quantity, 0);
  const marginPct = krwTotal > 0 ? Math.round(((krwTotal - costTotal) / krwTotal) * 100) : 0;
  return (
    <div className="border rounded-md p-4 space-y-1.5 text-sm">
      <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">$ {fmtUsd(subtotal)}</span></div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>원가 {fmtKrw(costTotal)}원 · 원화 환산(기준환율) {fmtKrw(krwTotal)}원</span>
        <span>마진 {fmtKrw(krwTotal - costTotal)}원 ({marginPct}%)</span>
      </div>
      <div className="flex justify-between text-muted-foreground"><span>Tax (수출 영세)</span><span>$ -</span></div>
      <div className="flex justify-between border-t pt-2">
        <span className="font-semibold">Total (USD)</span>
        <span className="font-bold text-xl" data-testid="text-usd-total">$ {fmtUsd(subtotal)}</span>
      </div>
    </div>
  );
}
