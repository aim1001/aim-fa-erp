// 해외(USD) 견적 전용 부품 — 품목 표·가격(네고·절사·납기·비고)은 국내 견적 화면을 그대로 쓰고,
// 여기서는 환율·안전율 입력줄만 담당한다. 결제조건·계약내용은 인콰이어리 계약조건을 번역해 쓴다.
// USD 단가 = 원화 기준가 ÷ 적용환율(기준환율 × (1 − 안전율)), 센트 미만 절사
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Quotation } from "@shared/schema";
import { num, calcAppliedRate } from "@shared/fx";


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
    </div>
  );
}
