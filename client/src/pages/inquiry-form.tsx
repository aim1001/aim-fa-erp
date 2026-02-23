import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";


const formSchema = z.object({
  customerName: z.string().min(1, "고객명을 입력하세요"),
  productInfo: z.string().optional(),
  year: z.coerce.number().min(2000).max(2099),
  probability: z.coerce.number().min(0).max(5),
  expectedDate: z.string().optional(),
  memo: z.string().optional(),
  status: z.string(),
  productWidth: z.string().optional(),
  productDepth: z.string().optional(),
  productHeight: z.string().optional(),
  weight: z.string().optional(),
  material: z.string().optional(),
  productType: z.string().optional(),
  industry: z.string().optional(),
  supplySpeed: z.string().optional(),
  contractRatio: z.coerce.number().optional(),
  contractTimingType: z.string().optional(),
  contractTimingDays: z.coerce.number().optional(),
  midRatio: z.coerce.number().optional(),
  midAfterDelivery: z.string().optional(),
  midTimingType: z.string().optional(),
  midTimingDays: z.coerce.number().optional(),
  finalRatio: z.coerce.number().optional(),
  finalAfterDelivery: z.string().optional(),
  finalTimingType: z.string().optional(),
  finalTimingDays: z.coerce.number().optional(),
  deliveryDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function InquiryForm() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      productInfo: "",
      year: currentYear,
      probability: 0,
      expectedDate: "",
      memo: "",
      status: "active",
      productWidth: "",
      productDepth: "",
      productHeight: "",
      weight: "",
      material: "",
      productType: "",
      industry: "",
      supplySpeed: "",
      contractRatio: 0,
      contractTimingType: "",
      contractTimingDays: 0,
      midRatio: 0,
      midAfterDelivery: "",
      midTimingType: "",
      midTimingDays: 0,
      finalRatio: 0,
      finalAfterDelivery: "",
      finalTimingType: "",
      finalTimingDays: 0,
      deliveryDate: "",
    },
  });

  const watchYear = form.watch("year");
  const nextNumberQuery = useQuery<{ nextNumber: string }>({
    queryKey: [`/api/next-inquiry-number/${watchYear}`],
    enabled: !!watchYear,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("POST", "/api/inquiries", {
        ...values,
        inquiryNumber: "",
        productInfo: values.productInfo || null,
        expectedDate: values.expectedDate || null,
        memo: values.memo || null,
        productWidth: values.productWidth || null,
        productDepth: values.productDepth || null,
        productHeight: values.productHeight || null,
        weight: values.weight || null,
        material: values.material && values.material !== "_none" ? values.material : null,
        productType: values.productType || null,
        industry: values.industry && values.industry !== "_none" ? values.industry : null,
        supplySpeed: values.supplySpeed || null,
        contractRatio: values.contractRatio || null,
        contractTimingType: values.contractTimingType && values.contractTimingType !== "_none" ? values.contractTimingType : null,
        contractTimingDays: values.contractTimingDays || null,
        midRatio: values.midRatio || null,
        midAfterDelivery: values.midAfterDelivery && values.midAfterDelivery !== "_none" ? values.midAfterDelivery : null,
        midTimingType: values.midTimingType && values.midTimingType !== "_none" ? values.midTimingType : null,
        midTimingDays: values.midTimingDays || null,
        finalRatio: values.finalRatio || null,
        finalAfterDelivery: values.finalAfterDelivery && values.finalAfterDelivery !== "_none" ? values.finalAfterDelivery : null,
        finalTimingType: values.finalTimingType && values.finalTimingType !== "_none" ? values.finalTimingType : null,
        finalTimingDays: values.finalTimingDays || null,
        deliveryDate: values.deliveryDate || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "추가 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      navigate(`/inquiries/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/inquiries"><ArrowLeft /></Link>
        </Button>
        <h1 className="text-2xl font-semibold" data-testid="text-form-title">
          인콰이어리 추가
        </h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">영업번호 (자동생성)</label>
                  <div className="mt-2 px-3 py-2 border rounded-md bg-muted text-sm font-mono" data-testid="text-next-inquiry-number">
                    {nextNumberQuery.isLoading ? "..." : nextNumberQuery.data?.nextNumber || "-"}
                  </div>
                </div>
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
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>납품일자</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-delivery-date-basic" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4">
                <FormField
                  control={form.control}
                  name="memo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메모</FormLabel>
                      <FormControl>
                        <Textarea placeholder="메모를 입력하세요" rows={3} {...field} data-testid="input-memo" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">제품 상세정보</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="productWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>크기 - 가로 (mm)</FormLabel>
                      <FormControl>
                        <Input placeholder="가로 mm" {...field} data-testid="input-product-width" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productDepth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>크기 - 세로 (mm)</FormLabel>
                      <FormControl>
                        <Input placeholder="세로 mm" {...field} data-testid="input-product-depth" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productHeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>크기 - 높이 (mm)</FormLabel>
                      <FormControl>
                        <Input placeholder="높이 mm" {...field} data-testid="input-product-height" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>무게 (g)</FormLabel>
                      <FormControl>
                        <Input placeholder="무게 g" {...field} data-testid="input-weight" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="material"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>재질</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "_none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-material">
                            <SelectValue placeholder="재질 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">미설정</SelectItem>
                          <SelectItem value="steel">steel</SelectItem>
                          <SelectItem value="플라스틱">플라스틱</SelectItem>
                          <SelectItem value="고무류">고무류</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>종류</FormLabel>
                      <FormControl>
                        <Input placeholder="종류 입력" {...field} data-testid="input-product-type" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>분야</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "_none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-industry">
                            <SelectValue placeholder="분야 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">미설정</SelectItem>
                          <SelectItem value="자동차">자동차</SelectItem>
                          <SelectItem value="전기">전기</SelectItem>
                          <SelectItem value="전자부품">전자부품</SelectItem>
                          <SelectItem value="화장품">화장품</SelectItem>
                          <SelectItem value="기타">기타</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplySpeed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>공급속도 (ea/min)</FormLabel>
                      <FormControl>
                        <Input placeholder="ea/min" {...field} data-testid="input-supply-speed" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">계약조건</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[80px_1fr_2fr] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    <span>구분</span>
                    <span>비율</span>
                    <span>기한</span>
                  </div>

                  <div className="grid grid-cols-[80px_1fr_2fr] px-3 py-3 items-center border-b gap-2">
                    <span className="text-sm font-medium">계약금</span>
                    <FormField
                      control={form.control}
                      name="contractRatio"
                      render={({ field }) => (
                        <div className="flex items-center gap-1">
                          <Input type="number" placeholder="%" className="w-20 h-8" {...field} data-testid="input-contract-ratio" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <FormField
                        control={form.control}
                        name="contractTimingType"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || "_none"}>
                            <SelectTrigger className="w-28 h-8" data-testid="select-contract-timing-type">
                              <SelectValue placeholder="기한" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">미설정</SelectItem>
                              <SelectItem value="days">일수지정</SelectItem>
                              <SelectItem value="next_month_end">익월말</SelectItem>
                              <SelectItem value="month_end">월말</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.watch("contractTimingType") === "days" && (
                        <FormField
                          control={form.control}
                          name="contractTimingDays"
                          render={({ field }) => (
                            <div className="flex items-center gap-1">
                              <Input type="number" placeholder="일" className="w-20 h-8" {...field} data-testid="input-contract-timing-days" />
                              <span className="text-xs text-muted-foreground">일</span>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[80px_1fr_2fr] px-3 py-3 items-center border-b gap-2">
                    <span className="text-sm font-medium">중도금</span>
                    <FormField
                      control={form.control}
                      name="midRatio"
                      render={({ field }) => (
                        <div className="flex items-center gap-1">
                          <Input type="number" placeholder="%" className="w-20 h-8" {...field} data-testid="input-mid-ratio" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <FormField
                        control={form.control}
                        name="midAfterDelivery"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || "_none"}>
                            <SelectTrigger className="w-24 h-8" data-testid="select-mid-after-delivery">
                              <SelectValue placeholder="시점" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">미설정</SelectItem>
                              <SelectItem value="yes">납품후</SelectItem>
                              <SelectItem value="no">납품전</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="midTimingType"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || "_none"}>
                            <SelectTrigger className="w-28 h-8" data-testid="select-mid-timing-type">
                              <SelectValue placeholder="기한" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">미설정</SelectItem>
                              <SelectItem value="days">일수지정</SelectItem>
                              <SelectItem value="next_month_end">익월말</SelectItem>
                              <SelectItem value="month_end">월말</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.watch("midTimingType") === "days" && (
                        <FormField
                          control={form.control}
                          name="midTimingDays"
                          render={({ field }) => (
                            <div className="flex items-center gap-1">
                              <Input type="number" placeholder="일" className="w-20 h-8" {...field} data-testid="input-mid-timing-days" />
                              <span className="text-xs text-muted-foreground">일</span>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[80px_1fr_2fr] px-3 py-3 items-center gap-2">
                    <span className="text-sm font-medium">잔금</span>
                    <FormField
                      control={form.control}
                      name="finalRatio"
                      render={({ field }) => (
                        <div className="flex items-center gap-1">
                          <Input type="number" placeholder="%" className="w-20 h-8" {...field} data-testid="input-final-ratio" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <FormField
                        control={form.control}
                        name="finalAfterDelivery"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || "_none"}>
                            <SelectTrigger className="w-24 h-8" data-testid="select-final-after-delivery">
                              <SelectValue placeholder="시점" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">미설정</SelectItem>
                              <SelectItem value="yes">납품후</SelectItem>
                              <SelectItem value="no">납품전</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="finalTimingType"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || "_none"}>
                            <SelectTrigger className="w-28 h-8" data-testid="select-final-timing-type">
                              <SelectValue placeholder="기한" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">미설정</SelectItem>
                              <SelectItem value="days">일수지정</SelectItem>
                              <SelectItem value="next_month_end">익월말</SelectItem>
                              <SelectItem value="month_end">월말</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.watch("finalTimingType") === "days" && (
                        <FormField
                          control={form.control}
                          name="finalTimingDays"
                          render={({ field }) => (
                            <div className="flex items-center gap-1">
                              <Input type="number" placeholder="일" className="w-20 h-8" {...field} data-testid="input-final-timing-days" />
                              <span className="text-xs text-muted-foreground">일</span>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
              <Save />
              <span>{saveMutation.isPending ? "저장중..." : "저장"}</span>
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
