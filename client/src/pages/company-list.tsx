import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, Link2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Company } from "@shared/schema";

export default function CompanyList() {
  const [filter, setFilter] = useState<"all" | "linked" | "temporary">("all");
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
            <Link key={company.id} href={`/companies/${company.id}`}>
              <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-company-${company.id}`}>
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
                </CardContent>
              </Card>
            </Link>
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
