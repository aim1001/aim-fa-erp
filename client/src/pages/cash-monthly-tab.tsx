import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CASH_CATEGORIES, type CashCategory } from "@shared/cash-category";

type MonthRow = {
  ym: string;
  opening: number;
  income: Record<string, number>;
  expense: Record<string, number>;
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  closing: number;
};
type Summary = { currentBalance: number; months: MonthRow[] };

const fmt = (n: number | null | undefined) => (n || n === 0 ? Number(Math.round(n)).toLocaleString() : "-");
const LOW_BALANCE = 10000000; // 1천만 미만 경고

const INCOME_CATS: CashCategory[] = ["수금", "기타"];
const EXPENSE_CATS = CASH_CATEGORIES.filter(c => c !== "수금");

export function CashMonthlyTab({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const from = `${year}-${String(month).padStart(2, "0")}`;
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ["/api/cash-flow/monthly-summary", from, 4],
    queryFn: async () => {
      const res = await fetch(`/api/cash-flow/monthly-summary?from=${from}&months=4`);
      return res.json();
    },
  });

  // 현재월~+3개월 정기지출 자동 생성(멱등). 미래 예정 칸을 채운다.
  const projectMutation = useMutation({
    mutationFn: async () => {
      let total = 0;
      for (let i = 0; i < 4; i++) {
        const d = new Date(year, month - 1 + i, 1);
        const res = await apiRequest("POST", `/api/recurring-expenses/generate?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
        const j = await res.json().catch(() => ({}));
        total += j.created || 0;
      }
      return total;
    },
    onSuccess: (total: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-flow/monthly-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "정기지출 반영 완료", description: total > 0 ? `${total}건 생성` : "이미 모두 반영됨" });
    },
    onError: (e: Error) => toast({ title: "반영 실패", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  if (!data || !data.months?.length) return <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>;

  const months = data.months;
  const incCats = INCOME_CATS.filter(c => months.some(m => (m.income[c] || 0) !== 0));
  const expCats = (EXPENSE_CATS as string[]).filter(c => months.some(m => (m.expense[c] || 0) !== 0));

  const closingTone = (v: number) =>
    v < 0 ? "text-red-600 dark:text-red-400" : v < LOW_BALANCE ? "text-amber-600 dark:text-amber-400" : "";

  return (
    <div className="space-y-3" data-testid="cash-monthly-tab">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-muted-foreground">현재 총 잔고</span>
        <span className="font-semibold text-base">{fmt(data.currentBalance)}원</span>
        <span className="text-xs text-muted-foreground">· {from}부터 4개월 (현재월 + 앞으로 3개월)</span>
        <Button
          variant="outline" size="sm" className="h-7 text-xs ml-auto"
          onClick={() => projectMutation.mutate()}
          disabled={projectMutation.isPending}
          data-testid="button-project-recurring"
          title="현재월~+3개월의 정기지출(급여·세금·대출 등)을 예정으로 자동 생성"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${projectMutation.isPending ? "animate-spin" : ""}`} />
          정기지출 반영
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2.5 px-3 font-medium">구분</th>
              {months.map((m, i) => (
                <th key={m.ym} className="text-right py-2.5 px-3 font-medium whitespace-nowrap">
                  {m.ym}
                  <div className={`text-[10px] font-normal ${i === 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                    {i === 0 ? "현재·실적+예정" : "예정"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 px-3 text-muted-foreground">기초잔고</td>
              {months.map(m => <td key={m.ym} className="py-2 px-3 text-right text-muted-foreground">{fmt(m.opening)}</td>)}
            </tr>

            <tr className="bg-green-50/60 dark:bg-green-950/20"><td colSpan={months.length + 1} className="py-1.5 px-3 text-xs font-medium text-green-700 dark:text-green-400">수입</td></tr>
            {incCats.map(c => (
              <tr key={"i" + c} className="border-b last:border-0">
                <td className="py-1.5 px-3 pl-6">{c === "기타" ? "기타수입" : c}</td>
                {months.map(m => <td key={m.ym} className="py-1.5 px-3 text-right">{(m.income[c] || 0) !== 0 ? fmt(m.income[c]) : "—"}</td>)}
              </tr>
            ))}
            <tr className="border-b font-medium">
              <td className="py-1.5 px-3 pl-6">수입 합계</td>
              {months.map(m => <td key={m.ym} className="py-1.5 px-3 text-right text-green-600 dark:text-green-400">{fmt(m.incomeTotal)}</td>)}
            </tr>

            <tr className="bg-muted/40"><td colSpan={months.length + 1} className="py-1.5 px-3 text-xs font-medium">지출</td></tr>
            {expCats.map(c => (
              <tr key={"e" + c} className="border-b last:border-0">
                <td className="py-1.5 px-3 pl-6">{c}</td>
                {months.map(m => <td key={m.ym} className="py-1.5 px-3 text-right">{(m.expense[c] || 0) !== 0 ? fmt(m.expense[c]) : "—"}</td>)}
              </tr>
            ))}
            <tr className="border-b font-medium">
              <td className="py-1.5 px-3 pl-6">지출 합계</td>
              {months.map(m => <td key={m.ym} className="py-1.5 px-3 text-right">{fmt(m.expenseTotal)}</td>)}
            </tr>

            <tr className="border-t border-border">
              <td className="py-2 px-3 font-medium">순현금흐름</td>
              {months.map(m => <td key={m.ym} className={`py-2 px-3 text-right font-medium ${m.net < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{m.net >= 0 ? "+" : ""}{fmt(m.net)}</td>)}
            </tr>
            <tr className="bg-muted/50">
              <td className="py-2.5 px-3 font-medium">월말잔고</td>
              {months.map(m => (
                <td key={m.ym} className={`py-2.5 px-3 text-right font-semibold ${closingTone(m.closing)}`}>
                  {m.closing < 0 && <AlertTriangle className="h-3 w-3 inline mr-1 mb-0.5" />}
                  {fmt(m.closing)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        과거·당월 실적은 은행거래(확정), 미래는 예정(수금예정·정기지출 자동 투영) 기준입니다. 월말잔고가 음수/저잔고면 색으로 경고합니다.
      </p>
    </div>
  );
}
