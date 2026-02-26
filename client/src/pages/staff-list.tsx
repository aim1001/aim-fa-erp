import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Users, Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEPARTMENTS = ["경영지원", "영업", "지원", "제조", "개발"] as const;

function StaffDetailModal({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: staffMember } = useQuery<Staff>({
    queryKey: ["/api/staff", staffId],
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/staff/${staffId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId] });
    },
    onError: (err: Error) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/staff/${staffId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "삭제 완료" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditValue(value || "");
  };

  const saveEdit = (field: string) => {
    if (editValue !== (staffMember as any)?.[field]) {
      updateMutation.mutate({ [field]: editValue || null });
    }
    setEditing(null);
  };

  if (!staffMember) {
    return (
      <DialogContent>
        <div className="space-y-4 p-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DialogContent>
    );
  }

  const fields: { key: string; label: string }[] = [
    { key: "name", label: "이름" },
    { key: "role", label: "담당" },
    { key: "email", label: "이메일" },
    { key: "phone", label: "휴대폰" },
  ];

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2" data-testid="text-staff-detail-title">
          <Users className="h-5 w-5" />
          직원 정보
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">부서</Label>
          <Select
            value={staffMember.department}
            onValueChange={(val) => updateMutation.mutate({ department: val })}
          >
            <SelectTrigger data-testid="select-department-detail">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fields.map(({ key, label }) => (
          <div key={key}>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            {editing === key ? (
              <Input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit(key)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(key); if (e.key === "Escape") setEditing(null); }}
                data-testid={`input-edit-${key}`}
              />
            ) : (
              <div
                className="px-3 py-2 border rounded-md cursor-pointer hover:bg-muted/50 min-h-[40px] flex items-center"
                onClick={() => startEdit(key, (staffMember as any)[key] || "")}
                data-testid={`text-staff-${key}`}
              >
                {(staffMember as any)[key] || <span className="text-muted-foreground text-sm">클릭하여 입력</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => { if (confirm("이 직원을 삭제하시겠습니까?")) deleteMutation.mutate(); }}
          disabled={deleteMutation.isPending}
          data-testid="button-delete-staff"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          삭제
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AddStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", department: "영업", role: "", email: "", phone: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "추가 완료" });
      setForm({ name: "", department: "영업", role: "", email: "", phone: "" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>직원 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>이름 *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="이름"
              data-testid="input-add-name"
            />
          </div>
          <div>
            <Label>부서 *</Label>
            <Select value={form.department} onValueChange={(v) => setForm((p) => ({ ...p, department: v }))}>
              <SelectTrigger data-testid="select-add-department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>담당</Label>
            <Input
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              placeholder="담당 업무"
              data-testid="input-add-role"
            />
          </div>
          <div>
            <Label>이메일</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@company.com"
              data-testid="input-add-email"
            />
          </div>
          <div>
            <Label>휴대폰</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="010-0000-0000"
              data-testid="input-add-phone"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!form.name || createMutation.isPending}
            data-testid="button-submit-staff"
          >
            {createMutation.isPending ? "추가 중..." : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffList() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: staffList, isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const filtered = useMemo(() => {
    if (!staffList) return [];
    return staffList.filter((s) => {
      if (deptFilter !== "all" && s.department !== deptFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.role || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.phone || "").includes(q)
        );
      }
      return true;
    });
  }, [staffList, search, deptFilter]);

  const deptCounts = useMemo(() => {
    if (!staffList) return {};
    const counts: Record<string, number> = { all: staffList.length };
    for (const d of DEPARTMENTS) counts[d] = 0;
    for (const s of staffList) counts[s.department] = (counts[s.department] || 0) + 1;
    return counts;
  }, [staffList]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-staff-title">
            <Users className="h-6 w-6" />
            인력풀
          </h1>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-staff">
            <Plus className="h-4 w-4 mr-1" />
            직원 추가
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {[{ key: "all", label: "전체" }, ...DEPARTMENTS.map((d) => ({ key: d, label: d }))].map(({ key, label }) => (
            <Button
              key={key}
              variant={deptFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setDeptFilter(key)}
              data-testid={`button-filter-${key}`}
            >
              {label}
              {deptCounts[key] != null && (
                <span className="ml-1 text-xs opacity-70">({deptCounts[key]})</span>
              )}
            </Button>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 담당, 이메일 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-staff"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{search || deptFilter !== "all" ? "검색 결과가 없습니다" : "등록된 직원이 없습니다"}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">이름</th>
                  <th className="text-left px-4 py-3 font-medium">부서</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">담당</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">휴대폰</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedId(s.id)}
                    data-testid={`row-staff-${s.id}`}
                  >
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {s.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.role || "-"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.email || "-"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.phone || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!selectedId} onOpenChange={(v) => { if (!v) setSelectedId(null); }}>
        {selectedId && <StaffDetailModal staffId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <AddStaffDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
