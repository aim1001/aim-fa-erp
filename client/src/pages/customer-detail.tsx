import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, Trash2, Check, X, FileText, UserPlus, Users, Mail, Phone } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import type { Customer, Company, Inquiry } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { InquiryDetailDialog } from "@/pages/inquiry-detail";

function useCustomerUpdate(customerId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/customers/${customerId}`, patch);
      return res.json();
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: [`/api/customers/${customerId}`] });
      const prev = queryClient.getQueryData<Customer>([`/api/customers/${customerId}`]);
      if (prev) {
        queryClient.setQueryData([`/api/customers/${customerId}`], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (err: Error, _patch, context) => {
      if (context?.prev) {
        queryClient.setQueryData([`/api/customers/${customerId}`], context.prev);
      }
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
  });
}

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
    onSuccess: () => {
      if (entityType === "customer") {
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${entityId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${entityId}`] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
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
      onClick={() => { setEditValue(value); setEditing(true); }}
      data-testid={`text-editable-${entityType}-${field}`}
    >
      {value || <span className="text-muted-foreground">{placeholder || "-"}</span>}
    </span>
  );
}

function ContactCard({ contact, customerId, onDeleted }: { contact: Company; customerId: string; onDeleted: () => void }) {
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

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${id}`],
    enabled: !!id,
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery<Company[]>({
    queryKey: [`/api/customers/${id}/contacts`],
    enabled: !!id,
  });

  const { data: allInquiries } = useQuery<Inquiry[]>({
    queryKey: ["/api/inquiries"],
  });

  const relatedInquiries = allInquiries?.filter(i => i.customerId === id) || [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      navigate("/customers");
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: { contactName: string; email?: string; phone?: string }) => {
      const res = await apiRequest("POST", "/api/companies", {
        customerId: id,
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">고객사를 찾을 수 없습니다.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/customers">목록으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/customers"><ArrowLeft /></Link>
        </Button>
        <Building2 className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold flex-1" data-testid="text-customer-title">
          {customer.companyName}
        </h1>
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

      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사업자 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 text-sm items-center">
            <span className="text-muted-foreground">상호명</span>
            <InlineField value={customer.companyName} field="companyName" entityId={id!} entityType="customer" />

            <span className="text-muted-foreground">사업자등록번호</span>
            <InlineField value={customer.businessNumber || ""} field="businessNumber" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">대표자</span>
            <InlineField value={customer.representative || ""} field="representative" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">사업장 주소</span>
            <InlineField value={customer.address || ""} field="address" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">업태</span>
            <InlineField value={customer.businessType || ""} field="businessType" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">종목</span>
            <InlineField value={customer.businessCategory || ""} field="businessCategory" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">전화번호</span>
            <InlineField value={customer.phone || ""} field="phone" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">팩스</span>
            <InlineField value={customer.fax || ""} field="fax" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">메모</span>
            <InlineField value={customer.memo || ""} field="memo" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">비고</span>
            <InlineField value={customer.notes || ""} field="notes" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">등록일자</span>
            <InlineField value={customer.registrationDate || ""} field="registrationDate" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">경영지원 담당자</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-2 text-sm items-center">
            <span className="text-muted-foreground">부서명</span>
            <InlineField value={customer.mgmtDepartment || ""} field="mgmtDepartment" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">성명</span>
            <InlineField value={customer.mgmtContactName || ""} field="mgmtContactName" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">전화번호</span>
            <InlineField value={customer.mgmtPhone || ""} field="mgmtPhone" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">휴대전화</span>
            <InlineField value={customer.mgmtMobile || ""} field="mgmtMobile" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">팩스</span>
            <InlineField value={customer.mgmtFax || ""} field="mgmtFax" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">이메일</span>
            <InlineField value={customer.mgmtEmail || ""} field="mgmtEmail" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />

            <span className="text-muted-foreground">주담당자</span>
            <InlineField value={customer.primaryContact || ""} field="primaryContact" entityId={id!} entityType="customer" placeholder="클릭하여 입력" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">영업 담당자 ({contacts.length}명)</CardTitle>
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
                  customerId={id!}
                  onDeleted={() => refetchContacts()}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">등록된 담당자가 없습니다.</p>
          )}
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
                <div
                  key={inquiry.id}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => setSelectedInquiryId(inquiry.id)}
                  data-testid={`inquiry-link-${inquiry.id}`}
                >
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
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">연결된 인콰이어리가 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <InquiryDetailDialog
        inquiryId={selectedInquiryId}
        open={!!selectedInquiryId}
        onOpenChange={(open) => { if (!open) setSelectedInquiryId(null); }}
      />

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
    </div>
  );
}
