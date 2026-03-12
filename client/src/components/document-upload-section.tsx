import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Image, ExternalLink, RefreshCw, Loader2 } from "lucide-react";

type OneDriveFile = {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  mimeType?: string;
};

function FileDropZone({
  label,
  docType,
  apiBase,
  entityId,
}: {
  label: string;
  docType: string;
  apiBase: string;
  entityId: string;
}) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      const res = await fetch(`${apiBase}/${entityId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "업로드 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/${entityId}/documents`] });
      toast({ title: `${label} 업로드 완료` });
    },
    onError: (err: Error) => {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      toast({ title: "PDF 또는 이미지 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid={`dropzone-${docType}`}
      >
        {uploadMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            업로드 중...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              파일을 드래그하거나 클릭하여 선택
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              PDF, PNG, JPG (최대 10MB)
            </span>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
        className="hidden"
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid={`input-file-${docType}`}
      />
    </div>
  );
}

function FileItem({ file }: { file: OneDriveFile }) {
  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
  const isPdf = /\.pdf$/i.test(file.name);
  const icon = isImage ? <Image className="h-4 w-4 text-blue-500" /> : <FileText className="h-4 w-4 text-red-500" />;

  const sizeStr = file.size < 1024
    ? `${file.size}B`
    : file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)}KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <a
      href={file.webUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group"
      data-testid={`file-item-${file.id}`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{file.name}</div>
        <div className="text-[10px] text-muted-foreground">{sizeStr}</div>
      </div>
      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

export function DocumentUploadSection({
  entityId,
  apiBase,
  docTypes,
  title = "거래처 문서",
  folderHint,
}: {
  entityId: string;
  apiBase: string;
  docTypes: { type: string; label: string }[];
  title?: string;
  folderHint?: string;
}) {
  const { toast } = useToast();

  const { data: files, isLoading } = useQuery<OneDriveFile[]>({
    queryKey: [`${apiBase}/${entityId}/documents`],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/${entityId}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/${entityId}/sync-info`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/${entityId}/documents`] });
      toast({ title: "거래처 정보가 OneDrive에 동기화되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const existingDocs = (files || []).filter(f =>
    docTypes.some(dt => f.name.startsWith(dt.type))
  );
  const otherFiles = (files || []).filter(f =>
    !docTypes.some(dt => f.name.startsWith(dt.type))
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-info"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            정보 동기화
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`grid gap-4 ${docTypes.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          {docTypes.map(dt => (
            <FileDropZone
              key={dt.type}
              label={dt.label}
              docType={dt.type}
              apiBase={apiBase}
              entityId={entityId}
            />
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-12" />
        ) : (files && files.length > 0) ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground mb-1">업로드된 파일</div>
            {existingDocs.map(f => <FileItem key={f.id} file={f} />)}
            {otherFiles.map(f => <FileItem key={f.id} file={f} />)}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2">
            아직 업로드된 문서가 없습니다
          </div>
        )}

        {folderHint && (
          <div className="text-[10px] text-muted-foreground">
            OneDrive: {folderHint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
