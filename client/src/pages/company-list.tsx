import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "wouter";
import type { Company } from "@shared/schema";

export default function CompanyList() {
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <h1 className="text-2xl font-semibold" data-testid="text-company-list-title">고객사 목록</h1>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : companies && companies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`}>
              <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-company-${company.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {company.companyName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  {company.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{company.address}</span>
                    </div>
                  )}
                  {company.contactName && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">담당:</span>
                      <span>{company.contactName}</span>
                    </div>
                  )}
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
          <p>등록된 고객사가 없습니다.</p>
          <p className="text-sm mt-1">인콰이어리에서 엑셀 스캔을 통해 고객사를 추가할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
