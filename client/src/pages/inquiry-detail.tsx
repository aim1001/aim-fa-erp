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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { FileSpreadsheet, FileIcon, RefreshCw, Trash2, Check, X, Building2, Search, Save, Loader2, ImagePlus, UserPlus, User, Phone, Mail, Pencil, Briefcase, ExternalLink, MapPin, CalendarDays, Plus, StickyNote, Clock, FileText, Download } from "lucide-react";
import { ko } from "date-fns/locale";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef, useEffect } from "react";
import type { Inquiry, InquiryFile, Company, ProductImage, Customer, InquiryMemo, ContractTemplate } from "@shared/schema";
import { QuotationSection } from "@/components/quotation-section";

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
  const [open, setOpen] = useState(false);
  const mutation = useInlineUpdate(inquiryId);

  const parseDateString = (dateStr: string): Date | undefined => {
    if (!dateStr) return undefined;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-sm justify-start px-1 -mx-1 font-normal hover:bg-muted/50"
          data-testid={`button-date-${field}`}
        >
          <CalendarDays className="mr-1 h-3 w-3 text-muted-foreground" />
          {value || <span className="text-muted-foreground">날짜 선택</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDateString(value)}
          onSelect={(date) => {
            if (date) {
              mutation.mutate({ [field]: formatDate(date) });
              setOpen(false);
            }
          }}
          locale={ko}
        />
        {value && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 text-destructive"
              onClick={() => {
                mutation.mutate({ [field]: null });
                setOpen(false);
              }}
              disabled={mutation.isPending}
              data-testid={`button-clear-date-${field}`}
            >
              <X className="h-3 w-3 mr-1" />
              날짜 지우기
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
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

  const [showChangeSearch, setShowChangeSearch] = useState(false);
  const isLinked = !!inquiry.customerId;

  return (
    <div className={`border rounded-lg p-3 mt-2 ${isLinked ? "bg-muted/30" : "bg-amber-50 dark:bg-amber-950/20"}`}>
      {isLinked && !showChangeSearch ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">다른 고객사로 변경하려면 버튼을 누르세요</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowChangeSearch(true)}
            data-testid="button-change-customer"
          >
            고객 변경
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {isLinked ? "변경할 고객사를 검색하세요" : "고객사 미연결 - 기존 고객사를 검색하여 연결하세요"}
            </p>
            {isLinked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => { setShowChangeSearch(false); setSearchQuery(""); }}
                data-testid="button-cancel-change-customer"
              >
                취소
              </Button>
            )}
          </div>
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
                    onClick={() => {
                      linkMutation.mutate(c.id);
                      setShowChangeSearch(false);
                    }}
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
        </>
      )}
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

function CustomerPreviewDialog({ customerId, inquiryId, open, onOpenChange }: { customerId: string; inquiryId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ companyName: "", address: "", phone: "", businessNumber: "", representative: "" });

  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: open && !!customerId,
  });

  const { data: contacts = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies/by-customer", customerId],
    enabled: open && !!customerId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const res = await apiRequest("PATCH", `/api/customers/${customerId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객사 정보 수정 완료" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (err: Error) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = () => {
    if (customer) {
      setEditForm({
        companyName: customer.companyName || "",
        address: customer.address || "",
        phone: customer.phone || "",
        businessNumber: customer.businessNumber || "",
        representative: customer.representative || "",
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    updateMutation.mutate(editForm);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setIsEditing(false); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {customer?.companyName || "고객사 정보"}
          </DialogTitle>
          <DialogDescription>고객사 및 담당자 정보를 확인합니다.</DialogDescription>
        </DialogHeader>

        {customer ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">사업자 정보</p>
                {!isEditing && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={startEdit} data-testid="button-edit-customer-info">
                    <Pencil className="h-3 w-3 mr-1" />
                    편집
                  </Button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">상호명</label>
                    <Input className="h-8 text-sm" value={editForm.companyName} onChange={e => setEditForm(f => ({ ...f, companyName: e.target.value }))} data-testid="input-edit-company-name" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">사업자번호</label>
                    <Input className="h-8 text-sm" placeholder="000-00-00000" value={editForm.businessNumber} onChange={e => setEditForm(f => ({ ...f, businessNumber: e.target.value }))} data-testid="input-edit-business-number" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">대표자</label>
                    <Input className="h-8 text-sm" value={editForm.representative} onChange={e => setEditForm(f => ({ ...f, representative: e.target.value }))} data-testid="input-edit-representative" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">주소</label>
                    <Input className="h-8 text-sm" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} data-testid="input-edit-address" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">전화</label>
                    <Input className="h-8 text-sm" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-edit-phone" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-customer-edit">
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      저장
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsEditing(false)} data-testid="button-cancel-customer-edit">
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />상호명</span>
                  <span className="font-medium" data-testid="text-preview-company-name">{customer.companyName}</span>
                  {customer.businessNumber && (
                    <>
                      <span className="text-muted-foreground text-xs">사업자번호</span>
                      <span className="text-xs" data-testid="text-preview-business-number">{customer.businessNumber}</span>
                    </>
                  )}
                  {customer.representative && (
                    <>
                      <span className="text-muted-foreground text-xs">대표자</span>
                      <span className="text-xs" data-testid="text-preview-representative">{customer.representative}</span>
                    </>
                  )}
                  <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />주소</span>
                  <span data-testid="text-preview-address">{customer.address || "-"}</span>
                  <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />전화</span>
                  <span data-testid="text-preview-phone">{customer.phone || "-"}</span>
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2">담당자 ({contacts.length}명)</p>
              {contacts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">등록된 담당자가 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map(contact => (
                    <div key={contact.id} className="border rounded p-2 bg-background text-sm" data-testid={`preview-contact-${contact.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {contact.contactName || "-"}
                        </span>
                        {(contact.department || contact.position) && (
                          <span className="text-xs text-muted-foreground">
                            {[contact.department, contact.position].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                        {contact.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <Skeleton className="h-32 w-full" />
        )}

        <div className="flex justify-between items-center pt-2">
          <Link href={`/customers/${customerId}`}>
            <Button variant="outline" size="sm" data-testid="button-goto-customer-detail">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              상세 페이지로 이동
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-customer-preview">
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactMatchSelectionDialog({ candidates, customerName, pendingForm, isPending, onSelect, onForceCreate, onClose }: {
  candidates: CustomerCandidate[];
  customerName: string;
  pendingForm: { contactName: string };
  isPending: boolean;
  onSelect: (customerId: string) => void;
  onForceCreate: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            유사 고객사 발견
          </DialogTitle>
          <DialogDescription>
            "{customerName}"과(와) 유사한 기존 고객사가 {candidates.length}건 있습니다. 기존 고객사에 연결하거나 새로 생성할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5 max-h-48 overflow-auto">
            {candidates.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`w-full text-left border rounded-md p-2.5 text-sm transition-colors ${selectedId === c.id ? "border-primary bg-primary/5" : "bg-background hover:bg-accent"}`}
                onClick={() => setSelectedId(c.id)}
                data-testid={`button-contact-match-candidate-${c.id}`}
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
              onClick={() => selectedId && onSelect(selectedId)}
              disabled={!selectedId || isPending}
              data-testid="button-contact-match-link"
            >
              {isPending ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : <Building2 className="h-4 w-4 mr-1" />}
              기존 고객사에 연결
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onForceCreate}
              disabled={isPending}
              data-testid="button-contact-match-force-create"
            >
              새 고객사 생성
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} data-testid="button-contact-match-cancel">
              취소
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactManagementSection({ customerId, inquiryId, customerName }: { customerId: string | null; inquiryId: string; customerName: string }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [form, setForm] = useState({ contactName: "", email: "", phone: "", position: "", department: "" });
  const [contactMatchCandidates, setContactMatchCandidates] = useState<{ candidates: CustomerCandidate[]; pendingForm: typeof form } | null>(null);

  const { data: contacts = [], isLoading, isError } = useQuery<Company[]>({
    queryKey: ["/api/companies/by-customer", customerId],
    enabled: !!customerId,
  });

  const invalidateAfterCreate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
    queryClient.invalidateQueries({ queryKey: ["/api/companies/by-customer"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
  };

  const createWithCustomerMutation = useMutation({
    mutationFn: async (data: { contactName: string; email: string; phone: string; position: string; department: string; selectedCustomerId?: string; forceCreate?: boolean }) => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/save-customer-info`, {
        companyName: customerName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        selectedCustomerId: data.selectedCustomerId || null,
        forceCreate: data.forceCreate || false,
      });
      return res.json() as Promise<SaveCustomerResponse>;
    },
    onSuccess: (data) => {
      if (data.needsSelection && data.candidates && data.candidates.length > 0) {
        setContactMatchCandidates({ candidates: data.candidates, pendingForm: { ...form } });
        setShowDialog(false);
        return;
      }
      toast({ title: "고객사 생성 및 담당자 등록 완료" });
      setShowDialog(false);
      setForm({ contactName: "", email: "", phone: "", position: "", department: "" });
      invalidateAfterCreate();
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { contactName: string; email: string; phone: string; position: string; department: string }) => {
      const res = await apiRequest("POST", "/api/companies", {
        companyName: data.contactName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        position: data.position || null,
        department: data.department || null,
        customerId,
        isTemporary: false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "담당자 등록 완료" });
      setShowDialog(false);
      setForm({ contactName: "", email: "", phone: "", position: "", department: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/by-customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/companies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "수정 완료" });
      setShowDialog(false);
      setEditTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/companies/by-customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (err: Error) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/by-customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const openAddDialog = () => {
    setDialogMode("add");
    setEditTargetId(null);
    setForm({ contactName: "", email: "", phone: "", position: "", department: "" });
    setShowDialog(true);
  };

  const openEditDialog = (contact: Company) => {
    setDialogMode("edit");
    setEditTargetId(contact.id);
    setForm({
      contactName: contact.contactName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      position: contact.position || "",
      department: contact.department || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!form.contactName.trim()) {
      toast({ title: "담당자명을 입력하세요", variant: "destructive" });
      return;
    }
    if (dialogMode === "edit" && editTargetId) {
      updateMutation.mutate({ id: editTargetId, data: form });
    } else if (!customerId) {
      createWithCustomerMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || createWithCustomerMutation.isPending;

  if (isLoading) return <Skeleton className="h-16 w-full mt-2" />;
  if (isError) return <p className="text-xs text-destructive mt-2">담당자 정보를 불러올 수 없습니다</p>;

  return (
    <>
      <div className="mt-3 border rounded-lg p-3 bg-muted/20">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            담당자 ({contacts.length}명)
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={openAddDialog}
            data-testid="button-add-contact"
          >
            <UserPlus className="h-3 w-3 mr-1" />
            추가
          </Button>
        </div>

        {contacts.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4 px-2 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-500" />
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">담당자 정보가 없습니다</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">고객사의 담당자 이름, 이메일, 전화번호를 등록하세요</p>
            <Button
              onClick={openAddDialog}
              size="sm"
              data-testid="button-register-contact-cta"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              지금 담당자 등록하기
            </Button>
          </div>
        )}

        {contacts.map(contact => (
          <div key={contact.id} className="flex items-center gap-2 py-2 border-b border-border/30 last:border-b-0 text-sm" data-testid={`contact-row-${contact.id}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {contact.contactName || "-"}
                </span>
                {(contact.position || contact.department) && (
                  <span className="text-xs text-muted-foreground">
                    {[contact.department, contact.position].filter(Boolean).join(" / ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {contact.email && (
                  <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                    <Mail className="h-3 w-3 shrink-0" />
                    {contact.email}
                  </span>
                )}
                {contact.phone && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Phone className="h-3 w-3 shrink-0" />
                    {contact.phone}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button size="icon" variant="ghost" onClick={() => openEditDialog(contact)} data-testid={`button-edit-contact-${contact.id}`}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(contact.id)} data-testid={`button-delete-contact-${contact.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogMode === "add" ? "담당자 등록" : "담당자 수정"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "add"
                ? (customerId ? "고객사 담당자의 정보를 입력하세요." : `"${customerName}" 고객사를 자동 생성하고 담당자를 등록합니다.`)
                : "담당자 정보를 수정합니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">담당자명 *</label>
              <Input
                placeholder="홍길동"
                value={form.contactName}
                onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                autoFocus
                data-testid="input-dialog-contact-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">이메일</label>
              <Input
                type="email"
                placeholder="example@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                data-testid="input-dialog-contact-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">전화번호</label>
              <Input
                type="tel"
                placeholder="010-1234-5678"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                data-testid="input-dialog-contact-phone"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">부서</label>
                <Input
                  placeholder="영업부"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  data-testid="input-dialog-contact-department"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">직함</label>
                <Input
                  placeholder="과장"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  data-testid="input-dialog-contact-position"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-dialog-cancel">
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-dialog-submit">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {dialogMode === "add" ? "등록" : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {contactMatchCandidates && (
        <ContactMatchSelectionDialog
          candidates={contactMatchCandidates.candidates}
          customerName={customerName}
          pendingForm={contactMatchCandidates.pendingForm}
          isPending={createWithCustomerMutation.isPending}
          onSelect={(selectedCustomerId) => {
            createWithCustomerMutation.mutate({ ...contactMatchCandidates.pendingForm, selectedCustomerId });
          }}
          onForceCreate={() => {
            createWithCustomerMutation.mutate({ ...contactMatchCandidates.pendingForm, forceCreate: true });
          }}
          onClose={() => setContactMatchCandidates(null)}
        />
      )}
    </>
  );
}

function MemoSection({ inquiryId, legacyMemo }: { inquiryId: string; legacyMemo: string }) {
  const { toast } = useToast();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: memos = [], isLoading } = useQuery<InquiryMemo[]>({
    queryKey: ["/api/inquiries", inquiryId, "memos"],
    queryFn: () => fetch(`/api/inquiries/${inquiryId}/memos`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/inquiries/${inquiryId}/memos`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "memos"] });
      setNewContent("");
    },
    onError: () => toast({ title: "메모 추가 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => apiRequest("PATCH", `/api/inquiry-memos/${id}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "memos"] });
      setEditingId(null);
    },
    onError: () => toast({ title: "메모 수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inquiry-memos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "memos"] });
    },
    onError: () => toast({ title: "메모 삭제 실패", variant: "destructive" }),
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          메모
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="새 메모를 입력하세요..."
            rows={2}
            className="text-sm"
            data-testid="input-new-memo"
          />
          <Button
            size="sm"
            onClick={() => newContent.trim() && createMutation.mutate(newContent.trim())}
            disabled={!newContent.trim() || createMutation.isPending}
            className="self-end"
            data-testid="button-add-memo"
          >
            <Plus className="h-3 w-3 mr-1" />추가
          </Button>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}

        {memos.length > 0 && (
          <div className="space-y-2">
            {memos.map((memo) => (
              <div key={memo.id} className="border rounded-md p-3 space-y-1" data-testid={`memo-item-${memo.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(memo.createdAt)}
                  </span>
                  <div className="flex gap-1">
                    {editingId !== memo.id && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => { setEditingId(memo.id); setEditContent(memo.content); }}
                          data-testid={`button-edit-memo-${memo.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => deleteMutation.mutate(memo.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-memo-${memo.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {editingId === memo.id ? (
                  <div className="space-y-1">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                      className="text-sm"
                      autoFocus
                      data-testid={`input-edit-memo-${memo.id}`}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => editContent.trim() && updateMutation.mutate({ id: memo.id, content: editContent.trim() })}
                        disabled={updateMutation.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" />저장
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{memo.content}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {legacyMemo && memos.length === 0 && !isLoading && (
          <div className="border rounded-md p-3 bg-muted/30">
            <span className="text-xs text-muted-foreground">기존 메모</span>
            <p className="text-sm whitespace-pre-wrap mt-1">{legacyMemo}</p>
          </div>
        )}
      </CardContent>
    </Card>
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
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);
  const [scanFailMessage, setScanFailMessage] = useState<string | null>(null);

  const hasSnapshot = !!inquiry.snapshotCompanyName;

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/scan-excel`);
      return res.json() as Promise<ScanResult>;
    },
    onSuccess: (data) => {
      setScanFailMessage(null);
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
        setScanFailMessage("엑셀 파일에서 유효한 고객 정보를 찾을 수 없습니다.");
      }
    },
    onError: (err: Error) => {
      setScanFailMessage(err.message || "엑셀 스캔 중 오류가 발생했습니다.");
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
        {!scanResult && (
          <div className="space-y-2">
            {inquiry.customerId ? (
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="status-customer-linked">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">고객사 연결됨</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs text-primary hover:underline cursor-pointer"
                      onClick={() => setShowCustomerPreview(true)}
                      data-testid="link-customer"
                    >
                      고객사 정보 보기 →
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" data-testid="status-customer-unlinked">
                <Search className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">고객사 미연결</p>
                  <p className="text-xs text-muted-foreground">아래에서 기존 고객사를 검색하여 연결하거나, 담당자를 등록하세요</p>
                </div>
              </div>
            )}

            <ContactManagementSection customerId={inquiry.customerId || null} inquiryId={inquiryId} customerName={inquiry.customerName || ""} />

            {hasSnapshot && (
              <div className="border rounded-lg p-3 bg-muted/20 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">스냅샷 정보 (엑셀에서 가져온 원본)</p>
                <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 text-sm">
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
              </div>
            )}

            {scanFailMessage && (
              <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/30 mt-2" data-testid="scan-fail-banner">
                <div className="flex items-start gap-2">
                  <Search className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">엑셀 스캔 결과 없음</p>
                    <p className="text-xs text-muted-foreground">{scanFailMessage}</p>
                    <p className="text-xs text-muted-foreground">아래 방법으로 고객사를 등록할 수 있습니다:</p>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      <li>위의 <span className="font-medium text-foreground">담당자 등록</span> 버튼으로 직접 입력</li>
                      <li>아래 검색란에서 기존 고객사를 찾아 연결</li>
                    </ul>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2 mt-1"
                      onClick={() => setScanFailMessage(null)}
                      data-testid="button-dismiss-scan-fail"
                    >
                      닫기
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <CustomerLinkSection inquiryId={inquiryId} inquiry={inquiry} />
          </div>
        )}

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

      {inquiry.customerId && (
        <CustomerPreviewDialog
          customerId={inquiry.customerId}
          inquiryId={inquiryId}
          open={showCustomerPreview}
          onOpenChange={setShowCustomerPreview}
        />
      )}
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-1 mb-3">
        <h2 className="text-xl font-semibold flex-1" data-testid="text-inquiry-title">
          {inquiry.inquiryNumber} - {inquiry.customerName}
        </h2>
        <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>
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

      <Tabs defaultValue="customer" className="flex-1 flex flex-col min-h-0 [&>[data-state=active]]:flex-1 [&>[data-state=active]]:min-h-0">
        <TabsList className="w-full justify-start shrink-0" data-testid="tabs-inquiry-detail">
          <TabsTrigger value="customer" data-testid="tab-customer">고객정보</TabsTrigger>
          <TabsTrigger value="product" data-testid="tab-product">제품정보</TabsTrigger>
          <TabsTrigger value="quotation" data-testid="tab-quotation">견적 및 내역</TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">파일목록</TabsTrigger>
          <TabsTrigger value="contract" data-testid="tab-contract">계약조건</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="flex-1 min-h-0 mt-3 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-4 pr-4">
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

                    </div>
                  </CardContent>
                </Card>
              </div>

              <CustomerInfoSection inquiryId={id!} inquiry={inquiry} hasOneDrive={!!inquiry.onedriveFolderId} />

              <MemoSection inquiryId={id!} legacyMemo={inquiry.memo || ""} />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="product" className="flex-1 min-h-0 mt-3 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-4 pr-4">
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
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="quotation" className="flex-1 min-h-0 mt-3 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pr-4">
              <QuotationSection inquiryId={id!} inquiry={inquiry} />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="files" className="flex-1 min-h-0 mt-3 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pr-4">
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
          </ScrollArea>
        </TabsContent>

        <TabsContent value="contract" className="flex-1 min-h-0 mt-3 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-4 pr-4">
              <ContractConditionsTab key={`contract-${inquiry.contractRatio}-${inquiry.midRatio}-${inquiry.finalRatio}-${inquiry.contractTimingType}-${inquiry.midTimingType}-${inquiry.finalTimingType}-${inquiry.midAfterDelivery}-${inquiry.finalAfterDelivery}-${(inquiry.contractClauses || "").length}-${(inquiry.warrantyTerms || "").length}`} inquiryId={id!} inquiry={inquiry} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContractConditionsTab({ inquiryId, inquiry }: { inquiryId: string; inquiry: Inquiry }) {
  const { toast } = useToast();

  const TIMING_OPTIONS = [
    { value: "end_of_next_month", label: "익월말" },
    { value: "two_weeks", label: "2주이내" },
    { value: "end_of_month", label: "월말" },
    { value: "specific_days", label: "일자지정" },
    { value: "within_days", label: "N일이내" },
  ];

  function mapOldTiming(v: string | null | undefined): string {
    if (!v || v === "_none") return "two_weeks";
    if (v === "days") return "specific_days";
    if (v === "next_month_end") return "end_of_next_month";
    if (v === "month_end") return "end_of_month";
    return v;
  }

  const [contractRatio, setContractRatio] = useState(inquiry.contractRatio ?? 50);
  const [contractTimingType, setContractTimingType] = useState(mapOldTiming(inquiry.contractTimingType) || "two_weeks");
  const [contractTimingDays, setContractTimingDays] = useState(inquiry.contractTimingDays ?? 0);

  const [midRatio, setMidRatio] = useState(inquiry.midRatio ?? 0);
  const [midTimingType, setMidTimingType] = useState(mapOldTiming(inquiry.midTimingType) || "two_weeks");
  const [midTimingDays, setMidTimingDays] = useState(inquiry.midTimingDays ?? 0);
  const [midAfterDelivery, setMidAfterDelivery] = useState(
    inquiry.midAfterDelivery === "true" || inquiry.midAfterDelivery === "yes" || (inquiry.midAfterDelivery == null)
  );

  const [finalRatio, setFinalRatio] = useState(inquiry.finalRatio ?? 50);
  const [finalTimingType, setFinalTimingType] = useState(mapOldTiming(inquiry.finalTimingType) || "two_weeks");
  const [finalTimingDays, setFinalTimingDays] = useState(inquiry.finalTimingDays ?? 0);
  const [finalAfterDelivery, setFinalAfterDelivery] = useState(
    inquiry.finalAfterDelivery === "true" || inquiry.finalAfterDelivery === "yes" || (inquiry.finalAfterDelivery == null)
  );

  const [clauses, setClauses] = useState(inquiry.contractClauses || "");
  const [warrantyTerms, setWarrantyTerms] = useState(inquiry.warrantyTerms || "");
  const [showClauses, setShowClauses] = useState(false);
  const [showWarranty, setShowWarranty] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateContent, setEditTemplateContent] = useState("");

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });

  const ratioSum = contractRatio + midRatio + finalRatio;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/inquiries/${inquiryId}`, {
        contractRatio,
        contractTimingType,
        contractTimingDays,
        midRatio,
        midTimingType,
        midTimingDays,
        midAfterDelivery: midAfterDelivery ? "true" : "false",
        finalRatio,
        finalTimingType,
        finalTimingDays,
        finalAfterDelivery: finalAfterDelivery ? "true" : "false",
        contractClauses: clauses,
        warrantyTerms,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "계약조건 저장 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contract-templates", { name: templateName, content: clauses });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿 저장 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      setShowSaveTemplate(false);
      setTemplateName("");
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, name, content }: { id: string; name: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/contract-templates/${id}`, { name, content });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿 수정 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      setEditingTemplate(null);
    },
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/contract-templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿 삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
    },
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">결제 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { label: "계약금", ratio: contractRatio, setRatio: setContractRatio, timing: contractTimingType, setTiming: setContractTimingType, days: contractTimingDays, setDays: setContractTimingDays, after: false, setAfter: () => {}, showAfter: false },
                { label: "중도금", ratio: midRatio, setRatio: setMidRatio, timing: midTimingType, setTiming: setMidTimingType, days: midTimingDays, setDays: setMidTimingDays, after: midAfterDelivery, setAfter: setMidAfterDelivery, showAfter: true },
                { label: "잔금", ratio: finalRatio, setRatio: setFinalRatio, timing: finalTimingType, setTiming: setFinalTimingType, days: finalTimingDays, setDays: setFinalTimingDays, after: finalAfterDelivery, setAfter: setFinalAfterDelivery, showAfter: true },
              ].map(stage => (
                <div key={stage.label} className="border rounded p-3 bg-muted/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium w-10">{stage.label}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-7 w-16 text-xs"
                        value={stage.ratio}
                        onChange={e => stage.setRatio(Number(e.target.value))}
                        data-testid={`input-contract-${stage.label}-ratio`}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    {stage.showAfter && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={stage.after}
                          onCheckedChange={stage.setAfter}
                          className="scale-75"
                          data-testid={`switch-contract-${stage.label}-after`}
                        />
                        <span className="text-[10px] text-muted-foreground">납품후</span>
                      </div>
                    )}
                    <Select value={stage.timing} onValueChange={stage.setTiming}>
                      <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-contract-${stage.label}-timing`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {stage.timing === "specific_days" && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="h-7 w-14 text-xs"
                          value={stage.days}
                          onChange={e => stage.setDays(Number(e.target.value))}
                          data-testid={`input-contract-${stage.label}-days`}
                        />
                        <span className="text-[10px] text-muted-foreground">일</span>
                      </div>
                    )}
                    {stage.timing === "within_days" && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{stage.showAfter && stage.after ? "납품후" : "계약후"}</span>
                        <Input
                          type="number"
                          className="h-7 w-14 text-xs"
                          value={stage.days}
                          onChange={e => stage.setDays(Number(e.target.value))}
                          data-testid={`input-contract-${stage.label}-within-days`}
                        />
                        <span className="text-[10px] text-muted-foreground">일 이내</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {ratioSum !== 100 && (
                <div className="text-[10px] text-destructive">비율 합계: {ratioSum}% (100%가 되어야 합니다)</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">계약 세부내용</CardTitle>
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-load-template">
                  <Download className="h-3 w-3 mr-1" />템플릿 불러오기
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="end">
                <div className="p-2 border-b">
                  <span className="text-xs font-medium">템플릿 선택</span>
                </div>
                <ScrollArea className="max-h-[200px]">
                  {templates.length === 0 && (
                    <div className="px-3 py-4 text-xs text-center text-muted-foreground">등록된 템플릿이 없습니다</div>
                  )}
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b last:border-0 flex items-center justify-between"
                      onClick={() => {
                        setClauses(t.content);
                        setShowClauses(true);
                        toast({ title: `"${t.name}" 템플릿 적용됨` });
                      }}
                      data-testid={`button-template-${t.id}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{t.name}</span>
                        {t.isDefault && <Badge variant="secondary" className="text-[9px] px-1">기본</Badge>}
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowClauses(!showClauses)}
              data-testid="button-toggle-clauses"
            >
              <Pencil className="h-3 w-3 mr-1" />{showClauses ? "접기" : "편집"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showClauses ? (
            <div className="space-y-2">
              <Textarea
                className="text-xs min-h-[200px] font-mono leading-relaxed"
                value={clauses}
                onChange={e => setClauses(e.target.value)}
                placeholder="계약 세부내용을 입력하세요..."
                data-testid="textarea-contract-clauses"
              />
              <div className="flex items-center gap-1">
                {!showSaveTemplate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={!clauses.trim()}
                    data-testid="button-save-as-template"
                  >
                    <Plus className="h-3 w-3 mr-1" />템플릿으로 저장
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 text-xs w-40"
                      placeholder="템플릿 이름"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      data-testid="input-template-name"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => saveTemplateMutation.mutate()}
                      disabled={!templateName.trim() || saveTemplateMutation.isPending}
                      data-testid="button-confirm-save-template"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => { setShowSaveTemplate(false); setTemplateName(""); }}
                      data-testid="button-cancel-save-template"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {clauses ? clauses : <span className="italic">세부내용이 없습니다. 편집 버튼을 눌러 추가하세요.</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">보증 및 책임범위</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowWarranty(!showWarranty)}
              data-testid="button-toggle-warranty"
            >
              <Pencil className="h-3 w-3 mr-1" />{showWarranty ? "접기" : "편집"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showWarranty ? (
            <Textarea
              className="text-xs min-h-[150px] font-mono leading-relaxed"
              value={warrantyTerms}
              onChange={e => setWarrantyTerms(e.target.value)}
              placeholder="보증 및 책임범위 내용을 입력하세요..."
              data-testid="textarea-warranty-terms"
            />
          ) : (
            <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {warrantyTerms ? warrantyTerms : <span className="italic">내용이 없습니다. 편집 버튼을 눌러 추가하세요.</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">템플릿 관리</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="border rounded p-2 bg-muted/10">
                  {editingTemplate === t.id ? (
                    <div className="space-y-2">
                      <Input
                        className="h-7 text-xs"
                        value={editTemplateName}
                        onChange={e => setEditTemplateName(e.target.value)}
                        data-testid={`input-edit-template-name-${t.id}`}
                      />
                      <Textarea
                        className="text-xs min-h-[120px] font-mono leading-relaxed"
                        value={editTemplateContent}
                        onChange={e => setEditTemplateContent(e.target.value)}
                        data-testid={`textarea-edit-template-${t.id}`}
                      />
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateTemplateMutation.mutate({ id: t.id, name: editTemplateName, content: editTemplateContent })}
                          disabled={updateTemplateMutation.isPending}
                          data-testid={`button-save-edit-template-${t.id}`}
                        >
                          <Check className="h-3 w-3 mr-1" />저장
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingTemplate(null)}
                          data-testid={`button-cancel-edit-template-${t.id}`}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{t.name}</span>
                        {t.isDefault && <Badge variant="secondary" className="text-[9px] px-1">기본</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            setEditingTemplate(t.id);
                            setEditTemplateName(t.name);
                            setEditTemplateContent(t.content);
                          }}
                          data-testid={`button-edit-template-${t.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => {
                            if (confirm("이 템플릿을 삭제하시겠습니까?")) deleteTemplateMutation.mutate(t.id);
                          }}
                          data-testid={`button-delete-template-${t.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        size="sm"
        className="w-full h-8 text-xs"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || ratioSum !== 100}
        data-testid="button-save-contract-conditions"
      >
        <Check className="h-3 w-3 mr-1" />
        {saveMutation.isPending ? "저장중..." : "계약조건 전체 저장"}
      </Button>
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
      <DialogContent className="w-[98vw] h-[95vh] max-w-[98vw] max-h-[95vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
          <DialogTitle className="sr-only">인콰이어리 상세</DialogTitle>
          <DialogDescription className="sr-only">인콰이어리 상세 정보를 확인하고 수정할 수 있습니다</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          {inquiryId && (
            <InquiryDetailContent
              inquiryId={inquiryId}
              onClose={() => onOpenChange(false)}
              onDeleted={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InquiryDetail() {
  return null;
}
