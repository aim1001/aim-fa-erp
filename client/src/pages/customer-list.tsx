import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, Plus, RefreshCw, Search, Trash2, UserPlus, Users, Check, X, FileText, Star } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Company, Inquiry } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function InlineField({ value, field, entityId, entityType, placeholder }: {
  value: string;
  field: string;
  entityId: string;
  entityType: "customer" | "contact";
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const url = entityType === "customer" ? `/api/customers/${entityId}` : `/api/companies/${entityId}`;
      const res = await apiRequest("PATCH", url, patch);
      return res.json();
    },
    onMutate: async (patch) => {
      if (entityType === "customer") {
        await queryClient.cancelQueries({ queryKey: ["/api/customers"] });
        const prev = queryClient.getQueryData<Customer[]>(["/api/customers"]);
        if (prev) {
          queryClient.setQueryData(["/api/customers"], prev.map(c =>
            c.id === entityId ? { ...c, ...patch } : c
          ));
        }
        const prevSingle = queryClient.getQueryData<Customer>([`/api/customers/${entityId}`]);
        if (prevSingle) {
          queryClient.setQueryData([`/api/customers/${entityId}`], { ...prevSingle, ...patch });
        }
        return { prev, prevSingle };
      }
      return {};
    },
    onError: (err: Error, _patch, context: any) => {
      if (entityType === "customer" && context?.prev) {
        queryClient.setQueryData(["/api/customers"], context.prev);
      }
      if (entityType === "customer" && context?.prevSingle) {
        queryClient.setQueryData([`/api/customers/${entityId}`], context.prevSingle);
      }
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      if (entityType === "customer") {
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${entityId}`] });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${entityId}/contacts`] });
      }
    },
  });

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
          data-testid={`input-${entityType}-${field}`}
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
      onClick={(e) => { e.stopPropagation(); setEditValue(value); setEditing(true); }}
      data-testid={`text-editable-${entityType}-${field}`}
    >
      {value || <span className="text-muted-foreground">{placeholder || "-"}</span>}
    </span>
  );
}

function ContactCard({ contact, onDeleted }: { contact: Company; onDeleted: () => void }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/companies/${contact.id}`);
    },
    onSuccess: () => {
      toast({ title: "담당자가 삭제되었습니다" });
      onDeleted();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-contact-${contact.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{contact.contactName || contact.companyName}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              if (confirm("이 담당자를 삭제하시겠습니까?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-contact-${contact.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="grid grid-cols-[70px_1fr] gap-y-2 gap-x-2 text-sm">
          <span className="text-muted-foreground">이름</span>
          <InlineField value={contact.contactName || ""} field="contactName" entityId={contact.id} entityType="contact" placeholder="클릭하여 입력" />
          <span className="text-muted-foreground">이메일</span>
          <InlineField value={contact.email || ""} field="email" entityId={contact.id} entityType="contact" placeholder="클릭하여 입력" />
          <span className="text-muted-foreground">전화</span>
          <InlineField value={contact.phone || ""} field="phone" entityId={contact.id} entityType="contact" placeholder="클릭하여 입력" />
          <span className="text-muted-foreground">팩스</span>
          <InlineField value={contact.fax || ""} field="fax" entityId={contact.id} entityType="contact" placeholder="클릭하여 입력" />
          <span className="text-muted-foreground">메모</span>
          <InlineField value={contact.memo || ""} field="memo" entityId={contact.id} entityType="contact" placeholder="클릭하여 입력" />
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerDetailModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId,
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery<Company[]>({
    queryKey: [`/api/customers/${customerId}/contacts`],
    enabled: !!customerId,
  });

  const { data: allInquiries } = useQuery<Inquiry[]>({
    queryKey: ["/api/inquiries"],
  });

  const relatedInquiries = allInquiries?.filter(i => i.customerId === customerId) || [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: { contactName: string; email?: string; phone?: string }) => {
      const res = await apiRequest("POST", "/api/companies", {
        customerId,
        companyName: customer?.companyName || "",
        contactName: data.contactName,
        email: data.email || null,
        phone: data.phone || null,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchContacts();
      setShowAddContact(false);
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      toast({ title: "담당자가 추가되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  if (!customer) {
    return (
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 mt-4" />
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="modal-customer-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {customer.companyName}
          </DialogTitle>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("이 고객사와 소속 담당자가 모두 삭제됩니다. 계속하시겠습니까?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-customer"
          >
            <Trash2 className="h-4 w-4" />
            <span>삭제</span>
          </Button>
        </div>
      </DialogHeader>

      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">사업자 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
              <span className="text-muted-foreground">상호명</span>
              <InlineField value={customer.companyName} field="companyName" entityId={customerId} entityType="customer" />
              <span className="text-muted-foreground">사업자등록번호</span>
              <InlineField value={customer.businessNumber || ""} field="businessNumber" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">대표자</span>
              <InlineField value={customer.representative || ""} field="representative" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">사업장 주소</span>
              <InlineField value={customer.address || ""} field="address" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">업태</span>
              <InlineField value={customer.businessType || ""} field="businessType" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">종목</span>
              <InlineField value={customer.businessCategory || ""} field="businessCategory" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">전화번호</span>
              <InlineField value={customer.phone || ""} field="phone" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">팩스</span>
              <InlineField value={customer.fax || ""} field="fax" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">메모</span>
              <InlineField value={customer.memo || ""} field="memo" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">비고</span>
              <InlineField value={customer.notes || ""} field="notes" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">등록일자</span>
              <InlineField value={customer.registrationDate || ""} field="registrationDate" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">경영지원 담당자</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
              <span className="text-muted-foreground">부서명</span>
              <InlineField value={customer.mgmtDepartment || ""} field="mgmtDepartment" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">성명</span>
              <InlineField value={customer.mgmtContactName || ""} field="mgmtContactName" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">전화번호</span>
              <InlineField value={customer.mgmtPhone || ""} field="mgmtPhone" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">휴대전화</span>
              <InlineField value={customer.mgmtMobile || ""} field="mgmtMobile" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">팩스</span>
              <InlineField value={customer.mgmtFax || ""} field="mgmtFax" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">이메일</span>
              <InlineField value={customer.mgmtEmail || ""} field="mgmtEmail" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
              <span className="text-muted-foreground">주담당자</span>
              <InlineField value={customer.primaryContact || ""} field="primaryContact" entityId={customerId} entityType="customer" placeholder="클릭하여 입력" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">영업 담당자 ({contacts.length}명)</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => setShowAddContact(true)} data-testid="button-add-contact">
                <UserPlus className="h-4 w-4 mr-1" />
                담당자 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contacts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onDeleted={() => refetchContacts()}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">등록된 담당자가 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {relatedInquiries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">관련 인콰이어리 ({relatedInquiries.length}건)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {relatedInquiries.map((inquiry) => (
                  <div key={inquiry.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50" data-testid={`inquiry-link-${inquiry.id}`}>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {inquiry.inquiryNumber} - {inquiry.customerName}
                        {inquiry.productInfo ? ` (${inquiry.productInfo})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{inquiry.year}년</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>담당자 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>담당자명 *</Label>
              <Input
                value={newContactName}
                onChange={e => setNewContactName(e.target.value)}
                placeholder="이름"
                data-testid="input-new-contact-name"
              />
            </div>
            <div>
              <Label>이메일</Label>
              <Input
                value={newContactEmail}
                onChange={e => setNewContactEmail(e.target.value)}
                placeholder="email@example.com"
                data-testid="input-new-contact-email"
              />
            </div>
            <div>
              <Label>전화번호</Label>
              <Input
                value={newContactPhone}
                onChange={e => setNewContactPhone(e.target.value)}
                placeholder="010-0000-0000"
                data-testid="input-new-contact-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddContact(false)} data-testid="button-cancel-contact">
              취소
            </Button>
            <Button
              onClick={() => addContactMutation.mutate({
                contactName: newContactName,
                email: newContactEmail || undefined,
                phone: newContactPhone || undefined,
              })}
              disabled={!newContactName.trim() || addContactMutation.isPending}
              data-testid="button-confirm-contact"
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DialogContent>
  );
}

type CustomerWithStats = Customer & { inquiryCount: number; lastTransactionDate: string | null };
type FilterTab = "traded" | "untraded" | "bookmarked";

export default function CustomerList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBizNum, setNewBizNum] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("traded");

  const { data: customers, isLoading } = useQuery<CustomerWithStats[]>({
    queryKey: ["/api/customers-with-stats"],
  });

  const favoriteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/customers/${id}/favorite`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customers-with-stats"] });
      const prev = queryClient.getQueryData<CustomerWithStats[]>(["/api/customers-with-stats"]);
      if (prev) {
        queryClient.setQueryData(["/api/customers-with-stats"], prev.map(c =>
          c.id === id ? { ...c, isFavorite: !c.isFavorite } : c
        ));
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/customers-with-stats"], context.prev);
      }
      toast({ title: "즐겨찾기 변경 실패", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
    },
  });

  const filtered = useMemo(() => {
    if (!customers) return [];
    let list = customers;

    if (tab === "traded") {
      list = list.filter(c => c.inquiryCount > 0);
    } else if (tab === "untraded") {
      list = list.filter(c => c.inquiryCount === 0);
    } else if (tab === "bookmarked") {
      list = list.filter(c => c.inquiryCount === 0 && c.isFavorite);
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.companyName.toLowerCase().includes(s) ||
        (c.businessNumber && c.businessNumber.toLowerCase().includes(s)) ||
        (c.representative && c.representative.toLowerCase().includes(s))
      );
    }

    return list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.companyName.localeCompare(b.companyName);
    });
  }, [customers, search, tab]);

  const tabCounts = useMemo(() => {
    if (!customers) return { traded: 0, untraded: 0, bookmarked: 0 };
    return {
      traded: customers.filter(c => c.inquiryCount > 0).length,
      untraded: customers.filter(c => c.inquiryCount === 0).length,
      bookmarked: customers.filter(c => c.inquiryCount === 0 && c.isFavorite).length,
    };
  }, [customers]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync-customers");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
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

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "traded", label: "거래", count: tabCounts.traded },
    { key: "untraded", label: "미거래", count: tabCounts.untraded },
    { key: "bookmarked", label: "북마크", count: tabCounts.bookmarked },
  ];

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
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

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 border rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.key ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="상호명, 사업자번호, 대표자 검색"
            className="pl-9"
            data-testid="input-search-customers"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 py-2.5 px-2"></th>
                <th className="text-left py-2.5 px-4 font-medium">상호명</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">사업자등록번호</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">대표자</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">전화번호</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">최근 거래일</th>
                <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell">인콰이어리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  data-testid={`row-customer-${customer.id}`}
                >
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        favoriteMutation.mutate(customer.id);
                      }}
                      className="hover:scale-110 transition-transform"
                      data-testid={`button-favorite-${customer.id}`}
                    >
                      <Star
                        className={`h-4 w-4 ${customer.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`}
                      />
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium">{customer.companyName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{customer.businessNumber || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{customer.representative || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{customer.phone || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{customer.lastTransactionDate || "-"}</td>
                  <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                    {customer.inquiryCount > 0 ? (
                      <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{customer.inquiryCount}건</span>
                    ) : (
                      <span className="text-muted-foreground/50">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? (
            <p>검색 결과가 없습니다.</p>
          ) : tab === "bookmarked" ? (
            <p>북마크된 고객사가 없습니다.</p>
          ) : (
            <>
              <p>등록된 고객사가 없습니다.</p>
              <p className="text-sm mt-1">고객사 추가 버튼으로 새 고객사를 등록하세요.</p>
            </>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {filtered.length > 0 && `총 ${filtered.length}개`}
      </div>

      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => { if (!open) setSelectedCustomerId(null); }}>
        {selectedCustomerId && (
          <CustomerDetailModal
            customerId={selectedCustomerId}
            onClose={() => setSelectedCustomerId(null)}
          />
        )}
      </Dialog>

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
