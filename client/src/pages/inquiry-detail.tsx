import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileSpreadsheet, FileIcon, RefreshCw, Trash2, Check, X } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import type { Inquiry, InquiryFile } from "@shared/schema";

function useInlineUpdate(inquiryId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/inquiries/${inquiryId}`, patch);
      return res.json();
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["/api/inquiries", inquiryId] });
      const prev = queryClient.getQueryData<Inquiry>(["/api/inquiries", inquiryId]);
      if (prev) {
        queryClient.setQueryData(["/api/inquiries", inquiryId], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (err: Error, _patch, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/inquiries", inquiryId], context.prev);
      }
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });
}

const statusLabels: Record<string, string> = {
  active: "진행중",
  won: "수주",
  lost: "실주",
};

const stageLabels: Record<number, string> = {
  0: "미설정",
  1: "1.문의",
  2: "2.미팅",
  3: "3.사양협의",
  4: "4.비딩",
  5: "5.발주전",
};

const materialOptions = ["steel", "플라스틱", "고무류"];
const industryOptions = ["자동차", "전기", "전자부품", "화장품", "기타"];

function getFileIcon(fileType: string | null) {
  if (!fileType) return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  if (fileType === "xlsx" || fileType === "xls") return <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />;
  if (fileType === "pdf") return <FileIcon className="h-5 w-5 text-red-500" />;
  return <FileIcon className="h-5 w-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InlineText({ value, field, inquiryId, placeholder }: {
  value: string;
  field: string;
  inquiryId: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const mutation = useInlineUpdate(inquiryId);

  const handleSave = useCallback(() => {
    if (editValue !== value) {
      mutation.mutate({ [field]: editValue || null });
    }
    setEditing(false);
  }, [editValue, value, field]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setEditValue(value); setEditing(false); }
          }}
          placeholder={placeholder}
          data-testid={`input-inline-${field}`}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={mutation.isPending}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditValue(value); setEditing(false); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 min-h-[1.5rem] inline-block"
      onClick={() => { setEditValue(value); setEditing(true); }}
      data-testid={`text-editable-${field}`}
    >
      {value || <span className="text-muted-foreground">{placeholder || "-"}</span>}
    </span>
  );
}

function InlineTextarea({ value, field, inquiryId, placeholder }: {
  value: string;
  field: string;
  inquiryId: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const mutation = useInlineUpdate(inquiryId);

  const handleSave = useCallback(() => {
    if (editValue !== value) {
      mutation.mutate({ [field]: editValue || null });
    }
    setEditing(false);
  }, [editValue, value, field]);

  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="text-sm"
          autoFocus
          rows={3}
          placeholder={placeholder}
          data-testid={`input-inline-${field}`}
        />
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={handleSave} disabled={mutation.isPending}>
            <Check className="h-3 w-3 mr-1" />저장
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditValue(value); setEditing(false); }}>
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <span
      className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 whitespace-pre-wrap min-h-[1.5rem] inline-block"
      onClick={() => { setEditValue(value); setEditing(true); }}
      data-testid={`text-editable-${field}`}
    >
      {value || <span className="text-muted-foreground">{placeholder || "-"}</span>}
    </span>
  );
}

function InlineSelect({ value, field, inquiryId, options, labels }: {
  value: string;
  field: string;
  inquiryId: string;
  options: { value: string; label: string }[];
  labels?: Record<string, string>;
}) {
  const mutation = useInlineUpdate(inquiryId);

  return (
    <Select value={value || "_none"} onValueChange={(v) => {
      const actualVal = v === "_none" ? null : v;
      mutation.mutate({ [field]: actualVal });
    }} disabled={mutation.isPending}>
      <SelectTrigger className="h-7 text-sm w-auto min-w-24" data-testid={`select-inline-${field}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineStageSelect({ value, inquiryId }: { value: number; inquiryId: string }) {
  const mutation = useInlineUpdate(inquiryId);

  return (
    <Select value={String(value)} onValueChange={(v) => mutation.mutate({ probability: parseInt(v) })} disabled={mutation.isPending}>
      <SelectTrigger className="h-7 text-sm w-auto min-w-28" data-testid="select-inline-probability">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="0">미설정</SelectItem>
        <SelectItem value="1">1. 문의</SelectItem>
        <SelectItem value="2">2. 미팅</SelectItem>
        <SelectItem value="3">3. 사양협의</SelectItem>
        <SelectItem value="4">4. 비딩</SelectItem>
        <SelectItem value="5">5. 발주전</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InlineDateInput({ value, field, inquiryId }: {
  value: string;
  field: string;
  inquiryId: string;
}) {
  const mutation = useInlineUpdate(inquiryId);

  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => mutation.mutate({ [field]: e.target.value || null })}
      className="h-7 text-sm w-auto"
      disabled={mutation.isPending}
      data-testid={`input-inline-${field}`}
    />
  );
}

function InlineNumber({ value, field, inquiryId }: {
  value: number;
  field: string;
  inquiryId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const mutation = useInlineUpdate(inquiryId);

  const handleSave = useCallback(() => {
    const num = parseInt(editValue);
    if (isNaN(num)) return;
    if (num !== value) {
      mutation.mutate({ [field]: num });
    }
    setEditing(false);
  }, [editValue, value, field]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 text-sm w-24"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setEditValue(String(value)); setEditing(false); }
          }}
          data-testid={`input-inline-${field}`}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={mutation.isPending}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditValue(String(value)); setEditing(false); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
      onClick={() => { setEditValue(String(value)); setEditing(true); }}
      data-testid={`text-editable-${field}`}
    >
      {value}
    </span>
  );
}

export default function InquiryDetail() {
  const [, params] = useRoute("/inquiries/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: inquiry, isLoading } = useQuery<Inquiry>({
    queryKey: ["/api/inquiries", id],
    enabled: !!id,
  });

  const { data: files, isLoading: filesLoading } = useQuery<InquiryFile[]>({
    queryKey: ["/api/inquiries", id, "files"],
    enabled: !!id,
  });

  const syncFilesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sync-onedrive/${id}/files`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "파일 동기화 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", id, "files"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/inquiries/${id}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      navigate("/inquiries");
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">인콰이어리를 찾을 수 없습니다.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/inquiries">목록으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/inquiries"><ArrowLeft /></Link>
        </Button>
        <h1 className="text-2xl font-semibold flex-1" data-testid="text-inquiry-title">
          {inquiry.inquiryNumber} - {inquiry.customerName}
        </h1>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("정말 삭제하시겠습니까?")) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
          data-testid="button-delete"
        >
          <Trash2 className="h-4 w-4" />
          <span>삭제</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 text-sm items-center">
              <span className="text-muted-foreground">영업번호</span>
              <InlineText value={inquiry.inquiryNumber} field="inquiryNumber" inquiryId={id!} />

              <span className="text-muted-foreground">고객명</span>
              <InlineText value={inquiry.customerName} field="customerName" inquiryId={id!} />

              <span className="text-muted-foreground">제품정보</span>
              <InlineText value={inquiry.productInfo || ""} field="productInfo" inquiryId={id!} placeholder="클릭하여 입력" />

              <span className="text-muted-foreground">연도</span>
              <InlineNumber value={inquiry.year} field="year" inquiryId={id!} />

              <span className="text-muted-foreground">출처</span>
              <Badge variant="secondary">{inquiry.source === "onedrive" ? "OneDrive" : "수동입력"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">영업 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 text-sm items-center">
              <span className="text-muted-foreground">단계</span>
              <InlineStageSelect value={inquiry.probability || 0} inquiryId={id!} />

              <span className="text-muted-foreground">상태</span>
              <InlineSelect
                value={inquiry.status || "active"}
                field="status"
                inquiryId={id!}
                options={[
                  { value: "active", label: "진행중" },
                  { value: "won", label: "수주" },
                  { value: "lost", label: "실주" },
                ]}
              />

              <span className="text-muted-foreground">예상일자</span>
              <InlineDateInput value={inquiry.expectedDate || ""} field="expectedDate" inquiryId={id!} />

              <span className="text-muted-foreground">납품일자</span>
              <InlineDateInput value={inquiry.deliveryDate || ""} field="deliveryDate" inquiryId={id!} />

              <span className="text-muted-foreground">메모</span>
              <InlineTextarea value={inquiry.memo || ""} field="memo" inquiryId={id!} placeholder="클릭하여 입력" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">제품 상세정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 items-center">
              <span className="text-muted-foreground">크기 (가로)</span>
              <div className="flex items-center gap-1">
                <InlineText value={inquiry.productWidth || ""} field="productWidth" inquiryId={id!} placeholder="가로" />
                <span className="text-muted-foreground text-xs">mm</span>
              </div>

              <span className="text-muted-foreground">크기 (세로)</span>
              <div className="flex items-center gap-1">
                <InlineText value={inquiry.productDepth || ""} field="productDepth" inquiryId={id!} placeholder="세로" />
                <span className="text-muted-foreground text-xs">mm</span>
              </div>

              <span className="text-muted-foreground">크기 (높이)</span>
              <div className="flex items-center gap-1">
                <InlineText value={inquiry.productHeight || ""} field="productHeight" inquiryId={id!} placeholder="높이" />
                <span className="text-muted-foreground text-xs">mm</span>
              </div>

              <span className="text-muted-foreground">무게</span>
              <div className="flex items-center gap-1">
                <InlineText value={inquiry.weight || ""} field="weight" inquiryId={id!} placeholder="무게" />
                <span className="text-muted-foreground text-xs">g</span>
              </div>
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 items-center">
              <span className="text-muted-foreground">재질</span>
              <InlineSelect
                value={inquiry.material || ""}
                field="material"
                inquiryId={id!}
                options={[
                  { value: "_none", label: "미설정" },
                  ...materialOptions.map(m => ({ value: m, label: m })),
                ]}
              />

              <span className="text-muted-foreground">종류</span>
              <InlineText value={inquiry.productType || ""} field="productType" inquiryId={id!} placeholder="클릭하여 입력" />

              <span className="text-muted-foreground">분야</span>
              <InlineSelect
                value={inquiry.industry || ""}
                field="industry"
                inquiryId={id!}
                options={[
                  { value: "_none", label: "미설정" },
                  ...industryOptions.map(i => ({ value: i, label: i })),
                ]}
              />

              <span className="text-muted-foreground">공급속도</span>
              <div className="flex items-center gap-1">
                <InlineText value={inquiry.supplySpeed || ""} field="supplySpeed" inquiryId={id!} placeholder="속도" />
                <span className="text-muted-foreground text-xs">ea/min</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">계약조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_1fr] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <span>구분</span>
                <span>비율</span>
                <span>기한</span>
              </div>

              <div className="grid grid-cols-[80px_1fr_1fr] px-3 py-2 items-center border-b">
                <span className="font-medium">계약금</span>
                <div className="flex items-center gap-1">
                  <InlineNumber value={inquiry.contractRatio ?? 0} field="contractRatio" inquiryId={id!} />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <InlineSelect
                    value={inquiry.contractTimingType || ""}
                    field="contractTimingType"
                    inquiryId={id!}
                    options={[
                      { value: "_none", label: "미설정" },
                      { value: "days", label: "일수지정" },
                      { value: "next_month_end", label: "익월말" },
                      { value: "month_end", label: "월말" },
                    ]}
                  />
                  {inquiry.contractTimingType === "days" && (
                    <div className="flex items-center gap-1">
                      <InlineNumber value={inquiry.contractTimingDays ?? 0} field="contractTimingDays" inquiryId={id!} />
                      <span className="text-muted-foreground text-xs">일</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[80px_1fr_1fr] px-3 py-2 items-center border-b">
                <span className="font-medium">중도금</span>
                <div className="flex items-center gap-1">
                  <InlineNumber value={inquiry.midRatio ?? 0} field="midRatio" inquiryId={id!} />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <InlineSelect
                    value={inquiry.midAfterDelivery || ""}
                    field="midAfterDelivery"
                    inquiryId={id!}
                    options={[
                      { value: "_none", label: "미설정" },
                      { value: "yes", label: "납품후" },
                      { value: "no", label: "납품전" },
                    ]}
                  />
                  <InlineSelect
                    value={inquiry.midTimingType || ""}
                    field="midTimingType"
                    inquiryId={id!}
                    options={[
                      { value: "_none", label: "미설정" },
                      { value: "days", label: "일수지정" },
                      { value: "next_month_end", label: "익월말" },
                      { value: "month_end", label: "월말" },
                    ]}
                  />
                  {inquiry.midTimingType === "days" && (
                    <div className="flex items-center gap-1">
                      <InlineNumber value={inquiry.midTimingDays ?? 0} field="midTimingDays" inquiryId={id!} />
                      <span className="text-muted-foreground text-xs">일</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[80px_1fr_1fr] px-3 py-2 items-center">
                <span className="font-medium">잔금</span>
                <div className="flex items-center gap-1">
                  <InlineNumber value={inquiry.finalRatio ?? 0} field="finalRatio" inquiryId={id!} />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <InlineSelect
                    value={inquiry.finalAfterDelivery || ""}
                    field="finalAfterDelivery"
                    inquiryId={id!}
                    options={[
                      { value: "_none", label: "미설정" },
                      { value: "yes", label: "납품후" },
                      { value: "no", label: "납품전" },
                    ]}
                  />
                  <InlineSelect
                    value={inquiry.finalTimingType || ""}
                    field="finalTimingType"
                    inquiryId={id!}
                    options={[
                      { value: "_none", label: "미설정" },
                      { value: "days", label: "일수지정" },
                      { value: "next_month_end", label: "익월말" },
                      { value: "month_end", label: "월말" },
                    ]}
                  />
                  {inquiry.finalTimingType === "days" && (
                    <div className="flex items-center gap-1">
                      <InlineNumber value={inquiry.finalTimingDays ?? 0} field="finalTimingDays" inquiryId={id!} />
                      <span className="text-muted-foreground text-xs">일</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1">
          <CardTitle className="text-base">파일 목록</CardTitle>
          {inquiry.onedriveFolderId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncFilesMutation.mutate()}
              disabled={syncFilesMutation.isPending}
              data-testid="button-sync-files"
            >
              <RefreshCw className={syncFilesMutation.isPending ? "animate-spin" : ""} />
              <span>파일 새로고침</span>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {filesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : files && files.length > 0 ? (
            <div className="space-y-1">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate"
                  data-testid={`file-${file.id}`}
                >
                  {getFileIcon(file.fileType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  {file.webUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      data-testid={`button-open-file-${file.id}`}
                    >
                      <a href={file.webUrl} target="_blank" rel="noopener noreferrer">열기</a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {inquiry.onedriveFolderId ? "파일이 없습니다. 새로고침을 시도해보세요." : "OneDrive와 연결되지 않은 인콰이어리입니다."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
