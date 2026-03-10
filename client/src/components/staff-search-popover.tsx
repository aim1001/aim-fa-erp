import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, UserPlus } from "lucide-react";
import type { Staff } from "@shared/schema";

export default function StaffSearchPopover({ staffList, selectedStaffId, contactPerson, onSelect, container }: {
  staffList: Staff[];
  selectedStaffId: string;
  contactPerson: string;
  onSelect: (staffId: string, name: string) => void;
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: "", department: "", title: "" });
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; department: string; title: string }) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: (created: Staff) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      onSelect(created.id, created.name);
      setOpen(false);
      setSearch("");
      setShowNew(false);
      setNewStaff({ name: "", department: "", title: "" });
      toast({ title: "인력풀에 등록되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!search) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s => s.name.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q) || s.title?.toLowerCase().includes(q));
  }, [staffList, search]);

  const displayLabel = contactPerson || "담당자 선택";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSearch(""); setShowNew(false); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 text-sm px-3 w-full border rounded-md text-left truncate flex items-center justify-between hover:bg-muted/50"
          data-testid="button-select-staff"
        >
          <span className={contactPerson ? "" : "text-muted-foreground"}>{displayLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" container={container}>
        {!showNew ? (
          <>
            <div className="p-2 border-b">
              <Input
                placeholder="이름 검색 또는 직접 입력..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-7 text-xs"
                autoFocus
                data-testid="input-staff-search"
                onKeyDown={e => {
                  if (e.key === "Enter" && search.trim()) {
                    onSelect("", search.trim());
                    setOpen(false);
                    setSearch("");
                  }
                }}
              />
            </div>
            <ScrollArea className="max-h-[180px]">
              {search.trim() && !filtered.some(s => s.name === search.trim()) && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted text-blue-600 font-medium border-b"
                  onClick={() => { onSelect("", search.trim()); setOpen(false); setSearch(""); }}
                  data-testid="button-staff-direct-input"
                >
                  "{search.trim()}" 직접 입력
                </button>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${selectedStaffId === s.id ? "bg-accent font-medium" : ""}`}
                  onClick={() => { onSelect(s.id, s.name); setOpen(false); setSearch(""); }}
                  data-testid={`staff-option-${s.id}`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground ml-1">{s.title || s.department}</span>
                </button>
              ))}
              {filtered.length === 0 && !search.trim() && (
                <p className="p-3 text-xs text-muted-foreground text-center">등록된 인력이 없습니다</p>
              )}
            </ScrollArea>
            <div className="border-t p-1.5">
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded flex items-center gap-1.5 text-blue-600 font-medium"
                onClick={() => setShowNew(true)}
                data-testid="button-new-staff"
              >
                <UserPlus className="h-3.5 w-3.5" />
                새 인력 등록
              </button>
            </div>
          </>
        ) : (
          <div className="p-3 space-y-2">
            <p className="text-xs font-medium">새 인력 등록</p>
            <div>
              <Label className="text-[10px]">이름 *</Label>
              <Input className="h-7 text-xs" value={newStaff.name} onChange={e => setNewStaff(f => ({ ...f, name: e.target.value }))} data-testid="input-new-staff-name" autoFocus />
            </div>
            <div>
              <Label className="text-[10px]">부서 *</Label>
              <Input className="h-7 text-xs" value={newStaff.department} onChange={e => setNewStaff(f => ({ ...f, department: e.target.value }))} data-testid="input-new-staff-department" />
            </div>
            <div>
              <Label className="text-[10px]">직함</Label>
              <Input className="h-7 text-xs" value={newStaff.title} onChange={e => setNewStaff(f => ({ ...f, title: e.target.value }))} data-testid="input-new-staff-title" />
            </div>
            <div className="flex gap-1 pt-1">
              <Button size="sm" className="h-7 text-xs flex-1" disabled={!newStaff.name.trim() || !newStaff.department.trim() || createMutation.isPending} onClick={() => createMutation.mutate(newStaff)} data-testid="button-confirm-new-staff">
                {createMutation.isPending ? "등록 중..." : "등록 후 선택"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNew(false)}>취소</Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
