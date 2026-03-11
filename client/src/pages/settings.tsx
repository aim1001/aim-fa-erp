import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Upload, Trash2, Save, Building2, FileText, Mail, ShoppingCart, CalendarDays, Send, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { CompanySettings, Staff } from "@shared/schema";
import StaffSearchPopover from "@/components/staff-search-popover";

const DEFAULT_QUOTATION_NOTES = `[제외사항]
- 기술지원료
- 모니터, 키보드, 마우스, 배선 설치 및 배선
- 피더용 SMPS(24V 5A 이상), 조명용 SMPS(24V 2.5A 이상)

[기술지원]
- 현장 출장 1MD: 60만원 (8시간, 이동시간 제외, 숙식비 제외)
  대전 이남 80만원
- 원격 기술지원: 4시간 20만원`;

export default function SettingsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: staffList } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const [form, setForm] = useState({
    companyName: "",
    businessNumber: "",
    representative: "",
    address: "",
    phone: "",
    fax: "",
    email: "",
    bankInfo: "",
    autoCc: "",
    emailTemplate: "",
    quotationNotesTemplate: "",
    poDefaultStaffId: "" as string | null,
    poDefaultPaymentTerms: "입고후 익월말",
    poDefaultWarrantyTerms: "하자보증 1년",
    poAutoCc: "",
    poEmailTemplate: "",
    poCalendarId: "sales@aim-fa.com",
  });

  const [poDefaultContactPerson, setPoDefaultContactPerson] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName || "",
        businessNumber: settings.businessNumber || "",
        representative: settings.representative || "",
        address: settings.address || "",
        phone: settings.phone || "",
        fax: settings.fax || "",
        email: settings.email || "",
        bankInfo: settings.bankInfo || "",
        autoCc: settings.autoCc || "",
        emailTemplate: settings.emailTemplate || "",
        quotationNotesTemplate: settings.quotationNotesTemplate || DEFAULT_QUOTATION_NOTES,
        poDefaultStaffId: settings.poDefaultStaffId || null,
        poDefaultPaymentTerms: settings.poDefaultPaymentTerms || "입고후 익월말",
        poDefaultWarrantyTerms: settings.poDefaultWarrantyTerms || "하자보증 1년",
        poAutoCc: settings.poAutoCc || "",
        poEmailTemplate: settings.poEmailTemplate || "",
        poCalendarId: settings.poCalendarId || "sales@aim-fa.com",
      });
      if (settings.poDefaultStaffId && staffList) {
        const s = staffList.find(st => st.id === settings.poDefaultStaffId);
        if (s) setPoDefaultContactPerson(s.name);
      }
    }
  }, [settings, staffList]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("PUT", "/api/company-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "저장 완료", description: "설정이 저장되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/company-settings/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("업로드 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "업로드 완료", description: "로고가 업로드되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    },
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/company-settings", { ...form, logoUrl: null, logoData: null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "삭제 완료", description: "로고가 삭제되었습니다." });
    },
  });

  const uploadSignatureMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("signature", file);
      const res = await fetch("/api/company-settings/signature", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("업로드 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "업로드 완료", description: "서명이 업로드되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    },
  });

  const removeSignature = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/company-settings", { ...form, signatureUrl: null, signatureData: null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "삭제 완료", description: "서명이 삭제되었습니다." });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadSignatureMutation.mutate(file);
    if (signatureInputRef.current) signatureInputRef.current.value = "";
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="settings-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const fields: { key: keyof typeof form; label: string; placeholder: string }[] = [
    { key: "companyName", label: "상호명", placeholder: "회사명을 입력하세요" },
    { key: "businessNumber", label: "사업자등록번호", placeholder: "000-00-00000" },
    { key: "representative", label: "대표자", placeholder: "대표자명" },
    { key: "address", label: "주소", placeholder: "사업장 주소" },
    { key: "phone", label: "전화번호", placeholder: "02-0000-0000" },
    { key: "fax", label: "팩스", placeholder: "02-0000-0000" },
    { key: "email", label: "이메일", placeholder: "info@company.com" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">설정</h1>
        </div>

        <Tabs defaultValue="company" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="company" data-testid="tab-company-info">
              <Building2 className="h-4 w-4 mr-2" />
              회사 정보
            </TabsTrigger>
            <TabsTrigger value="quotation" data-testid="tab-quotation-settings">
              <FileText className="h-4 w-4 mr-2" />
              견적서
            </TabsTrigger>
            <TabsTrigger value="purchaseOrder" data-testid="tab-purchase-order-settings">
              <ShoppingCart className="h-4 w-4 mr-2" />
              발주서
            </TabsTrigger>
            <TabsTrigger value="telegram" data-testid="tab-telegram-settings">
              <Send className="h-4 w-4 mr-2" />
              텔레그램
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  회사 로고
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                    {(settings?.logoData || settings?.logoUrl) ? (
                      <img
                        src={settings.logoData || settings.logoUrl}
                        alt="회사 로고"
                        className="w-full h-full object-contain p-2"
                        data-testid="img-company-logo"
                      />
                    ) : (
                      <Building2 className="h-12 w-12 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                      data-testid="input-logo-file"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                      data-testid="button-upload-logo"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {uploadMutation.isPending ? "업로드 중..." : "로고 업로드"}
                    </Button>
                    {(settings?.logoData || settings?.logoUrl) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeLogo.mutate()}
                        disabled={removeLogo.isPending}
                        data-testid="button-remove-logo"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        로고 삭제
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, SVG, WebP (최대 5MB)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  대표이사 서명
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="w-32 h-20 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                    {(settings?.signatureData || settings?.signatureUrl) ? (
                      <img
                        src={settings.signatureData || settings.signatureUrl}
                        alt="대표이사 서명"
                        className="w-full h-full object-contain p-2"
                        data-testid="img-signature"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground/40">서명 없음</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={handleSignatureChange}
                      data-testid="input-signature-file"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={uploadSignatureMutation.isPending}
                      data-testid="button-upload-signature"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {uploadSignatureMutation.isPending ? "업로드 중..." : "서명 업로드"}
                    </Button>
                    {(settings?.signatureData || settings?.signatureUrl) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeSignature.mutate()}
                        disabled={removeSignature.isPending}
                        data-testid="button-remove-signature"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        서명 삭제
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG (투명 배경 PNG 권장, 최대 5MB)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  기본 정보
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fields.map(({ key, label, placeholder }) => (
                    <div key={key} className={key === "address" ? "md:col-span-2" : ""}>
                      <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
                      <Input
                        id={key}
                        value={form[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        placeholder={placeholder}
                        className="mt-1"
                        data-testid={`input-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">입금 계좌 정보</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.bankInfo}
                  onChange={(e) => updateField("bankInfo", e.target.value)}
                  placeholder="은행명, 계좌번호, 예금주 등을 입력하세요"
                  rows={3}
                  data-testid="input-bankInfo"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end pb-6">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                data-testid="button-save-company-settings"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="quotation" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  제외사항 및 기술지원 기본 템플릿
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.quotationNotesTemplate}
                  onChange={(e) => updateField("quotationNotesTemplate", e.target.value)}
                  placeholder={DEFAULT_QUOTATION_NOTES}
                  rows={10}
                  className="font-mono text-sm"
                  data-testid="input-quotationNotesTemplate"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    견적서 작성 시 [제외사항]과 [기술지원] 항목의 기본 내용으로 사용됩니다.
                  </p>
                  <button
                    type="button"
                    className="text-xs text-blue-500 hover:underline"
                    onClick={() => updateField("quotationNotesTemplate", DEFAULT_QUOTATION_NOTES)}
                    data-testid="button-reset-quotation-notes"
                  >
                    기본값으로 초기화
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  이메일 자동 CC
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={form.autoCc}
                  onChange={(e) => updateField("autoCc", e.target.value)}
                  placeholder="houns9@aim-fa.com,yups@aim-fa.com"
                  data-testid="input-autoCc"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  견적 이메일 발송 시 자동으로 CC에 추가됩니다. 여러 이메일은 쉼표(,)로 구분하세요.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  이메일 본문 템플릿
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.emailTemplate}
                  onChange={(e) => updateField("emailTemplate", e.target.value)}
                  placeholder={"안녕하세요, {고객명}님.\n\n요청하신 견적서를 첨부드립니다.\n\n견적번호: {견적번호}\n\n검토 후 궁금하신 사항이 있으시면 언제든 연락 주시기 바랍니다.\n\n감사합니다."}
                  rows={8}
                  data-testid="input-emailTemplate"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  견적 이메일 발송 시 기본 본문으로 사용됩니다. 치환 변수: <code>{"{고객명}"}</code>, <code>{"{이름}"}</code>, <code>{"{견적번호}"}</code>, <code>{"{견적이름}"}</code>
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end pb-6">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                data-testid="button-save-quotation-settings"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="purchaseOrder" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  발주서 기본값 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">기본 담당자</Label>
                  <p className="text-xs text-muted-foreground mb-1">발주서 작성 시 자동으로 설정될 담당자입니다.</p>
                  <StaffSearchPopover
                    staffList={staffList || []}
                    selectedStaffId={form.poDefaultStaffId || ""}
                    contactPerson={poDefaultContactPerson}
                    onSelect={(sid, name) => {
                      setForm(f => ({ ...f, poDefaultStaffId: sid || null }));
                      setPoDefaultContactPerson(name);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-sm">기본 지급조건</Label>
                  <p className="text-xs text-muted-foreground mb-1">발주서 작성 시 기본 지급조건 텍스트입니다.</p>
                  <Input
                    value={form.poDefaultPaymentTerms}
                    onChange={(e) => updateField("poDefaultPaymentTerms", e.target.value)}
                    placeholder="입고후 익월말"
                    data-testid="input-po-default-payment-terms"
                  />
                </div>
                <div>
                  <Label className="text-sm">기본 보증조건</Label>
                  <p className="text-xs text-muted-foreground mb-1">발주서 작성 시 기본 보증조건 텍스트입니다.</p>
                  <Input
                    value={form.poDefaultWarrantyTerms}
                    onChange={(e) => updateField("poDefaultWarrantyTerms", e.target.value)}
                    placeholder="하자보증 1년"
                    data-testid="input-po-default-warranty-terms"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  발주서 이메일 자동 CC
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={form.poAutoCc}
                  onChange={(e) => updateField("poAutoCc", e.target.value)}
                  placeholder="houns9@aim-fa.com,yups@aim-fa.com"
                  data-testid="input-poAutoCc"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  발주서 이메일 발송 시 자동으로 CC에 추가됩니다. 여러 이메일은 쉼표(,)로 구분하세요.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  발주서 이메일 본문 템플릿
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.poEmailTemplate}
                  onChange={(e) => updateField("poEmailTemplate", e.target.value)}
                  placeholder={"안녕하세요.\n\n발주서를 송부드립니다.\n\n발주번호: {발주번호}\n입고예정일: {입고일자}\n\n검토 후 회신 부탁드립니다.\n\n감사합니다."}
                  rows={8}
                  data-testid="input-poEmailTemplate"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  발주서 이메일 발송 시 기본 본문으로 사용됩니다. 치환 변수: <code>{"{발주번호}"}</code>, <code>{"{입고일자}"}</code>, <code>{"{구매처명}"}</code>, <code>{"{담당자명}"}</code>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4" />
                  입고일정 캘린더
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={form.poCalendarId}
                  onChange={(e) => updateField("poCalendarId", e.target.value)}
                  placeholder="sales@aim-fa.com"
                  data-testid="input-poCalendarId"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  발주서 예정입고일을 등록할 Google Calendar ID입니다.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end pb-6">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                data-testid="button-save-po-settings"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="telegram" className="space-y-6 mt-6">
            <TelegramSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TelegramSettings() {
  const { toast } = useToast();

  const { data: status, isLoading, refetch } = useQuery<{
    configured: boolean;
    hasChatId: boolean;
    botName: string | null;
    botOk: boolean;
  }>({
    queryKey: ["/api/telegram/status"],
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/telegram/detect-chat");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.found) {
        toast({ title: "Chat ID 감지 완료", description: `그룹: ${data.title} (${data.chatId})` });
        refetch();
      } else {
        toast({ title: "감지 실패", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "감지 실패", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/telegram/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.ok) {
        toast({ title: "전송 성공", description: "텔레그램으로 테스트 메시지가 전송되었습니다." });
      } else {
        toast({ title: "전송 실패", description: "메시지 전송에 실패했습니다.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "전송 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" />
            텔레그램 알림 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {status?.configured ? (
              status?.botOk ? (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              )
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium" data-testid="text-telegram-status">
                {!status?.configured
                  ? "봇 토큰이 설정되지 않았습니다"
                  : status.botOk
                    ? `봇 연결됨: @${status.botName}`
                    : "봇 연결 실패"}
              </p>
              <p className="text-xs text-muted-foreground">
                {!status?.configured
                  ? "환경변수 TELEGRAM_BOT_TOKEN을 설정해주세요"
                  : status.hasChatId
                    ? "Chat ID가 설정되어 알림이 활성화되어 있습니다"
                    : "Chat ID를 감지하여 알림을 활성화하세요"}
              </p>
            </div>
          </div>

          {status?.configured && !status?.hasChatId && (
            <div className="space-y-3 p-4 border rounded-lg">
              <p className="text-sm font-medium">Chat ID 자동 감지</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>텔레그램에서 봇을 그룹 채팅에 추가하세요</li>
                <li>그룹에서 아무 메시지나 보내세요</li>
                <li>아래 버튼을 눌러 Chat ID를 자동 감지하세요</li>
              </ol>
              <Button
                variant="outline"
                size="sm"
                onClick={() => detectMutation.mutate()}
                disabled={detectMutation.isPending}
                data-testid="button-detect-chat-id"
              >
                {detectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Chat ID 감지
              </Button>
            </div>
          )}

          {status?.configured && status?.hasChatId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-test-telegram"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              테스트 메시지 전송
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">알림 대상 이벤트</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 text-muted-foreground">
            <li>📋 인콰이어리 등록 / 상태 변경</li>
            <li>🏗 프로젝트 전환 / 상태 변경</li>
            <li>💰 결제 완료</li>
            <li>✅ 할일 추가 / 완료 (영업·프로젝트·구매발주·경영지원)</li>
            <li>📅 일정 추가 / 완료 (영업·프로젝트·구매발주·경영지원)</li>
          </ul>
        </CardContent>
      </Card>

      {!status?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">설정 방법</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
              <li>텔레그램에서 <span className="font-mono text-xs">@BotFather</span>에게 <span className="font-mono text-xs">/newbot</span> 명령을 보내 봇을 생성하세요</li>
              <li>받은 봇 토큰을 환경변수 <span className="font-mono text-xs">TELEGRAM_BOT_TOKEN</span>에 설정하세요</li>
              <li>봇을 팀 그룹 채팅에 추가하세요</li>
              <li>그룹에서 메시지를 보낸 후 이 페이지에서 Chat ID를 감지하세요</li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
