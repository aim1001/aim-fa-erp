import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Search, Trash2, Star } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vendor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VendorDetailModal({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: vendor } = useQuery<Vendor>({
    queryKey: ["/api/vendors", vendorId],
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendorId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (field: string) => {
    if (vendor && editValue !== ((vendor as any)[field] || "")) {
      updateMutation.mutate({ [field]: editValue || null });
    }
    setEditing(null);
  };

  const renderField = (label: string, field: string, value: string) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      {editing === field ? (
        <Input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Enter") handleSave(field);
            if (e.key === "Escape") setEditing(null);
          }}
          onBlur={() => handleSave(field)}
          data-testid={`input-vendor-${field}`}
        />
      ) : (
        <span
          className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 min-h-[1.5rem] inline-block"
          onClick={() => { setEditing(field); setEditValue(value); }}
          data-testid={`text-vendor-${field}`}
        >
          {value || <span className="text-muted-foreground">클릭하여 입력</span>}
        </span>
      )}
    </>
  );

  if (!vendor) {
    return (
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 mt-4" /></div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-vendor-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {vendor.companyName}
          </DialogTitle>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { if (confirm("이 공급업체를 삭제하시겠습니까?")) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-vendor"
          >
            <Trash2 className="h-4 w-4" />
            <span>삭제</span>
          </Button>
        </div>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">업체 정보</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
              {renderField("상호명", "companyName", vendor.companyName)}
              {renderField("사업자등록번호", "businessNumber", vendor.businessNumber || "")}
              {renderField("대표자", "representative", vendor.representative || "")}
              {renderField("주소", "address", vendor.address || "")}
              {renderField("전화번호", "phone", vendor.phone || "")}
              {renderField("팩스", "fax", vendor.fax || "")}
              {renderField("메모", "memo", vendor.memo || "")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">담당자 정보</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
              {renderField("담당자명", "contactName", vendor.contactName || "")}
              {renderField("이메일", "contactEmail", vendor.contactEmail || "")}
              {renderField("전화번호", "contactPhone", vendor.contactPhone || "")}
            </div>
          </CardContent>
        </Card>
      </div>
    </DialogContent>
  );
}

export default function VendorList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const { data: vendorList, isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const favoriteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${id}/favorite`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/vendors"] });
      const prev = queryClient.getQueryData<Vendor[]>(["/api/vendors"]);
      if (prev) {
        queryClient.setQueryData(["/api/vendors"], prev.map(v =>
          v.id === id ? { ...v, isFavorite: !v.isFavorite } : v
        ));
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/vendors"], context.prev);
      toast({ title: "즐겨찾기 변경 실패", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { companyName: string }) => {
      const res = await apiRequest("POST", "/api/vendors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setShowAdd(false);
      setNewName("");
      toast({ title: "공급업체가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!vendorList) return [];
    let list = vendorList;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(v =>
        v.companyName.toLowerCase().includes(s) ||
        (v.businessNumber && v.businessNumber.toLowerCase().includes(s)) ||
        (v.contactName && v.contactName.toLowerCase().includes(s))
      );
    }
    return list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.companyName.localeCompare(b.companyName);
    });
  }, [vendorList, search]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-vendor-list-title">공급업체 목록</h1>
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-vendor">
          <Plus className="h-4 w-4 mr-1" />
          공급업체 추가
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="업체명, 사업자번호, 담당자 검색"
          className="pl-9"
          data-testid="input-search-vendors"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 py-2.5 px-2"></th>
                <th className="text-left py-2.5 px-4 font-medium">업체명</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">사업자등록번호</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">대표자</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">담당자</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">전화번호</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(vendor => (
                <tr
                  key={vendor.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedVendorId(vendor.id)}
                  data-testid={`row-vendor-${vendor.id}`}
                >
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); favoriteMutation.mutate(vendor.id); }}
                      className="hover:scale-110 transition-transform"
                      data-testid={`button-favorite-vendor-${vendor.id}`}
                    >
                      <Star className={`h-4 w-4 ${vendor.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`} />
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="font-medium">{vendor.companyName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{vendor.businessNumber || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{vendor.representative || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{vendor.contactName || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{vendor.phone || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? <p>검색 결과가 없습니다.</p> : (
            <><p>등록된 공급업체가 없습니다.</p><p className="text-sm mt-1">공급업체 추가 버튼으로 새 업체를 등록하세요.</p></>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">{filtered.length > 0 && `총 ${filtered.length}개`}</div>

      <Dialog open={!!selectedVendorId} onOpenChange={open => { if (!open) setSelectedVendorId(null); }}>
        {selectedVendorId && <VendorDetailModal vendorId={selectedVendorId} onClose={() => setSelectedVendorId(null)} />}
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>공급업체 추가</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>업체명 *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="업체명을 입력하세요" data-testid="input-new-vendor-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAdd(false)} data-testid="button-cancel-add-vendor">취소</Button>
            <Button
              onClick={() => createMutation.mutate({ companyName: newName })}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-confirm-add-vendor"
            >등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
