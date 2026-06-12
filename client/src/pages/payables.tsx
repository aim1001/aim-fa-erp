import { PayablesTab } from "./payables-tab";

export default function Payables() {
  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <h1 className="text-2xl font-semibold" data-testid="text-payables-title">지급관리</h1>
      <PayablesTab />
    </div>
  );
}
