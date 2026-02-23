import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Trash2, Check, X, FileText, Users, Link2, AlertCircle, Unlink } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useEffect, useRef } from "react";
import type { Company, Customer, Inquiry } from "@shared/schema";

function useCompanyUpdate(companyId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/companies/${companyId}`, patch);
      return res.json();
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: [`/api/companies/${companyId}`] });
      const prev = queryClient.getQueryData<Company>([`/api/companies/${companyId}`]);
      if (prev) {
        queryClient.setQueryData([`/api/companies/${companyId}`], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (err: Error, _patch, context) => {
      if (context?.prev) {
        queryClient.setQueryData([`/api/companies/${companyId}`], context.prev);
      }
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
  });
}

function InlineField({ value, field, companyId, placeholder }: {
  value: string;
  field: string;
  companyId: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const mutation = useCompanyUpdate(companyId);

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
          data-testid={`input-company-${field}`}
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
      data-testid={`text-editable-company-${field}`}
    >
      {value || <span className="text-muted-foreground">{placeholder || "-"}</span>}
    </span>
  );
}

function CustomerLinkWidget({ companyId, company }: { companyId: string; company: Company }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState(company.isTemporary ? company.companyName : "");
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
      const res = await apiRequest("POST", `/api/companies/${companyId}/link-customer`, { customerId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객사 연결 완료" });
      setSearchQuery("");
      setShowDropdown(false);
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/unlink-customer`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객사 연결 해제 완료" });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 해제 실패", description: err.message, variant: "destructive" });
    },
  });

  if (company.customerId && !company.isTemporary) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs gap-1">
          <Link2 className="h-3 w-3" />연결됨
        </Badge>
        <Link href={`/customers/${company.customerId}`}>
          <span className="text-sm text-primary hover:underline cursor-pointer" data-testid="link-parent-customer">소속 고객사 보기 →</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-6 text-muted-foreground"
          onClick={() => {
            if (confirm("고객사 연결을 해제하시겠습니까?")) unlinkMutation.mutate();
          }}
          disabled={unlinkMutation.isPending}
          data-testid="button-unlink-customer"
        >
          <Unlink className="h-3 w-3 mr-1" />연결해제
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs gap-1 border-amber-500 text-amber-600">
          <AlertCircle className="h-3 w-3" />임시
        </Badge>
        <span className="text-xs text-amber-700 dark:text-amber-400">고객사에 연결되지 않은 임시 담당자입니다</span>
      </div>
      <div className="relative" ref={ref}>
        <Input
          placeholder="고객사명으로 검색하여 연결..."
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
        {searchQuery.length >= 1 && searchResults.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">일치하는 고객사가 없습니다. 엑셀 고객사 동기화 후 다시 시도해보세요.</p>
        )}
      </div>
    </div>
  );
}

export default function CompanyDetail() {
  const [, params] = useRoute("/companies/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: company, isLoading } = useQuery<Company>({
    queryKey: [`/api/companies/${id}`],
    enabled: !!id,
  });

  const { data: allInquiries } = useQuery<Inquiry[]>({
    queryKey: ["/api/inquiries"],
  });

  const relatedInquiries = allInquiries?.filter(i => i.companyId === id) || [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      navigate("/companies");
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">담당자를 찾을 수 없습니다.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/companies">목록으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/companies"><ArrowLeft /></Link>
        </Button>
        <Users className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold flex-1" data-testid="text-company-title">
          {company.contactName || company.companyName}
        </h1>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("정말 삭제하시겠습니까?")) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
          data-testid="button-delete-company"
        >
          <Trash2 className="h-4 w-4" />
          <span>삭제</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>

      <CustomerLinkWidget companyId={id!} company={company} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">담당자 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[80px_1fr] gap-y-3 gap-x-2 text-sm items-center">
            <span className="text-muted-foreground">회사명</span>
            <InlineField value={company.companyName} field="companyName" companyId={id!} />

            <span className="text-muted-foreground">담당자</span>
            <InlineField value={company.contactName || ""} field="contactName" companyId={id!} placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">이메일</span>
            <InlineField value={company.email || ""} field="email" companyId={id!} placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">전화번호</span>
            <InlineField value={company.phone || ""} field="phone" companyId={id!} placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">팩스</span>
            <InlineField value={company.fax || ""} field="fax" companyId={id!} placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">주소</span>
            <InlineField value={company.address || ""} field="address" companyId={id!} placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">메모</span>
            <InlineField value={company.memo || ""} field="memo" companyId={id!} placeholder="클릭하여 입력" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">관련 인콰이어리 ({relatedInquiries.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {relatedInquiries.length > 0 ? (
            <div className="space-y-1">
              {relatedInquiries.map((inquiry) => (
                <Link key={inquiry.id} href={`/inquiries?detail=${inquiry.id}`}>
                  <div className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`inquiry-link-${inquiry.id}`}>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {inquiry.inquiryNumber} - {inquiry.customerName}
                        {inquiry.productInfo ? ` (${inquiry.productInfo})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{inquiry.year}년</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">연결된 인콰이어리가 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
