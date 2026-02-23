import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Save, Building2, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Customer } from "@shared/schema";

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

export function InquiryFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle data-testid="text-form-title">인콰이어리 추가</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="px-6 pb-6">
            <InquiryFormContent onSuccess={() => onOpenChange(false)} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function InquiryFormContent({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", customerSearch],
    queryFn: async () => {
      if (customerSearch.length < 1) return [];
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`);
      return res.json();
    },
    enabled: customerSearch.length >= 1,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        customerId: selectedCustomer?.id || null,
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
    onSuccess: () => {
      toast({ title: "추가 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">기본 정보</h3>
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
                  <div className="relative" ref={dropdownRef}>
                    <FormControl>
                      <Input
                        placeholder="고객명 입력 (기존 고객사 검색 가능)"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                          if (selectedCustomer && e.target.value !== selectedCustomer.companyName) {
                            setSelectedCustomer(null);
                          }
                        }}
                        onFocus={() => {
                          if (field.value) {
                            setCustomerSearch(field.value);
                            setShowCustomerDropdown(true);
                          }
                        }}
                        data-testid="input-customer-name"
                      />
                    </FormControl>
                    {selectedCustomer && (
                      <Badge variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs gap-1">
                        <Building2 className="h-3 w-3" />
                        연결됨
                      </Badge>
                    )}
                    {showCustomerDropdown && searchResults.length > 0 && !selectedCustomer && (
                      <div className="absolute z-[60] w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                        {searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                            onClick={() => {
                              field.onChange(c.companyName);
                              setSelectedCustomer(c);
                              setShowCustomerDropdown(false);
                            }}
                            data-testid={`option-customer-${c.id}`}
                          >
                            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                            <div>
                              <span className="font-medium">{c.companyName}</span>
                              {c.businessNumber && <span className="text-muted-foreground ml-2 text-xs">{c.businessNumber}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!selectedCustomer && field.value && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">임시 고객명으로 등록됩니다</p>
                  )}
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
                    <Textarea placeholder="메모를 입력하세요" rows={2} {...field} data-testid="input-memo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">제품 상세정보</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormField
              control={form.control}
              name="productWidth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">가로 (mm)</FormLabel>
                  <FormControl>
                    <Input placeholder="mm" className="h-8" {...field} data-testid="input-product-width" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="productDepth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">세로 (mm)</FormLabel>
                  <FormControl>
                    <Input placeholder="mm" className="h-8" {...field} data-testid="input-product-depth" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="productHeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">높이 (mm)</FormLabel>
                  <FormControl>
                    <Input placeholder="mm" className="h-8" {...field} data-testid="input-product-height" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">무게 (g)</FormLabel>
                  <FormControl>
                    <Input placeholder="g" className="h-8" {...field} data-testid="input-weight" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="material"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">재질</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "_none"}>
                    <FormControl>
                      <SelectTrigger className="h-8" data-testid="select-material">
                        <SelectValue placeholder="재질" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">미설정</SelectItem>
                      <SelectItem value="steel">steel</SelectItem>
                      <SelectItem value="플라스틱">플라스틱</SelectItem>
                      <SelectItem value="고무류">고무류</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="productType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">종류</FormLabel>
                  <FormControl>
                    <Input placeholder="종류" className="h-8" {...field} data-testid="input-product-type" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">분야</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "_none"}>
                    <FormControl>
                      <SelectTrigger className="h-8" data-testid="select-industry">
                        <SelectValue placeholder="분야" />
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
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="supplySpeed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">공급속도</FormLabel>
                  <FormControl>
                    <Input placeholder="ea/min" className="h-8" {...field} data-testid="input-supply-speed" />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">계약조건</h3>
          <div className="border rounded-lg overflow-hidden text-sm">
            <div className="grid grid-cols-[70px_1fr_2fr] bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
              <span>구분</span>
              <span>비율</span>
              <span>기한</span>
            </div>

            <div className="grid grid-cols-[70px_1fr_2fr] px-3 py-2 items-center border-b gap-2">
              <span className="text-sm font-medium">계약금</span>
              <FormField
                control={form.control}
                name="contractRatio"
                render={({ field }) => (
                  <div className="flex items-center gap-1">
                    <Input type="number" placeholder="%" className="w-16 h-7 text-xs" {...field} data-testid="input-contract-ratio" />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <FormField
                  control={form.control}
                  name="contractTimingType"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "_none"}>
                      <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-contract-timing-type">
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
                        <Input type="number" placeholder="일" className="w-16 h-7 text-xs" {...field} data-testid="input-contract-timing-days" />
                        <span className="text-xs text-muted-foreground">일</span>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr_2fr] px-3 py-2 items-center border-b gap-2">
              <span className="text-sm font-medium">중도금</span>
              <FormField
                control={form.control}
                name="midRatio"
                render={({ field }) => (
                  <div className="flex items-center gap-1">
                    <Input type="number" placeholder="%" className="w-16 h-7 text-xs" {...field} data-testid="input-mid-ratio" />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <FormField
                  control={form.control}
                  name="midAfterDelivery"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "_none"}>
                      <SelectTrigger className="w-20 h-7 text-xs" data-testid="select-mid-after-delivery">
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
                      <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-mid-timing-type">
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
                        <Input type="number" placeholder="일" className="w-16 h-7 text-xs" {...field} data-testid="input-mid-timing-days" />
                        <span className="text-xs text-muted-foreground">일</span>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr_2fr] px-3 py-2 items-center gap-2">
              <span className="text-sm font-medium">잔금</span>
              <FormField
                control={form.control}
                name="finalRatio"
                render={({ field }) => (
                  <div className="flex items-center gap-1">
                    <Input type="number" placeholder="%" className="w-16 h-7 text-xs" {...field} data-testid="input-final-ratio" />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <FormField
                  control={form.control}
                  name="finalAfterDelivery"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "_none"}>
                      <SelectTrigger className="w-20 h-7 text-xs" data-testid="select-final-after-delivery">
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
                      <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-final-timing-type">
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
                        <Input type="number" placeholder="일" className="w-16 h-7 text-xs" {...field} data-testid="input-final-timing-days" />
                        <span className="text-xs text-muted-foreground">일</span>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
            {saveMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span>{saveMutation.isPending ? "저장중..." : "저장"}</span>
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function InquiryForm() {
  return null;
}
