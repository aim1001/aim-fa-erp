import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Phone, FileText, Plus, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function CustomerList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBizNum, setNewBizNum] = useState("");

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync-customers");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: data.message || "동기화 완료" });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { companyName: string; businessNumber?: string }) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowAdd(false);
      setNewName("");
      setNewBizNum("");
      toast({ title: "고객사가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="text-customer-list-title">고객사 목록</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-customers"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "동기화 중..." : "OneDrive에서 갱신"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-customer">
            <Plus className="h-4 w-4 mr-1" />
            고객사 추가
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : customers && customers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-customer-${customer.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {customer.companyName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  {customer.businessNumber && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>{customer.businessNumber}</span>
                    </div>
                  )}
                  {customer.representative && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">대표:</span>
                      <span>{customer.representative}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{customer.address}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{customer.phone}</span>
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
          <p className="text-sm mt-1">고객사 추가 버튼으로 새 고객사를 등록하세요.</p>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>고객사 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>상호명 *</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="회사명을 입력하세요"
                data-testid="input-new-customer-name"
              />
            </div>
            <div>
              <Label>사업자등록번호</Label>
              <Input
                value={newBizNum}
                onChange={e => setNewBizNum(e.target.value)}
                placeholder="000-00-00000"
                data-testid="input-new-customer-biznum"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAdd(false)} data-testid="button-cancel-add">
              취소
            </Button>
            <Button
              onClick={() => createMutation.mutate({ companyName: newName, businessNumber: newBizNum || undefined })}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-confirm-add"
            >
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
