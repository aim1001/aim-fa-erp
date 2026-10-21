// 해외(수출) 프로젝트 매출·환차손익 계산 — 서버(목록 합계)와 화면(상세)이 같은 규칙을 쓴다.
// 세금계산서는 발행하지 않는다. 선적일(공급시기) 기준으로 원화 매출을 확정한다 (부가세 영세율·수출실적명세서 기준):
//  - 선적 전에 받은 선수금: 실제 입금된 원화 그대로 매출 (환차손익 없음)
//  - 나머지 미수 USD: 선적일 기준환율로 환산
//  - 선적 후 입금분: 실제 원화 − (USD × 선적일 환율) = 환차손익
import { num, usdToKrw } from "./fx";

type ProjectLike = {
  contractAmountFx?: string | number | null;
  shipDate?: string | null;
  shipRate?: string | number | null;
};
type PaymentLike = {
  type: string;
  status?: string | null;
  amountFx?: string | number | null;
  actualAmount?: number | null;
  amount?: number | null;
  actualDate?: string | null;
};

export function calcExportRevenue(project: ProjectLike, payments: PaymentLike[]) {
  const contractFx = num(project.contractAmountFx);
  const shipRate = num(project.shipRate);
  const shipped = !!project.shipDate && shipRate > 0;
  const received = payments.filter(p => p.type === "income" && p.status === "completed");
  const krwOf = (p: PaymentLike) => p.actualAmount ?? p.amount ?? 0;
  const isAdvance = (p: PaymentLike) => !shipped || !p.actualDate || p.actualDate <= project.shipDate!;

  const advance = received.filter(isAdvance);
  const afterShip = received.filter(p => !isAdvance(p));
  const advanceFx = Math.round(advance.reduce((s, p) => s + num(p.amountFx), 0) * 100) / 100;
  const advanceKrw = advance.reduce((s, p) => s + krwOf(p), 0);
  const receivedKrw = received.reduce((s, p) => s + krwOf(p), 0);

  if (!shipped) {
    return { shipped, contractFx, advanceFx, advanceKrw, remainingFx: contractFx - advanceFx, revenueKrw: 0, receivedKrw, fxGain: 0 };
  }
  const remainingFx = Math.round((contractFx - advanceFx) * 100) / 100;
  const revenueKrw = advanceKrw + usdToKrw(remainingFx, shipRate);
  const fxGain = afterShip.reduce((s, p) => s + (krwOf(p) - usdToKrw(num(p.amountFx), shipRate)), 0);
  return { shipped, contractFx, advanceFx, advanceKrw, remainingFx, revenueKrw, receivedKrw, fxGain };
}

// 입금 1건의 환차손익 (선적 후 입금만 해당, 아니면 null)
export function paymentFxGain(project: ProjectLike, p: PaymentLike): number | null {
  const shipRate = num(project.shipRate);
  if (!project.shipDate || !(shipRate > 0) || p.status !== "completed" || !p.actualDate || p.actualDate <= project.shipDate) return null;
  return (p.actualAmount ?? p.amount ?? 0) - usdToKrw(num(p.amountFx), shipRate);
}
