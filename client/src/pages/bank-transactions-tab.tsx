import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, Fragment } from "react";
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
  ChevronDown, ChevronUp, Link2, Link2Off, AlertCircle, Sparkles, FilterX,
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
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts/balances"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts/balances"] });
      const autoMsg = data.autoMatched > 0 ? `, ${data.autoMatched}건 자동 매칭` : "";
      toast({ title: `가져오기 완료`, description: `${data.inserted}건 추가${autoMsg}, ${data.skipped}건 중복 제외 (전체 ${data.total}건)` });
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

function QuickImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ accountAlias: string; isNew: boolean; inserted: number; skipped: number; total: number; autoMatched: number } | null>(null);

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/bank-transactions/import-auto", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts/balances"] });
      setResult(data);
    } catch (err: any) {
      toast({ title: "가져오기 실패", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>파일로 바로 가져오기</DialogTitle></DialogHeader>
        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{result.accountAlias}</span>
                {result.isNew && <Badge variant="outline" className="text-xs">신규 계좌</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{result.inserted}건</span> 추가됨
                {result.skipped > 0 && <span className="ml-2 text-xs">(중복 {result.skipped}건 제외)</span>}
              </div>
              {result.autoMatched > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-green-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-medium">{result.autoMatched}건</span> 자동 매칭됨
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              KB국민은행 거래내역 파일을 선택하면 계좌를 자동으로 인식하고 거래내역을 가져옵니다.
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm text-muted-foreground mb-2">
                Excel(.xlsx, .xls) 또는 CSV 파일
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                data-testid="input-quick-bank-file"
              />
              <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
                파일 선택
              </Button>
              {selectedFile && (
                <div className="mt-2 text-sm font-medium text-foreground truncate">{selectedFile.name}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
              <div>• 계좌번호가 파일에 있으면 자동 인식합니다</div>
              <div>• 이미 등록된 계좌이면 해당 계좌로 추가됩니다</div>
              <div>• 중복 거래내역은 자동으로 건너뜁니다</div>
            </div>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={handleClose} data-testid="button-quick-import-done">확인</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose}>취소</Button>
              <Button onClick={handleImport} disabled={!selectedFile || importing} data-testid="button-confirm-quick-import">
                {importing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                가져오기
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MatchCandidate = {
  id: string;
  type: string;
  status: string;
  description: string | null;
  amount: number | null;
  plannedDate: string | null;
  projectCustomerName: string | null;
  projectNumber: string | null;
};

function MatchDialog({ tx, onClose }: { tx: BankTransaction; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isCredit = !!(tx.creditAmount && tx.creditAmount > 0);
  const amount = tx.creditAmount || tx.debitAmount || 0;

  const { data: candidates = [], isLoading } = useQuery<MatchCandidate[]>({
    queryKey: ["/api/bank-transactions", tx.id, "candidates"],
    queryFn: async () => {
      const res = await fetch(`/api/bank-transactions/${tx.id}/candidates`);
      return res.json();
    },
  });

  const matchMutation = useMutation({
    mutationFn: async (data: { paymentId?: string; noMatch?: boolean }) => {
      const res = await apiRequest("POST", `/api/bank-transactions/${tx.id}/match`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "처리가 완료되었습니다" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>자금계획 연결</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm space-y-1">
            <div className="text-xs text-muted-foreground font-medium">은행 거래</div>
            <div className="flex items-center justify-between">
              <div className="font-medium">{tx.counterparty || tx.description || "내용 없음"}</div>
              <div className={isCredit ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
                {isCredit ? "+" : "-"}{amount.toLocaleString()}원
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{tx.txDate}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              연결 가능한 자금계획
              {!isLoading && <span className="ml-1 font-normal">({candidates.length}건 — 날짜 ±30일, 금액 ±20%)</span>}
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 bg-muted/20 rounded-lg">
                <AlertCircle className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                날짜·금액이 유사한 자금계획 항목이 없습니다
              </div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {candidates.map(c => {
                  const diff = tx.txDate && c.plannedDate
                    ? Math.round((new Date(tx.txDate).getTime() - new Date(c.plannedDate).getTime()) / 86400000)
                    : null;
                  const amtDiff = c.amount && amount ? Math.round(Math.abs(c.amount - amount) / amount * 100) : 0;
                  return (
                    <div
                      key={c.id}
                      className={`border rounded-lg px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                        selectedId === c.id ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-muted/30"
                      }`}
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      data-testid={`candidate-${c.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.description || c.projectCustomerName || "내용 없음"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{c.plannedDate || "날짜 미정"}</span>
                            {diff !== null && (
                              <span className={Math.abs(diff) <= 3 ? "text-green-600 font-medium" : "text-orange-500"}>
                                {diff === 0 ? "당일" : diff > 0 ? `D+${diff}` : `D${diff}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={c.type === "income" ? "text-blue-600 font-medium" : "text-red-600 font-medium"}>
                            {(c.amount || 0).toLocaleString()}원
                          </div>
                          {amtDiff > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {amtDiff > 0 ? `차이 ${amtDiff}%` : "금액 일치"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t pt-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">해당하는 계획이 없는 거래라면</div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => matchMutation.mutate({ noMatch: true })}
                disabled={matchMutation.isPending}
                data-testid="button-no-match"
              >
                계획없음으로 표시
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={matchMutation.isPending}>취소</Button>
          <Button
            onClick={() => { if (selectedId) matchMutation.mutate({ paymentId: selectedId }); }}
            disabled={!selectedId || matchMutation.isPending}
            data-testid="button-confirm-match"
          >
            {matchMutation.isPending
              ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              : <Link2 className="h-4 w-4 mr-1" />}
            연결하기
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
  const [txType, setTxType] = useState<"all" | "credit" | "debit">("all");
  const [matchFilter, setMatchFilter] = useState<"all" | "matched" | "unmatched" | "ignored">("all");
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matchDialogTx, setMatchDialogTx] = useState<BankTransaction | null>(null);

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bank-transactions/auto-match", { accountId: selectedAccountId || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      if (data.matched > 0) {
        toast({ title: `자동 매칭 완료`, description: `${data.matched}건이 매출계산서에 자동 연결됐습니다` });
      } else {
        toast({ title: "자동 매칭", description: "매칭 가능한 거래가 없습니다" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "자동 매칭 실패", description: err.message, variant: "destructive" });
    },
  });

  const dedupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bank-transactions/dedup", { accountId: selectedAccountId || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      if (data.deleted > 0) {
        toast({ title: `중복 정리 완료`, description: `${data.deleted}건 중복 거래 삭제 (${data.groups}개 그룹)` });
      } else {
        toast({ title: "중복 정리", description: "중복 거래가 없습니다" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "중복 정리 실패", description: err.message, variant: "destructive" });
    },
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  const { data: transactions = [], isLoading: txLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", selectedAccountId, startDate, endDate, txType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (txType !== "all") params.set("txType", txType);
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
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts/balances"] });
      toast({ title: "삭제되었습니다" });
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async (txId: string) => {
      const res = await apiRequest("DELETE", `/api/bank-transactions/${txId}/match`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "연결이 해제되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "해제 실패", description: err.message, variant: "destructive" });
    },
  });

  const totalCredit = transactions.reduce((s, t) => s + (t.creditAmount ?? 0), 0);
  const totalDebit = transactions.reduce((s, t) => s + (t.debitAmount ?? 0), 0);

  const matchedCount = transactions.filter(t => t.matchStatus === "manual" || t.matchStatus === "auto").length;
  const unmatchedCount = transactions.filter(t => !t.matchStatus || t.matchStatus === "unmatched").length;
  const ignoredCount = transactions.filter(t => t.matchStatus === "ignored").length;

  const filteredTransactions = matchFilter === "all" ? transactions : transactions.filter(t => {
    if (matchFilter === "matched") return t.matchStatus === "manual" || t.matchStatus === "auto";
    if (matchFilter === "unmatched") return !t.matchStatus || t.matchStatus === "unmatched";
    if (matchFilter === "ignored") return t.matchStatus === "ignored";
    return true;
  });

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

          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button
              variant={txType === "all" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTxType("all")}
              data-testid="filter-tx-all"
            >
              전체
            </Button>
            <Button
              variant={txType === "credit" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTxType("credit")}
              data-testid="filter-tx-credit"
            >
              입금
            </Button>
            <Button
              variant={txType === "debit" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTxType("debit")}
              data-testid="filter-tx-debit"
            >
              출금
            </Button>
          </div>

          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button
              variant={matchFilter === "all" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMatchFilter("all")}
              data-testid="filter-match-all"
            >
              전체 {transactions.length > 0 && <span className="ml-1 opacity-60">{transactions.length}</span>}
            </Button>
            <Button
              variant={matchFilter === "matched" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMatchFilter("matched")}
              data-testid="filter-match-matched"
            >
              연결됨 {matchedCount > 0 && <span className="ml-1 text-green-600 opacity-80">{matchedCount}</span>}
            </Button>
            <Button
              variant={matchFilter === "unmatched" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMatchFilter("unmatched")}
              data-testid="filter-match-unmatched"
            >
              미연결 {unmatchedCount > 0 && <span className="ml-1 text-orange-500 opacity-80">{unmatchedCount}</span>}
            </Button>
            <Button
              variant={matchFilter === "ignored" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMatchFilter("ignored")}
              data-testid="filter-match-ignored"
            >
              계획없음 {ignoredCount > 0 && <span className="ml-1 opacity-60">{ignoredCount}</span>}
            </Button>
          </div>

          {(startDate || endDate || txType !== "all" || matchFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); setTxType("all"); setMatchFilter("all"); }}>
              필터 초기화
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            data-testid="button-auto-match"
          >
            {autoMatchMutation.isPending
              ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              : <Sparkles className="h-4 w-4 mr-1" />}
            자동 매칭
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("같은 날짜·금액 중복 거래를 정리합니다.\n구체적인 거래처명을 남기고 '인터넷출금이체' 등 일반 항목을 삭제합니다.\n계속하시겠습니까?")) {
                dedupMutation.mutate();
              }
            }}
            disabled={dedupMutation.isPending}
            data-testid="button-dedup"
          >
            {dedupMutation.isPending
              ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              : <FilterX className="h-4 w-4 mr-1" />}
            중복 정리
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQuickImport(true)} data-testid="button-quick-import">
            <Upload className="h-4 w-4 mr-1" /> 파일로 바로 가져오기
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAccountManager(true)} data-testid="button-manage-accounts">
            <Building2 className="h-4 w-4 mr-1" /> 계좌 관리
          </Button>
          {selectedAccountId && (
            <Button size="sm" onClick={() => setShowImport(true)} data-testid="button-import-transactions">
              <Upload className="h-4 w-4 mr-1" /> 가져오기
            </Button>
          )}
        </div>
      </div>

      {selectedAccountId && transactions.length > 0 && (
        <div className="flex items-center gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2 border flex-wrap">
          <span className="text-muted-foreground">{transactions.length}건</span>
          <span className="flex items-center gap-1 text-blue-600">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            입금 {totalCredit.toLocaleString()}원
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <ArrowUpCircle className="h-3.5 w-3.5" />
            출금 {totalDebit.toLocaleString()}원
          </span>
          <span className="h-4 w-px bg-border mx-1" />
          <span className="flex items-center gap-1 text-green-600 text-xs">
            <Link2 className="h-3 w-3" />
            연결됨 {matchedCount}
          </span>
          <span className="flex items-center gap-1 text-orange-500 text-xs">
            <AlertCircle className="h-3 w-3" />
            미연결 {unmatchedCount}
          </span>
          {ignoredCount > 0 && (
            <span className="text-xs text-muted-foreground">계획없음 {ignoredCount}</span>
          )}
          <span className="text-muted-foreground ml-auto text-xs">
            {selectedAccount?.bankName} · {selectedAccount?.accountAlias}
          </span>
        </div>
      )}

      {!selectedAccountId ? (
        <div className="text-center py-16 text-muted-foreground">
          <Upload className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium text-foreground">거래내역 파일을 바로 가져오세요</div>
          <div className="text-xs mt-1 mb-4">"파일로 바로 가져오기"를 클릭하면 계좌가 자동으로 등록됩니다</div>
          <Button size="sm" onClick={() => setShowQuickImport(true)} data-testid="button-empty-quick-import">
            <Upload className="h-4 w-4 mr-1" /> 파일로 바로 가져오기
          </Button>
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
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">적요</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">거래처</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">출금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">입금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">잔액</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">상태</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                    해당 조건의 거래내역이 없습니다
                  </td>
                </tr>
              ) : filteredTransactions.map(tx => {
                const isMatched = tx.matchStatus === "manual" || tx.matchStatus === "auto";
                const isIgnored = tx.matchStatus === "ignored";
                return (
                  <Fragment key={tx.id}>
                    <tr
                      className={`group hover:bg-muted/30 cursor-pointer transition-colors ${isMatched ? "bg-green-50/40 dark:bg-green-950/10" : ""}`}
                      onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                      data-testid={`tx-row-${tx.id}`}
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(tx.txDate)}
                      </td>
                      <td className="px-3 py-2 w-32">
                        <div className="flex items-center gap-1 min-w-0">
                          {expandedId === tx.id ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                          <span className="text-xs text-muted-foreground truncate">
                            {tx.description || <span className="opacity-40">-</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium truncate block">
                          {tx.counterparty || <span className="text-muted-foreground opacity-40">-</span>}
                        </span>
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
                      <td className="px-1 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isMatched && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
                              title={isIgnored ? "다시 연결 시도" : "자금계획 연결"}
                              onClick={e => { e.stopPropagation(); setMatchDialogTx(tx); }}
                              data-testid={`button-match-tx-${tx.id}`}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isMatched && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-green-600 hover:text-orange-500 opacity-0 group-hover:opacity-100"
                              title="연결 해제"
                              onClick={e => { e.stopPropagation(); if (confirm("연결을 해제하시겠습니까?\n자금계획 항목이 '예정' 상태로 돌아갑니다.")) unmatchMutation.mutate(tx.id); }}
                              data-testid={`button-unmatch-tx-${tx.id}`}
                            >
                              <Link2Off className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
                        </div>
                      </td>
                    </tr>
                    {expandedId === tx.id && (
                      <tr key={`${tx.id}-detail`} className="bg-muted/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs flex-1">
                              {tx.txTime && <><span className="text-muted-foreground">거래시각</span><span>{tx.txTime}</span></>}
                              {tx.txCategory && <><span className="text-muted-foreground">거래구분</span><span>{tx.txCategory}</span></>}
                              {tx.importBatch && <><span className="text-muted-foreground">가져오기 일시</span><span>{tx.importBatch}</span></>}
                              <span className="text-muted-foreground">거래 ID</span><span className="font-mono text-muted-foreground">{tx.id}</span>
                              {isMatched && tx.matchedPaymentId && (
                                <>
                                  <span className="text-muted-foreground">연결된 계획</span>
                                  <span className="text-green-700 font-medium flex items-center gap-1">
                                    <Link2 className="h-3 w-3" /> 자금계획 연결됨
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!isMatched ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={e => { e.stopPropagation(); setMatchDialogTx(tx); }}
                                  data-testid={`button-match-detail-${tx.id}`}
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  {isIgnored ? "다시 연결" : "연결하기"}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                                  onClick={e => { e.stopPropagation(); if (confirm("연결을 해제하시겠습니까?")) unmatchMutation.mutate(tx.id); }}
                                  data-testid={`button-unmatch-detail-${tx.id}`}
                                >
                                  <Link2Off className="h-3 w-3 mr-1" /> 연결 해제
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={e => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteTxMutation.mutate(tx.id); }}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> 삭제
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AccountManagerDialog open={showAccountManager} onOpenChange={v => { setShowAccountManager(v); if (!v) queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] }); }} />
      <QuickImportDialog open={showQuickImport} onOpenChange={setShowQuickImport} />
      {selectedAccountId && selectedAccount && (
        <ImportDialog
          accountId={selectedAccountId}
          accountAlias={selectedAccount.accountAlias}
          open={showImport}
          onOpenChange={setShowImport}
        />
      )}
      {matchDialogTx && (
        <MatchDialog tx={matchDialogTx} onClose={() => setMatchDialogTx(null)} />
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
    return <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30">연결됨</Badge>;
  }
  if (status === "ignored") {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground bg-muted/40 border-muted-foreground/20">계획없음</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-950/20">미연결</Badge>;
}
