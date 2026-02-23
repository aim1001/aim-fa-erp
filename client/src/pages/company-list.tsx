import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Mail, Phone, Link2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company, Customer } from "@shared/schema";

function QuickLinkButton({ company, onOpenChange }: { company: Company; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(company.companyName);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", query],
    queryFn: async () => {
      if (query.length < 1) return [];
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length >= 1 && open,
  });

  const linkMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await apiRequest("POST", `/api/companies/${company.id}/link-customer`, { customerId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "고객사 연결 완료" });
      setOpen(false);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const toggleOpen = useCallback((val: boolean) => {
    setOpen(val);
    onOpenChange(val);
  }, [onOpenChange]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        toggleOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [toggleOpen]);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-6 gap-1 border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950"
        onClick={(e) => { e.stopPropagation(); toggleOpen(true); }}
        data-testid={`button-quick-link-${company.id}`}
      >
        <Link2 className="h-3 w-3" />연결
      </Button>
    );
  }

  return (
    <div ref={ref} className="absolute left-0 right-0 bottom-0 z-10 bg-background border-t p-2 rounded-b-lg shadow-lg" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <Input
        placeholder="고객사 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-7 text-xs mb-1"
        autoFocus
        data-testid={`input-quick-link-search-${company.id}`}
      />
      {results.length > 0 ? (
        <div className="max-h-28 overflow-auto space-y-0.5">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded flex items-center gap-1.5"
              onClick={() => linkMutation.mutate(c.id)}
              disabled={linkMutation.isPending}
              data-testid={`option-quick-link-${company.id}-${c.id}`}
            >
              <Building2 className="h-3 w-3 text-primary shrink-0" />
              <span className="font-medium truncate">{c.companyName}</span>
              {c.businessNumber && <span className="text-muted-foreground ml-1">{c.businessNumber}</span>}
            </button>
          ))}
        </div>
      ) : query.length >= 1 ? (
        <p className="text-xs text-muted-foreground py-1">일치하는 고객사 없음</p>
      ) : null}
    </div>
  );
}

export default function CompanyList() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"all" | "linked" | "temporary">("all");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const filtered = companies?.filter(c => {
    if (filter === "linked") return c.customerId && !c.isTemporary;
    if (filter === "temporary") return !c.customerId || c.isTemporary;
    return true;
  }) || [];

  const tempCount = companies?.filter(c => !c.customerId || c.isTemporary).length || 0;
  const linkedCount = companies?.filter(c => c.customerId && !c.isTemporary).length || 0;

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-company-list-title">담당자 목록</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-xs gap-1"><Link2 className="h-3 w-3" />연결 {linkedCount}</Badge>
            <Badge variant="outline" className="text-xs gap-1 border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3" />임시 {tempCount}</Badge>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-company-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="linked">연결됨</SelectItem>
              <SelectItem value="temporary">임시</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((company) => (
            <Card
              key={company.id}
              className="cursor-pointer hover-elevate h-full relative"
              onClick={() => { if (linkingId !== company.id) navigate(`/companies/${company.id}`); }}
              data-testid={`card-company-${company.id}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="flex-1 truncate">{company.contactName || company.companyName}</span>
                  {company.customerId && !company.isTemporary ? (
                    <Badge variant="secondary" className="text-[10px] shrink-0 gap-0.5"><Link2 className="h-2.5 w-2.5" />연결</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] shrink-0 gap-0.5 border-amber-500 text-amber-600">임시</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="text-xs">소속:</span>
                  <span>{company.companyName}</span>
                </div>
                {company.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{company.phone}</span>
                  </div>
                )}
                {(!company.customerId || company.isTemporary) && (
                  <div className="flex justify-end pt-1">
                    <QuickLinkButton company={company} onOpenChange={(o) => setLinkingId(o ? company.id : null)} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>등록된 담당자가 없습니다.</p>
          <p className="text-sm mt-1">인콰이어리에서 엑셀 스캔을 통해 담당자를 추가할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}

