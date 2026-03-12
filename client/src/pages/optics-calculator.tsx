import OpticsCalculator from "@/components/OpticsCalculator";

export default function OpticsCalculatorPage() {
  return (
    <div className="h-full overflow-y-auto p-6" data-testid="page-optics-calculator">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">광학 계산기</h1>
        <p className="text-sm text-muted-foreground mt-1">카메라 FOV 및 광학 파라미터를 계산합니다</p>
      </div>
      <OpticsCalculator />
    </div>
  );
}
