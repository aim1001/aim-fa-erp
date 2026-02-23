import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Inquiry } from "@shared/schema";

const formSchema = z.object({
  inquiryNumber: z.string().min(1, "영업번호를 입력하세요"),
  customerName: z.string().min(1, "고객명을 입력하세요"),
  productInfo: z.string().optional(),
  year: z.coerce.number().min(2000).max(2099),
  probability: z.coerce.number().min(0).max(5),
  expectedDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  memo: z.string().optional(),
  status: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export default function InquiryForm() {
  const [isEdit, editParams] = useRoute("/inquiries/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = editParams?.id;

  const { data: existingInquiry, isLoading: loadingExisting } = useQuery<Inquiry>({
    queryKey: ["/api/inquiries", id],
    enabled: !!isEdit && !!id,
  });

  const currentYear = new Date().getFullYear();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      inquiryNumber: "",
      customerName: "",
      productInfo: "",
      year: currentYear,
      probability: 0,
      expectedDate: "",
      paymentTerms: "",
      memo: "",
      status: "active",
    },
    values: isEdit && existingInquiry ? {
      inquiryNumber: existingInquiry.inquiryNumber,
      customerName: existingInquiry.customerName,
      productInfo: existingInquiry.productInfo || "",
      year: existingInquiry.year,
      probability: existingInquiry.probability || 0,
      expectedDate: existingInquiry.expectedDate || "",
      paymentTerms: existingInquiry.paymentTerms || "",
      memo: existingInquiry.memo || "",
      status: existingInquiry.status || "active",
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit && id) {
        const res = await apiRequest("PATCH", `/api/inquiries/${id}`, values);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/inquiries", {
          ...values,
          productInfo: values.productInfo || null,
          expectedDate: values.expectedDate || null,
          paymentTerms: values.paymentTerms || null,
          memo: values.memo || null,
          source: "manual",
          onedriveFolderId: null,
          onedriveFolderName: null,
        });
        return res.json();
      }
    },
    onSuccess: (data) => {
      toast({ title: isEdit ? "수정 완료" : "추가 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      if (isEdit && id) {
        queryClient.invalidateQueries({ queryKey: ["/api/inquiries", id] });
      }
      navigate(`/inquiries/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href={isEdit ? `/inquiries/${id}` : "/inquiries"}><ArrowLeft /></Link>
        </Button>
        <h1 className="text-2xl font-semibold" data-testid="text-form-title">
          {isEdit ? "인콰이어리 수정" : "인콰이어리 추가"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">정보 입력</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="inquiryNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>영업번호</FormLabel>
                      <FormControl>
                        <Input placeholder="예: 26-3" {...field} data-testid="input-inquiry-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>고객명</FormLabel>
                      <FormControl>
                        <Input placeholder="고객명 입력" {...field} data-testid="input-customer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제품정보</FormLabel>
                      <FormControl>
                        <Input placeholder="제품 또는 프로젝트 정보" {...field} data-testid="input-product-info" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>연도</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-year" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="probability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>단계</FormLabel>
                      <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-probability">
                            <SelectValue placeholder="단계 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">미설정</SelectItem>
                          <SelectItem value="1">1. 문의</SelectItem>
                          <SelectItem value="2">2. 미팅</SelectItem>
                          <SelectItem value="3">3. 사양협의</SelectItem>
                          <SelectItem value="4">4. 비딩</SelectItem>
                          <SelectItem value="5">5. 발주전</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>예상일자</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-expected-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>결재조건</FormLabel>
                      <FormControl>
                        <Input placeholder="예: 납품 후 30일" {...field} data-testid="input-payment-terms" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>상태</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue placeholder="상태 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">진행중</SelectItem>
                          <SelectItem value="won">수주</SelectItem>
                          <SelectItem value="lost">실주</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="memo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>메모</FormLabel>
                    <FormControl>
                      <Textarea placeholder="메모를 입력하세요" rows={4} {...field} data-testid="input-memo" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
                  <Save />
                  <span>{saveMutation.isPending ? "저장중..." : "저장"}</span>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
