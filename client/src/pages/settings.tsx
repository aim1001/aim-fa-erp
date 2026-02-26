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
import { Settings, Upload, Trash2, Save, Building2 } from "lucide-react";
import type { CompanySettings } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
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
  });

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
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("PUT", "/api/company-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "저장 완료", description: "회사 정보가 저장되었습니다." });
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
      const res = await apiRequest("PUT", "/api/company-settings", { ...form, logoUrl: null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "삭제 완료", description: "로고가 삭제되었습니다." });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">회사 정보 설정</h1>
        </div>

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
                {settings?.logoUrl ? (
                  <img
                    src={settings.logoUrl}
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
                {settings?.logoUrl && (
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
            data-testid="button-save-settings"
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
