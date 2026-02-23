import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { Inquiry } from "@shared/schema";

const statusLabels: Record<string, string> = {
  active: "진행중",
  won: "수주",
  lost: "실주",
  pending: "대기",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  won: "default",
  lost: "destructive",
  pending: "secondary",
};

export default function InquiryList() {
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const urlParams = new URLSearchParams(window.location.search);
  const yearFilter = urlParams.get("year") || "all";

  const handleYearChange = (value: string) => {
    if (value === "all") {
      navigate("/inquiries");
    } else {
      navigate(`/inquiries?year=${value}`);
    }
  };

  const effectiveYear = yearFilter;

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years"],
  });

  const queryParams = new URLSearchParams();
  if (effectiveYear && effectiveYear !== "all") queryParams.set("year", effectiveYear);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  const queryString = queryParams.toString();

  const { data: inquiries, isLoading } = useQuery<Inquiry[]>({
    queryKey: ["/api/inquiries", queryString ? `?${queryString}` : ""],
  });

  const filtered = useMemo(() => {
    if (!inquiries) return [];
    if (!search) return inquiries;
    const s = search.toLowerCase();
    return inquiries.filter(i =>
      i.customerName.toLowerCase().includes(s) ||
      i.inquiryNumber.toLowerCase().includes(s) ||
      (i.productInfo && i.productInfo.toLowerCase().includes(s))
    );
  }, [inquiries, search]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-inquiry-list-title">인콰이어리 목록</h1>
        <Button asChild data-testid="button-add-inquiry">
          <Link href="/inquiries/new">
            <Plus />
            <span>인콰이어리 추가</span>
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객명, 영업번호 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={effectiveYear !== "all" ? effectiveYear : "all"} onValueChange={handleYearChange}>
              <SelectTrigger className="w-32" data-testid="select-year">
                <SelectValue placeholder="연도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 연도</SelectItem>
                {(years || []).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32" data-testid="select-status">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="active">진행중</SelectItem>
                <SelectItem value="won">수주</SelectItem>
                <SelectItem value="lost">실주</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>영업번호</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>제품정보</TableHead>
                  <TableHead>연도</TableHead>
                  <TableHead>확률</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>예상일자</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {search ? "검색 결과가 없습니다" : "인콰이어리가 없습니다. OneDrive를 동기화하거나 새로 추가하세요."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((inq) => (
                    <TableRow
                      key={inq.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => navigate(`/inquiries/${inq.id}`)}
                      data-testid={`row-inquiry-${inq.id}`}
                    >
                      <TableCell className="font-mono text-sm">{inq.inquiryNumber}</TableCell>
                      <TableCell className="font-medium">{inq.customerName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{inq.productInfo || "-"}</TableCell>
                      <TableCell>{inq.year}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${(inq.probability || 0) >= 61 ? "text-green-600 dark:text-green-400" : ""}`}>
                          {inq.probability || 0}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[inq.status || "active"] || "secondary"}>
                          {statusLabels[inq.status || "active"] || inq.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inq.expectedDate || "-"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/inquiries/${inq.id}`); }}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground" data-testid="text-result-count">
        총 {filtered.length}건
      </div>
    </div>
  );
}
