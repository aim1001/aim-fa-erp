import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSpreadsheet, FileIcon, RefreshCw, Trash2, Check, X, Building2, Search, Save, Loader2, ImagePlus } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef, useEffect } from "react";
import type { Inquiry, InquiryFile, Company, ProductImage, Customer } from "@shared/schema";

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
  none: "-",
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

function ProductImagesSection({ inquiryId }: { inquiryId: string }) {
  const { toast } = useToast();
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data: images = [], isLoading } = useQuery<ProductImage[]>({
    queryKey: [`/api/inquiries/${inquiryId}/product-images`],
  });

  const uploadMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/product-images`, { imageData });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inquiries/${inquiryId}/product-images`] });
    },
    onError: (err: Error) => {
      toast({ title: "이미지 업로드 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const res = await apiRequest("DELETE", `/api/inquiries/${inquiryId}/product-images/${imageId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inquiries/${inquiryId}/product-images`] });
    },
    onError: (err: Error) => {
      toast({ title: "이미지 삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (images.length >= 5) {
          toast({ title: "이미지는 최대 5개까지 등록할 수 있습니다", variant: "destructive" });
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          uploadMutation.mutate(base64);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, [images.length, uploadMutation, toast]);

  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    const handler = (e: Event) => handlePaste(e as ClipboardEvent);
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [isFocused, handlePaste]);

  return (
    <div
      ref={dropZoneRef}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`mt-4 border-t pt-4 outline-none rounded-lg transition-colors ${isFocused ? "ring-2 ring-primary/30 bg-primary/5" : ""}`}
      data-testid="product-images-section"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <ImagePlus className="h-4 w-4" />
          제품 이미지 ({images.length}/5)
        </p>
        {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="aspect-square rounded-lg" />
          <Skeleton className="aspect-square rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted/30">
              <img
                src={img.imageData}
                alt="제품 이미지"
                className="w-full h-full object-contain"
                data-testid={`img-product-${img.id}`}
              />
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteMutation.mutate(img.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-image-${img.id}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {images.length < 5 && (
            <div
              className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-primary/70 transition-colors"
              onClick={() => dropZoneRef.current?.focus()}
              data-testid="area-paste-image"
            >
              <ImagePlus className="h-6 w-6 mb-1" />
              <span className="text-xs text-center px-2">{isFocused ? "Ctrl+V로\n붙여넣기" : "클릭 후\nCtrl+V"}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ExcelCustomerInfo {
  sheetName: string;
  quoteNumber: string;
  companyName: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  projectName: string;
  quoteDate: string;
}

interface ScanResult {
  scanned: ExcelCustomerInfo[];
  existingMatches: Record<string, Company[]>;
}

function CustomerLinkSection({ inquiryId, inquiry }: { inquiryId: string; inquiry: Inquiry }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: searchResults = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 1) return [];
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length >= 1,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const linkMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/link-customer`, { customerId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객사 연결 완료" });
      setSearchQuery("");
      setShowDropdown(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  if (inquiry.customerId) return null;

  return (
    <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 mt-2">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">고객사 미연결 - 기존 고객사를 검색하여 연결하세요</p>
      <div className="relative" ref={ref}>
        <Input
          placeholder="고객사명으로 검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="h-8 text-sm"
          data-testid="input-link-customer-search"
        />
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-40 overflow-auto">
            {searchResults.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                onClick={() => linkMutation.mutate(c.id)}
                disabled={linkMutation.isPending}
                data-testid={`option-link-customer-${c.id}`}
              >
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <div>
                  <span className="font-medium">{c.companyName}</span>
                  {c.businessNumber && <span className="text-muted-foreground ml-2 text-xs">{c.businessNumber}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CustomerCandidate {
  id: string;
  companyName: string;
  businessNumber?: string | null;
  address?: string | null;
}

interface SaveCustomerResponse {
  needsSelection?: boolean;
  candidates?: CustomerCandidate[];
  companyName?: string;
  customer?: Customer;
  company?: Company;
  inquiryId?: string;
}

function CustomerMatchDialog({ candidates, companyName, pendingInfo, inquiryId, onClose }: {
  candidates: CustomerCandidate[];
  companyName: string;
  pendingInfo: ExcelCustomerInfo;
  inquiryId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const saveWithSelectionMutation = useMutation({
    mutationFn: async (params: { selectedCustomerId?: string; forceCreate?: boolean }) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/save-customer-info`, {
        companyName: pendingInfo.companyName,
        address: pendingInfo.address,
        contactName: pendingInfo.contactName,
        email: pendingInfo.email,
        phone: pendingInfo.phone,
        selectedCustomerId: params.selectedCustomerId || null,
        forceCreate: params.forceCreate || false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객 정보 저장 완료" });
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            유사 고객사 발견
          </DialogTitle>
          <DialogDescription>
            "{companyName}"과(와) 유사한 기존 고객사가 {candidates.length}건 발견되었습니다. 기존 고객사에 연결하거나 새로 생성할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">기존 고객사에 연결</p>
          <div className="space-y-1.5 max-h-48 overflow-auto">
            {candidates.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`w-full text-left border rounded-md p-2.5 text-sm transition-colors ${selectedCandidateId === c.id ? "border-primary bg-primary/5" : "bg-background hover-elevate"}`}
                onClick={() => setSelectedCandidateId(c.id)}
                data-testid={`button-candidate-customer-${c.id}`}
              >
                <div className="font-medium flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  {c.companyName}
                </div>
                {(c.businessNumber || c.address) && (
                  <div className="text-xs text-muted-foreground mt-0.5 ml-5">
                    {[c.businessNumber, c.address].filter(Boolean).join(" | ")}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button
              size="sm"
              onClick={() => saveWithSelectionMutation.mutate({ selectedCustomerId: selectedCandidateId! })}
              disabled={!selectedCandidateId || saveWithSelectionMutation.isPending}
              data-testid="button-confirm-link-customer"
            >
              {saveWithSelectionMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              <span>선택한 고객사에 연결</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveWithSelectionMutation.mutate({ forceCreate: true })}
              disabled={saveWithSelectionMutation.isPending}
              data-testid="button-force-create-customer"
            >
              <span>새 고객사 생성</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              data-testid="button-cancel-match"
            >
              취소
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerInfoSection({ inquiryId, inquiry, hasOneDrive }: {
  inquiryId: string;
  inquiry: Inquiry;
  hasOneDrive: boolean;
}) {
  const { toast } = useToast();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<{ candidates: CustomerCandidate[]; companyName: string; pendingInfo: ExcelCustomerInfo } | null>(null);

  const hasSnapshot = !!inquiry.snapshotCompanyName;

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/scan-excel`);
      return res.json() as Promise<ScanResult>;
    },
    onSuccess: (data) => {
      setScanResult(data);
      if (data.scanned.length > 0) {
        setSelectedIdx(0);
        const firstMatches = data.existingMatches[data.scanned[0].companyName];
        if (firstMatches && firstMatches.length > 0) {
          setMode("existing");
          setSelectedExistingId(firstMatches[0].id);
        } else {
          setMode("new");
          setSelectedExistingId(null);
        }
      }
      if (data.scanned.length === 0) {
        toast({ title: "고객 정보를 찾을 수 없습니다", description: "엑셀 파일에 유효한 고객 정보가 없습니다.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "엑셀 스캔 실패", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (info: ExcelCustomerInfo) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/save-customer-info`, {
        companyName: info.companyName,
        address: info.address,
        contactName: info.contactName,
        email: info.email,
        phone: info.phone,
      });
      return res.json() as Promise<SaveCustomerResponse>;
    },
    onSuccess: (data, info) => {
      if (data.needsSelection && data.candidates && data.candidates.length > 0) {
        setMatchCandidates({ candidates: data.candidates, companyName: data.companyName || info.companyName, pendingInfo: info });
        return;
      }
      toast({ title: "고객 정보 저장 완료" });
      resetScan();
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/link-company`, { companyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "기존 회사 연결 완료" });
      resetScan();
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const resetScan = () => {
    setScanResult(null);
    setSelectedIdx(null);
    setMode("new");
    setSelectedExistingId(null);
    setMatchCandidates(null);
  };

  const selected = scanResult && selectedIdx !== null ? scanResult.scanned[selectedIdx] : null;
  const existingForSelected = selected ? (scanResult?.existingMatches[selected.companyName] || []) : [];
  const isSaving = saveMutation.isPending || linkMutation.isPending;

  const handleSelectScanned = (idx: number) => {
    setSelectedIdx(idx);
    const info = scanResult!.scanned[idx];
    const matches = scanResult!.existingMatches[info.companyName] || [];
    if (matches.length > 0) {
      setMode("existing");
      setSelectedExistingId(matches[0].id);
    } else {
      setMode("new");
      setSelectedExistingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          고객사 정보
        </CardTitle>
        {hasOneDrive && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            data-testid="button-scan-excel"
          >
            {scanMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
            <span>엑셀에서 가져오기</span>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {hasSnapshot && !scanResult ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[80px_1fr] gap-y-2 gap-x-2 text-sm">
              <span className="text-muted-foreground">회사명</span>
              <span className="font-medium" data-testid="text-company-name">{inquiry.snapshotCompanyName}</span>
              <span className="text-muted-foreground">주소</span>
              <span data-testid="text-company-address">{inquiry.snapshotAddress || "-"}</span>
              <span className="text-muted-foreground">담당자</span>
              <span data-testid="text-company-contact">{inquiry.snapshotContactName || "-"}</span>
              <span className="text-muted-foreground">이메일</span>
              <span data-testid="text-company-email">{inquiry.snapshotEmail || "-"}</span>
              <span className="text-muted-foreground">전화번호</span>
              <span data-testid="text-company-phone">{inquiry.snapshotPhone || "-"}</span>
            </div>
            <div className="pt-2">
              {inquiry.customerId ? (
                <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="status-customer-linked">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">고객사 연결됨</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/customers/${inquiry.customerId}`}>
                        <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-customer">고객사 정보 보기 →</span>
                      </Link>
                      {inquiry.companyId && (
                        <Link href={`/companies/${inquiry.companyId}`}>
                          <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-original-company">담당자 정보 보기 →</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" data-testid="status-customer-unlinked">
                  <Search className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">고객사 미연결</p>
                    <p className="text-xs text-muted-foreground">아래에서 기존 고객사를 검색하여 연결하세요</p>
                  </div>
                  {inquiry.companyId && (
                    <Link href={`/companies/${inquiry.companyId}`}>
                      <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-original-company">담당자 정보 →</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
            <CustomerLinkSection inquiryId={inquiryId} inquiry={inquiry} />
          </div>
        ) : !scanResult ? (
          <div>
            <p className="text-sm text-muted-foreground py-2 text-center">
              {hasOneDrive ? "\"엑셀에서 가져오기\" 버튼을 눌러 고객 정보를 불러오세요." : "연결된 고객사가 없습니다."}
            </p>
            <CustomerLinkSection inquiryId={inquiryId} inquiry={inquiry} />
          </div>
        ) : null}

        {matchCandidates && (
          <CustomerMatchDialog
            candidates={matchCandidates.candidates}
            companyName={matchCandidates.companyName}
            pendingInfo={matchCandidates.pendingInfo}
            inquiryId={inquiryId}
            onClose={() => {
              setMatchCandidates(null);
              resetScan();
            }}
          />
        )}

        {scanResult && scanResult.scanned.length > 0 && (
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">엑셀에서 발견된 고객 정보 ({scanResult.scanned.length}건)</p>
              {scanResult.scanned.length > 1 && (
                <div className="flex gap-1 flex-wrap mb-3">
                  {scanResult.scanned.map((info, idx) => (
                    <Button
                      key={idx}
                      variant={selectedIdx === idx ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleSelectScanned(idx)}
                      data-testid={`button-select-customer-${idx}`}
                    >
                      {info.companyName} ({info.sheetName})
                    </Button>
                  ))}
                </div>
              )}

              {selected && (
                <div className="space-y-3">
                  <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 text-sm">
                    <span className="text-muted-foreground">시트명</span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">{selected.sheetName}</span>
                    <span className="text-muted-foreground">회사명</span>
                    <span className="font-medium">{selected.companyName}</span>
                    <span className="text-muted-foreground">주소</span>
                    <span>{selected.address || "-"}</span>
                    <span className="text-muted-foreground">담당자</span>
                    <span>{selected.contactName || "-"}</span>
                    <span className="text-muted-foreground">이메일</span>
                    <span>{selected.email || "-"}</span>
                    <span className="text-muted-foreground">전화번호</span>
                    <span>{selected.phone || "-"}</span>
                  </div>

                  {existingForSelected.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">유사한 기존 회사 발견 ({existingForSelected.length}건)</p>
                      <div className="flex gap-2 mb-2">
                        <Button
                          variant={mode === "existing" ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            setMode("existing");
                            if (!selectedExistingId && existingForSelected.length > 0) setSelectedExistingId(existingForSelected[0].id);
                          }}
                          data-testid="button-mode-existing"
                        >
                          기존 회사 연결
                        </Button>
                        <Button
                          variant={mode === "new" ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setMode("new")}
                          data-testid="button-mode-new"
                        >
                          새로 등록
                        </Button>
                      </div>

                      {mode === "existing" && (
                        <div className="space-y-1.5">
                          {existingForSelected.map((ec) => (
                            <button
                              type="button"
                              key={ec.id}
                              className={`w-full text-left border rounded-md p-2 text-sm transition-colors ${selectedExistingId === ec.id ? "border-primary bg-primary/5" : "bg-background hover:bg-accent"}`}
                              onClick={() => setSelectedExistingId(ec.id)}
                              data-testid={`button-existing-company-${ec.id}`}
                            >
                              <div className="font-medium">{ec.companyName}</div>
                              <div className="text-xs text-muted-foreground">
                                {[ec.contactName, ec.email, ec.phone].filter(Boolean).join(" | ") || "정보 없음"}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    {mode === "existing" && selectedExistingId ? (
                      <Button
                        size="sm"
                        onClick={() => linkMutation.mutate(selectedExistingId!)}
                        disabled={isSaving || !selectedExistingId}
                        data-testid="button-link-existing-company"
                      >
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                        <span>기존 회사 연결</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate(selected)}
                        disabled={isSaving}
                        data-testid="button-save-customer-info"
                      >
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                        <span>{existingForSelected.length > 0 ? "새 회사로 등록" : "이 정보로 저장"}</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={resetScan}
                      data-testid="button-cancel-scan"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InquiryDetailContent({ inquiryId, onClose, onDeleted }: {
  inquiryId: string;
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const { toast } = useToast();
  const id = inquiryId;

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
      onDeleted?.();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">인콰이어리를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold flex-1" data-testid="text-inquiry-title">
          {inquiry.inquiryNumber} - {inquiry.customerName}
        </h2>
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
                value={inquiry.status || "none"}
                field="status"
                inquiryId={id!}
                options={[
                  { value: "none", label: "-" },
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

      <CustomerInfoSection inquiryId={id!} inquiry={inquiry} hasOneDrive={!!inquiry.onedriveFolderId} />

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

          <ProductImagesSection inquiryId={id!} />
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

export function InquiryDetailDialog({ inquiryId, open, onOpenChange }: {
  inquiryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="sr-only">인콰이어리 상세</DialogTitle>
          <DialogDescription className="sr-only">인콰이어리 상세 정보를 확인하고 수정할 수 있습니다</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-4rem)] px-6 pb-6">
          {inquiryId && (
            <InquiryDetailContent
              inquiryId={inquiryId}
              onClose={() => onOpenChange(false)}
              onDeleted={() => onOpenChange(false)}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function InquiryDetail() {
  return null;
}
