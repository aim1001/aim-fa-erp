import { ReceivablesTab } from "./receivables-tab";

export default function Receivables() {
  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <h1 className="text-2xl font-semibold" data-testid="text-receivables-title">수금관리</h1>
      <ReceivablesTab />
    </div>
  );
}
