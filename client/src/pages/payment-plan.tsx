import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Landmark, ClipboardList, Settings, ChevronLeft, ChevronRight, ReceiptText, CreditCard } from "lucide-react";
import { CashFlowTab } from "./cash-flow-tab";
import { RecurringItemsTab } from "./recurring-items-tab";
import { BankTransactionsTab } from "./bank-transactions-tab";
import { ReceivablesTab } from "./receivables-tab";
import { PayablesTab } from "./payables-tab";

type ViewMode = "cashflow" | "recurring" | "bank-manage" | "receivables" | "payables";

export default function PaymentPlan() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<ViewMode>("cashflow");

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-payment-plan-title">자금계획</h1>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={viewMode === "cashflow" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cashflow")}
            data-testid="button-view-cashflow"
          >
            <Landmark className="h-4 w-4 mr-1" />자금흐름
          </Button>
          <Button
            variant={viewMode === "recurring" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("recurring")}
            data-testid="button-view-recurring"
          >
            <ClipboardList className="h-4 w-4 mr-1" />정기항목
          </Button>
          <Button
            variant={viewMode === "bank-manage" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("bank-manage")}
            data-testid="button-view-bank-manage"
          >
            <Settings className="h-4 w-4 mr-1" />은행관리
          </Button>
          <Button
            variant={viewMode === "receivables" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("receivables")}
            data-testid="button-view-receivables"
          >
            <ReceiptText className="h-4 w-4 mr-1" />수금관리
          </Button>
          <Button
            variant={viewMode === "payables" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("payables")}
            data-testid="button-view-payables"
          >
            <CreditCard className="h-4 w-4 mr-1" />지급관리
          </Button>
        </div>
      </div>

      {viewMode === "cashflow" && (
        <CashFlowTab
          year={year}
          month={month}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onGoToMonth={(y, m) => { setYear(y); setMonth(m); }}
        />
      )}

      {viewMode === "recurring" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth} data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base font-semibold min-w-[100px] text-center" data-testid="text-recurring-month">
              {year}년 {month}월
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth} data-testid="button-next-month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <RecurringItemsTab year={year} month={month} />
        </div>
      )}

      {viewMode === "bank-manage" && <BankTransactionsTab />}

      {viewMode === "receivables" && <ReceivablesTab />}

      {viewMode === "payables" && <PayablesTab />}
    </div>
  );
}
