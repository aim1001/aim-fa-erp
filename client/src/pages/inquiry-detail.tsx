import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileSpreadsheet, FileIcon, RefreshCw, Trash2, Edit } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Inquiry, InquiryFile } from "@shared/schema";

const statusLabels: Record<string, string> = {
  active: "진행중",
  won: "수주",
  lost: "실주",
  pending: "대기",
};

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
        <Button variant="secondary" asChild data-testid="button-edit">
          <Link href={`/inquiries/${id}/edit`}>
            <Edit />
            <span>수정</span>
          </Link>
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("정말 삭제하시겠습니까?")) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
          data-testid="button-delete"
        >
          <Trash2 />
          <span>삭제</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">영업번호</span>
              <span className="font-mono" data-testid="text-inquiry-number">{inquiry.inquiryNumber}</span>

              <span className="text-muted-foreground">고객명</span>
              <span data-testid="text-customer-name">{inquiry.customerName}</span>

              <span className="text-muted-foreground">제품정보</span>
              <span data-testid="text-product-info">{inquiry.productInfo || "-"}</span>

              <span className="text-muted-foreground">연도</span>
              <span data-testid="text-year">{inquiry.year}</span>

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
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">확률</span>
              <span className="font-medium" data-testid="text-probability">{inquiry.probability || 0}%</span>

              <span className="text-muted-foreground">예상일자</span>
              <span data-testid="text-expected-date">{inquiry.expectedDate || "-"}</span>

              <span className="text-muted-foreground">결재조건</span>
              <span data-testid="text-payment-terms">{inquiry.paymentTerms || "-"}</span>

              <span className="text-muted-foreground">상태</span>
              <Badge variant="default" data-testid="text-status">
                {statusLabels[inquiry.status || "active"] || inquiry.status}
              </Badge>

              <span className="text-muted-foreground">메모</span>
              <span data-testid="text-memo" className="whitespace-pre-wrap">{inquiry.memo || "-"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

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
