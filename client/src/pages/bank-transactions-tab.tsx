import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Upload, Trash2, Building2, ArrowDownCircle, ArrowUpCircle, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { BankAccount, BankTransaction } from "@shared/schema";

function formatAmount(n: number | null | undefined) {
  if (!n) return "-";
  return n.toLocaleString() + "원";
}

function formatDate(s: string | null | undefined) {
  if (!s) return "-";
  return s;
}

function AccountManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ bankName: "KB국민은행", accountNumber: "", accountAlias: "" });

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bank-accounts", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setForm({ bankName: "KB국민은행", accountNumber: "", accountAlias: "" });
      toast({ title: "계좌가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "계좌가 삭제되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>은행 계좌 관리</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div>
              <Label>은행명</Label>
              <Select value={form.bankName} onValueChange={v => setForm(p => ({ ...p, bankName: v }))}>
                <SelectTrigger data-testid="select-bank-name"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KB국민은행">KB국민은행</SelectItem>
                  <SelectItem value="신한은행">신한은행</SelectItem>
                  <SelectItem value="우리은행">우리은행</SelectItem>
                  <SelectItem value="하나은행">하나은행</SelectItem>
                  <SelectItem value="기업은행">기업은행</SelectItem>
                  <SelectItem value="농협은행">농협은행</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>계좌 별칭 <span className="text-destructive">*</span></Label>
              <Input
                value={form.accountAlias}
                onChange={e => setForm(p => ({ ...p, accountAlias: e.target.value }))}
                placeholder="예: 법인 주계좌"
                data-testid="input-account-alias"
              />
            </div>
            <div>
              <Label>계좌번호 (선택)</Label>
              <Input
                value={form.accountNumber}
                onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))}
                placeholder="표시용 계좌번호 (뒷 4자리 등)"
                data-testid="input-account-number"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={!form.accountAlias || createMutation.isPending}
              data-testid="button-add-account"
            >
              <Plus className="h-4 w-4 mr-1" /> 계좌 추가
            </Button>
          </div>

          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">등록된 계좌</div>
            {isLoading ? (
              <Skeleton className="h-12" />
            ) : accounts.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">등록된 계좌가 없습니다</div>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between gap-2 bg-muted/30 rounded px-3 py-2" data-testid={`account-item-${acc.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{acc.accountAlias}</div>
                      <div className="text-xs text-muted-foreground">{acc.bankName}{acc.accountNumber ? ` · ${acc.accountNumber}` : ""}</div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => { if (confirm(`"${acc.accountAlias}" 계좌와 모든 거래내역을 삭제하시겠습니까?`)) deleteMutation.mutate(acc.id); }}
                    data-testid={`button-delete-account-${acc.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ accountId, accountAlias, open, onOpenChange }: {
  accountId: string;
  accountAlias: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("accountId", accountId);
      const res = await fetch("/api/bank-transactions/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: `가져오기 완료`, description: `${data.inserted}건 추가, ${data.skipped}건 중복 제외 (전체 ${data.total}건)` });
      setSelectedFile(null);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "가져오기 실패", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>거래내역 가져오기</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{accountAlias}</span> 계좌로 KB국민은행 Excel/CSV 파일을 가져옵니다.
          </div>
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm text-muted-foreground mb-2">
              KB국민은행 거래내역 Excel(.xlsx, .xls) 또는 CSV
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
              data-testid="input-bank-file"
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              파일 선택
            </Button>
            {selectedFile && (
              <div className="mt-2 text-sm font-medium text-foreground truncate">{selectedFile.name}</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
            <div>• 중복 거래내역은 자동으로 건너뜁니다</div>
            <div>• KB국민은행 인터넷뱅킹에서 다운로드한 파일을 사용하세요</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleImport} disabled={!selectedFile || importing} data-testid="button-confirm-import">
            {importing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            가져오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BankTransactionsTab() {
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  const { data: transactions = [], isLoading: txLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", selectedAccountId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/bank-transactions?${params}`);
      return res.json();
    },
    enabled: !!selectedAccountId,
  });

  const deleteTxMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bank-transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "삭제되었습니다" });
    },
  });

  const totalCredit = transactions.reduce((s, t) => s + (t.creditAmount ?? 0), 0);
  const totalDebit = transactions.reduce((s, t) => s + (t.debitAmount ?? 0), 0);

  return (
    <div className="space-y-4" data-testid="bank-transactions-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-48" data-testid="select-bank-account">
              <SelectValue placeholder="계좌 선택..." />
            </SelectTrigger>
            <SelectContent>
              {accountsLoading ? (
                <SelectItem value="_loading" disabled>로딩 중...</SelectItem>
              ) : accounts.length === 0 ? (
                <SelectItem value="_empty" disabled>등록된 계좌 없음</SelectItem>
              ) : (
                accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.accountAlias}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 w-36 text-sm"
              data-testid="input-start-date"
            />
            <span className="text-muted-foreground text-sm">~</span>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 w-36 text-sm"
              data-testid="input-end-date"
            />
          </div>

          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>
              필터 초기화
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAccountManager(true)} data-testid="button-manage-accounts">
            <Building2 className="h-4 w-4 mr-1" /> 계좌 관리
          </Button>
          {selectedAccountId && (
            <Button size="sm" onClick={() => setShowImport(true)} data-testid="button-import-transactions">
              <Upload className="h-4 w-4 mr-1" /> 거래내역 가져오기
            </Button>
          )}
        </div>
      </div>

      {selectedAccountId && transactions.length > 0 && (
        <div className="flex items-center gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2 border">
          <span className="text-muted-foreground">{transactions.length}건</span>
          <span className="flex items-center gap-1 text-blue-600">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            입금 {totalCredit.toLocaleString()}원
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <ArrowUpCircle className="h-3.5 w-3.5" />
            출금 {totalDebit.toLocaleString()}원
          </span>
          <span className="text-muted-foreground ml-auto text-xs">
            {selectedAccount?.bankName} · {selectedAccount?.accountAlias}
          </span>
        </div>
      )}

      {!selectedAccountId ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">계좌를 선택하세요</div>
          <div className="text-xs mt-1">계좌가 없으면 "계좌 관리"에서 먼저 추가하세요</div>
        </div>
      ) : txLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Upload className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">거래내역이 없습니다</div>
          <div className="text-xs mt-1">"거래내역 가져오기"를 눌러 Excel 파일을 불러오세요</div>
          <Button className="mt-4" size="sm" onClick={() => setShowImport(true)} data-testid="button-import-empty">
            <Upload className="h-4 w-4 mr-1" /> 거래내역 가져오기
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden" data-testid="transactions-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">날짜</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">적요/거래처</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">출금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">입금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">잔액</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">상태</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map(tx => (
                <>
                  <tr
                    key={tx.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                    data-testid={`tx-row-${tx.id}`}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.txDate)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {expandedId === tx.id ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          {tx.counterparty && (
                            <div className="font-medium truncate">{tx.counterparty}</div>
                          )}
                          {tx.description && (
                            <div className="text-xs text-muted-foreground truncate">{tx.description}</div>
                          )}
                          {!tx.counterparty && !tx.description && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {tx.debitAmount ? (
                        <span className="text-red-600 font-medium">{tx.debitAmount.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {tx.creditAmount ? (
                        <span className="text-blue-600 font-medium">{tx.creditAmount.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {tx.balance != null ? tx.balance.toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <MatchStatusBadge status={tx.matchStatus} />
                    </td>
                    <td className="px-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm("삭제하시겠습니까?")) deleteTxMutation.mutate(tx.id);
                        }}
                        data-testid={`button-delete-tx-${tx.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                  {expandedId === tx.id && (
                    <tr key={`${tx.id}-detail`} className="bg-muted/10">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                          {tx.txTime && <><span className="text-muted-foreground">거래시각</span><span>{tx.txTime}</span></>}
                          {tx.txCategory && <><span className="text-muted-foreground">거래구분</span><span>{tx.txCategory}</span></>}
                          {tx.importBatch && <><span className="text-muted-foreground">가져오기 일시</span><span>{tx.importBatch}</span></>}
                          <span className="text-muted-foreground">거래 ID</span><span className="font-mono text-muted-foreground">{tx.id}</span>
                          <div className="col-span-2 pt-1 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("삭제하시겠습니까?")) deleteTxMutation.mutate(tx.id); }}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> 삭제
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AccountManagerDialog open={showAccountManager} onOpenChange={setShowAccountManager} />
      {selectedAccountId && selectedAccount && (
        <ImportDialog
          accountId={selectedAccountId}
          accountAlias={selectedAccount.accountAlias}
          open={showImport}
          onOpenChange={setShowImport}
        />
      )}

      <DataCleanupSection />
    </div>
  );
}

function DataCleanupSection() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{ deleted: number } | null>(null);

  const runCleanup = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/cleanup-corrupt-payments", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data);
      toast({ title: `정리 완료: ${data.deleted}건 삭제` });
    } catch (err: any) {
      toast({ title: "정리 실패", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/20 mt-2">
      <div className="text-xs font-medium text-muted-foreground mb-2">데이터 정리 도구</div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground flex-1">
          잘못 가져온 1900년대 날짜 payments 데이터 삭제 (actual_date &lt; 1901-01-01)
        </div>
        {result ? (
          <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-xs shrink-0">
            완료: {result.deleted}건 삭제됨
          </Badge>
        ) : showConfirm ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-destructive font-medium">정말 삭제하시겠습니까?</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={runCleanup} disabled={running} data-testid="button-confirm-cleanup">
              {running ? <RefreshCw className="h-3 w-3 animate-spin" /> : "확인"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowConfirm(false)}>취소</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 text-destructive border-destructive/30" onClick={() => setShowConfirm(true)} data-testid="button-cleanup-corrupt">
            <Trash2 className="h-3 w-3 mr-1" /> 오류 데이터 정리
          </Button>
        )}
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: string | null }) {
  if (status === "auto" || status === "manual") {
    return <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200">연결됨</Badge>;
  }
  if (status === "ignored") {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground">무시</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-orange-600 bg-orange-50 border-orange-200">미연결</Badge>;
}
