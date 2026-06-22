import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { pool } from "./db";
import { insertInquirySchema, insertCompanySchema, insertCustomerSchema, insertVendorSchema, insertSalesInvoiceSchema, insertPurchaseInvoiceSchema, insertRecurringExpenseSchema } from "@shared/schema";
import {
  listRootSalesFolder,
  listYearFolders,
  listFolderFiles,
  parseInquiryFolderName,
  readInfoJson,
  writeInfoJson,
  createInquiryFolder,
  listFoldersByPath,
  getFolderMetadata,
  checkConnectionStatus,
  resetTokenCache,
  getAuthUrl,
  exchangeCodeForTokens,
} from "./onedrive";
import { parseExcelCustomerInfo, parseCustomerListFromOneDrive, parseSalesTaxInvoices, parsePurchaseTaxInvoices, parseSalesTaxInvoicesFromBuffer, parsePurchaseTaxInvoicesFromBuffer, getAvailableInvoiceYears, parseListPriceFromOneDrive, writeListPriceToOneDrive, parsePurchaseListFromOneDrive, writePurchaseListToOneDrive, parseKBBankStatementFromBuffer, parseKBBankAccountInfo } from "./excel-parser";
import { insertItemMasterSchema, insertItemInventorySchema, insertPurchaseItemSchema, insertProjectItemSchema } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

// 결제조건 텍스트 → 지급예정일 계산
// 로컬 시간 기준 YYYY-MM-DD (toISOString는 UTC라 KST 등에서 월말이 하루 당겨지는 문제 방지)
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calcDueDateFromTerms(paymentTerms: string | null | undefined, deliveryDate: string | null | undefined): string | null {
  if (!paymentTerms) return null;
  const base = deliveryDate ? new Date(deliveryDate) : new Date();
  const terms = paymentTerms.replace(/\(.*\)/, "").trim();

  if (terms.includes("익월말") || terms.includes("입고후 익월말")) {
    const d = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    return fmtLocalDate(d);
  }
  if (terms.includes("월말") || terms.includes("당월말") || terms.includes("입고후 월말")) {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return fmtLocalDate(d);
  }
  if (terms.includes("2주이내") || terms.includes("입고후 2주이내")) {
    const d = new Date(base);
    d.setDate(d.getDate() + 14);
    return fmtLocalDate(d);
  }
  if (terms.includes("선처리")) {
    return fmtLocalDate(new Date());
  }
  return null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

// 매출계산서 수금액 단일 판정 규칙 (수금관리·거래처원장·고객요약 공용).
// 은행매칭/완료수금레코드 중 큰 값을 실수금으로 보고, status='paid'면 최소 청구액까지 완납 간주.
function invoiceCollected(totalAmount: number, bankAmount: number, recordAmount: number, statusPaid: boolean): number {
  const recorded = Math.max(bankAmount || 0, recordAmount || 0);
  return statusPaid ? Math.max(recorded, totalAmount || 0) : recorded;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    const appPassword = process.env.APP_PASSWORD || "aim1001";
    if (password === appPassword) {
      req.session.authenticated = true;
      return res.json({ ok: true });
    }
    return res.status(401).json({ message: "비밀번호가 올바르지 않습니다" });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/status", (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/login" || req.path === "/logout" || req.path === "/auth/status" || req.path === "/onedrive/callback" || req.path === "/web-inquiry") {
      return next();
    }
    return requireAuth(req, res, next);
  });

  // 홈페이지 문의는 리드 손실 방지를 위해 관대하게 검증 (필드 누락·이메일 형식오류여도 접수)
  const webInquirySchema = z.object({
    companyName: z.string().max(200).optional(),
    contactName: z.string().max(100).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    productInfo: z.string().max(500).optional(),
    message: z.string().max(2000).optional(),
  }).refine(
    d => [d.companyName, d.contactName, d.phone, d.email, d.message].some(v => v && v.trim()),
    { message: "문의 내용을 입력해 주세요" }
  );

  const webInquiryRateLimit = new Map<string, number[]>();

  app.options("/api/web-inquiry", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });

  app.post("/api/web-inquiry", async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const timestamps = (webInquiryRateLimit.get(ip) || []).filter(t => now - t < 60000);
      if (timestamps.length >= 5) {
        return res.status(429).json({ message: "Too many requests" });
      }
      timestamps.push(now);
      webInquiryRateLimit.set(ip, timestamps);

      const data = webInquirySchema.parse(req.body);
      const year = new Date().getFullYear();
      const nextNumber = await storage.getNextInquiryNumber(year);

      // 필드 누락/형식오류 보정: 회사명 없으면 담당자명/기본값, 이메일은 형식 맞을 때만 필드에 저장
      const companyName = (data.companyName || "").trim() || (data.contactName || "").trim() || "홈페이지 문의";
      const emailValid = data.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email.trim()) ? data.email.trim() : null;

      const memoLines = [
        data.message || "",
        "",
        data.contactName ? `담당자: ${data.contactName}` : "",
        data.phone ? `연락처: ${data.phone}` : "",
        data.email ? `이메일: ${data.email}` : "",
      ].filter(Boolean).join("\n");

      const inquiryData: any = {
        inquiryNumber: nextNumber,
        customerName: companyName,
        productInfo: data.productInfo || null,
        year,
        status: "none",
        probability: 0,
        source: "website",
        isWebInquiry: true,
        memo: memoLines || null,
      };

      try {
        const allCustomers = await storage.getCustomers();
        const nameKey = companyName.trim().toLowerCase();
        let matched = allCustomers.find(c => c.companyName.trim().toLowerCase() === nameKey);
        if (!matched) {
          matched = allCustomers.find(c => {
            const key = c.companyName.trim().toLowerCase();
            return key.includes(nameKey) || nameKey.includes(key);
          });
        }
        if (!matched) {
          matched = await storage.createCustomer({ companyName });
        }
        inquiryData.customerId = matched.id;

        if (data.contactName) {
          try {
            const newCompany = await storage.createCompany({
              customerId: matched.id,
              contactName: data.contactName,
              phone: data.phone || null,
              email: emailValid,
              companyName,
              isTemporary: false,
            });
            inquiryData.companyId = newCompany.id;
            inquiryData.snapshotContactName = data.contactName;
            inquiryData.snapshotEmail = emailValid;
            inquiryData.snapshotPhone = data.phone || null;
          } catch (e: any) {
            console.warn("Web inquiry: create contact error:", e.message);
          }
        }

        const customer = await storage.getCustomer(matched.id);
        if (customer) {
          inquiryData.snapshotCompanyName = customer.companyName || null;
          inquiryData.snapshotAddress = customer.address || null;
        }
      } catch (e: any) {
        console.warn("Web inquiry: customer link error:", e.message);
      }

      const inquiry = await storage.createInquiry(inquiryData);

      import("./telegram").then(t => t.notifyWebInquiry({
        companyName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        productInfo: data.productInfo,
        message: data.message,
        inquiryNumber: nextNumber,
      })).catch((e) => { console.error("[web-inquiry] telegram notify error:", e); });

      res.status(201).json({ success: true, inquiryNumber: nextNumber });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/inquiries/:id/acknowledge", async (req, res) => {
    try {
      const existing = await storage.getInquiry(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      }
      if (!existing.isWebInquiry) {
        return res.json(existing);
      }
      const inquiry = await storage.updateInquiry(req.params.id, { isWebInquiry: false });
      res.json(inquiry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/camera-models", async (_req, res) => {
    res.json([
      { id: "1", brand: "Basler", model: "acA1300-60gm", megaPixels: 1.3, resolutionX: 1280, resolutionY: 1024, sensorWidth: 6.8, sensorHeight: 5.4, pixelSize: 0.0053 },
      { id: "2", brand: "Basler", model: "acA2500-14gm", megaPixels: 5.0, resolutionX: 2592, resolutionY: 1944, sensorWidth: 5.7, sensorHeight: 4.28, pixelSize: 0.0022 },
      { id: "3", brand: "Basler", model: "acA3800-10gm", megaPixels: 10.0, resolutionX: 3840, resolutionY: 2748, sensorWidth: 6.44, sensorHeight: 4.62, pixelSize: 0.00167 },
    ]);
  });

  app.get("/api/inquiries", async (req, res) => {
    try {
      const { year, search, status, minProbability, maxProbability } = req.query;
      const inquiries = await storage.getInquiries({
        year: year ? parseInt(year as string) : undefined,
        search: search as string,
        status: status as string,
        minProbability: minProbability ? parseInt(minProbability as string) : undefined,
        maxProbability: maxProbability ? parseInt(maxProbability as string) : undefined,
      });

      const customerIds = [...new Set(inquiries.filter(i => i.customerId).map(i => i.customerId!))];
      const tradedCustomerIds = new Set<string>();
      if (customerIds.length > 0) {
        const txDates = await storage.getCustomerLastTransactionDates();
        const allCustomers = await storage.getCustomers();
        const customerMap = new Map(allCustomers.map(c => [c.id, c]));
        for (const cid of customerIds) {
          const cust = customerMap.get(cid);
          if (txDates.has(cid) || (cust && cust.businessNumber)) {
            tradedCustomerIds.add(cid);
          }
        }
      }

      const contactCounts = await storage.getCustomerContactCounts();

      const enriched = inquiries.map(i => ({
        ...i,
        isExistingCustomer: i.customerId ? tradedCustomerIds.has(i.customerId) : false,
        hasContacts: i.customerId ? (contactCounts.get(i.customerId) || 0) > 0 : false,
        contactCount: i.customerId ? (contactCounts.get(i.customerId) || 0) : 0,
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  let bulkRescanStatus: { running: boolean; total: number; processed: number; updated: number; failed: number } = {
    running: false, total: 0, processed: 0, updated: 0, failed: 0
  };

  app.post("/api/inquiries/bulk-rescan-dates", async (req, res) => {
    try {
      if (bulkRescanStatus.running) {
        return res.json({ message: "이미 진행 중입니다", ...bulkRescanStatus });
      }
      const allInquiries = await storage.getInquiries();
      const withFolder = allInquiries.filter(inq => inq.onedriveFolderId);
      bulkRescanStatus = { running: true, total: withFolder.length, processed: 0, updated: 0, failed: 0 };
      res.json({ message: "백그라운드에서 날짜 갱신을 시작합니다", total: withFolder.length });

      (async () => {
        for (const inq of withFolder) {
          try {
            let newDate: Date | null = null;

            try {
              const meta = await getFolderMetadata(inq.onedriveFolderId!);
              if (meta.createdDateTime) {
                const folderDate = new Date(meta.createdDateTime);
                if (!isNaN(folderDate.getTime())) {
                  newDate = folderDate;
                }
              }
            } catch {}

            if (!newDate) {
              const customerInfoList = await parseExcelCustomerInfo(inq.onedriveFolderId!);
              const firstQuoteDate = customerInfoList
                .map(info => info.quoteDate)
                .find(d => d && d.trim().length > 0);
              if (firstQuoteDate) {
                const normalized = firstQuoteDate.replace(/[.\-\/]/g, '-');
                const parsed = new Date(normalized);
                if (!isNaN(parsed.getTime())) {
                  newDate = parsed;
                }
              }
            }

            if (newDate) {
              await storage.updateInquiry(inq.id, { createdAt: newDate });
              bulkRescanStatus.updated++;
            }
          } catch {
            bulkRescanStatus.failed++;
          }
          bulkRescanStatus.processed++;
        }
        bulkRescanStatus.running = false;
        console.log(`[bulk-rescan-dates] 완료: total=${bulkRescanStatus.total}, updated=${bulkRescanStatus.updated}, failed=${bulkRescanStatus.failed}`);
      })();
    } catch (err: any) {
      bulkRescanStatus.running = false;
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiries/bulk-rescan-dates/status", async (_req, res) => {
    res.json(bulkRescanStatus);
  });

  app.get("/api/inquiries/:id", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "Not found" });
      let customerComplete = false;
      let resolvedAddress = inquiry.snapshotAddress;
      if (inquiry.customerId) {
        const cust = await storage.getCustomer(inquiry.customerId);
        const contacts = await storage.getCompaniesByCustomerId(inquiry.customerId);
        customerComplete = !!(cust && (cust.businessNumber || contacts.length > 0));
        if (!resolvedAddress && cust?.address) {
          resolvedAddress = cust.address;
        }
      }
      res.json({ ...inquiry, snapshotAddress: resolvedAddress, customerComplete });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/next-inquiry-number/:year", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      if (isNaN(year)) return res.status(400).json({ message: "유효하지 않은 연도" });
      const nextNumber = await storage.getNextInquiryNumber(year);
      res.json({ nextNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries", async (req, res) => {
    try {
      const { _contactName, _contactPhone, _contactEmail, ...body } = req.body;
      const data = insertInquirySchema.parse(body);
      if (data.probability != null) {
        const p = Number(data.probability);
        data.probability = Number.isFinite(p) && p >= 0 && p <= 5 ? Math.round(p) : 0;
      }
      if (data.status && !["active", "won", "lost", "quoted", "none"].includes(data.status)) {
        data.status = "none";
      }

      const nextNumber = await storage.getNextInquiryNumber(data.year);
      data.inquiryNumber = nextNumber;

      try {
        const yearFolderName = `${data.year} 영업`;
        const folderName = `${nextNumber}_${data.customerName}_${data.productInfo || ''}`.replace(/\/$/, '');
        const folder = await createInquiryFolder(yearFolderName, folderName);
        data.source = "onedrive";
        data.onedriveFolderId = folder.id;
        data.onedriveFolderName = folderName;
      } catch (folderErr: any) {
        console.log("OneDrive 폴더 생성 실패 (수동입력으로 저장):", folderErr.message);
        data.source = "manual";
      }

      if (data.customerName) {
        try {
          const allCustomers = await storage.getCustomers();
          const nameKey = data.customerName.trim().toLowerCase();
          let matched = allCustomers.find(c => c.companyName.trim().toLowerCase() === nameKey);
          if (!matched) {
            matched = allCustomers.find(c => {
              const key = c.companyName.trim().toLowerCase();
              return key.includes(nameKey) || nameKey.includes(key);
            });
          }
          if (!matched) {
            matched = await storage.createCustomer({ companyName: data.customerName });
          }
          data.customerId = matched.id;
        } catch (linkErr: any) {
          console.warn("Auto-link customer on create error:", linkErr.message);
        }
      }

      if (data.customerId) {
        try {
          const customer = await storage.getCustomer(data.customerId);
          if (customer) {
            data.snapshotCompanyName = customer.companyName || null;
            data.snapshotAddress = customer.address || null;
          }
        } catch (e: any) {
          console.warn("Snapshot customer info error:", e.message);
        }
      }

      if (data.companyId) {
        try {
          const company = await storage.getCompany(data.companyId);
          if (company) {
            data.snapshotContactName = company.contactName || null;
            data.snapshotEmail = company.email || null;
            data.snapshotPhone = company.phone || null;
          }
        } catch (e: any) {
          console.warn("Snapshot from existing company error:", e.message);
        }
      } else if (_contactName && data.customerId) {
        try {
          const newCompany = await storage.createCompany({
            customerId: data.customerId,
            contactName: _contactName,
            phone: _contactPhone || null,
            email: _contactEmail || null,
            companyName: data.customerName || "",
            isTemporary: false,
          });
          data.companyId = newCompany.id;
          data.snapshotContactName = _contactName;
          data.snapshotEmail = _contactEmail || null;
          data.snapshotPhone = _contactPhone || null;
        } catch (e: any) {
          console.warn("Create contact on inquiry create error:", e.message);
        }
      }

      const inquiry = await storage.createInquiry(data);
      import("./telegram").then(t => t.notifyInquiry("등록", inquiry)).catch(() => {});
      res.status(201).json(inquiry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/inquiries/:id", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.createdAt && typeof body.createdAt === "string") {
        body.createdAt = new Date(body.createdAt);
      }
      const updateSchema = insertInquirySchema.partial();
      const data = updateSchema.parse(body);
      if (data.probability != null) {
        const p = Number(data.probability);
        if (!Number.isFinite(p) || p < 0 || p > 5) {
          return res.status(400).json({ message: "단계는 0~5 사이 값이어야 합니다" });
        }
        data.probability = Math.round(p);
      }
      if (data.status && !["active", "won", "lost", "quoted", "none"].includes(data.status)) {
        return res.status(400).json({ message: "유효하지 않은 상태값입니다" });
      }
      if (data.status === "won") {
        data.isFavorite = false;
      }
      const oldInquiry = await storage.getInquiry(req.params.id);

      // companyId 변경 시 snapshot 자동 동기화
      if (data.companyId && data.companyId !== oldInquiry?.companyId) {
        try {
          const company = await storage.getCompany(data.companyId);
          if (company) {
            data.snapshotContactName = company.contactName || null;
            data.snapshotEmail = company.email || null;
            data.snapshotPhone = company.phone || null;
          }
        } catch (e: any) {
          console.warn("Snapshot sync on companyId change error:", e.message);
        }
      }

      // customerId 변경 시 snapshot 자동 동기화
      if (data.customerId && data.customerId !== oldInquiry?.customerId) {
        try {
          const customer = await storage.getCustomer(data.customerId);
          if (customer) {
            data.snapshotCompanyName = customer.companyName || null;
            data.snapshotAddress = customer.address || null;
          }
        } catch (e: any) {
          console.warn("Snapshot sync on customerId change error:", e.message);
        }
      }

      const inquiry = await storage.updateInquiry(req.params.id, data);
      if (!inquiry) return res.status(404).json({ message: "Not found" });
      if (data.status && oldInquiry && data.status !== oldInquiry.status) {
        import("./telegram").then(t => t.notifyInquiry("상태변경", inquiry)).catch(() => {});
      }

      if (inquiry.onedriveFolderId) {
        try {
          const infoData: Record<string, any> = {
            status: inquiry.status,
            probability: inquiry.probability,
            memo: inquiry.memo || "",
            expectedDate: inquiry.expectedDate || "",
            paymentTerms: inquiry.paymentTerms || "",
            productWidth: inquiry.productWidth || "",
            productDepth: inquiry.productDepth || "",
            productHeight: inquiry.productHeight || "",
            weight: inquiry.weight || "",
            material: inquiry.material || "",
            productType: inquiry.productType || "",
            industry: inquiry.industry || "",
            supplySpeed: inquiry.supplySpeed || "",
            contractRatio: inquiry.contractRatio ?? "",
            contractTimingType: inquiry.contractTimingType || "",
            contractTimingDays: inquiry.contractTimingDays ?? "",
            midRatio: inquiry.midRatio ?? "",
            midAfterDelivery: inquiry.midAfterDelivery || "",
            midTimingType: inquiry.midTimingType || "",
            midTimingDays: inquiry.midTimingDays ?? "",
            finalRatio: inquiry.finalRatio ?? "",
            finalAfterDelivery: inquiry.finalAfterDelivery || "",
            finalTimingType: inquiry.finalTimingType || "",
            finalTimingDays: inquiry.finalTimingDays ?? "",
            deliveryDate: inquiry.deliveryDate || "",
          };
          await writeInfoJson(inquiry.onedriveFolderId, infoData);
        } catch (writeErr: any) {
          console.warn("Failed to write _info.json:", writeErr.message);
        }
      }

      res.json(inquiry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/inquiries/:id/favorite", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      const newFav = !inquiry.isFavorite;
      const updated = await storage.updateInquiry(req.params.id, { isFavorite: newFav });
      if (newFav && inquiry.customerId) {
        await storage.updateCustomer(inquiry.customerId, { isFavorite: true });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/inquiries/:id", async (req, res) => {
    try {
      await storage.deleteInquiry(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/demo-report/pdf", requireAuth, async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });

      const { staff, customer } = req.body;
      if (!staff?.name || !customer?.company) {
        return res.status(400).json({ message: "작성자 이름과 고객사명은 필수입니다" });
      }

      const { generateDemoReportPDF } = await import("./demo-report-export");
      const buf = await generateDemoReportPDF({ staff, customer });

      const safeNumber = inquiry.inquiryNumber.replace(/[/\\:*?"<>|]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      const disposition = req.query.inline === "1" ? "inline" : "attachment";
      res.setHeader("Content-Disposition", `${disposition}; filename="test_report_${safeNumber}.pdf"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/optics-calculator/pdf", requireAuth, async (req, res) => {
    try {
      const { camera, lensFocal, workingDistance, aiveModel, product, results, canvasImage, inquiryNumber, customerName, staff, customer } = req.body;
      if (!camera || !results) {
        return res.status(400).json({ message: "카메라 및 계산 결과 데이터가 필요합니다" });
      }

      const { generateOpticsCalculatorPDF } = await import("./optics-calculator-export");
      const buf = await generateOpticsCalculatorPDF({
        inquiryNumber, customerName, staff, customer, camera, lensFocal, workingDistance, aiveModel, product, results, canvasImage,
      });

      const disposition = req.query.inline === "1" ? "inline" : "attachment";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="optics_report.pdf"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiries/:id/files", async (req, res) => {
    try {
      const files = await storage.getInquiryFiles(req.params.id);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/years", async (_req, res) => {
    try {
      const years = await storage.getYears();
      res.json(years);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/main-dashboard", async (req, res) => {
    try {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const nextMonth = (() => { const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

      const allInquiries = await storage.getInquiries();
      const activeInquiries = allInquiries.filter(i => i.status === "active");
      const biddingPreorder = allInquiries.filter(i => (i.probability === 4 || i.probability === 5) && i.status !== "won" && i.status !== "lost");
      const thisMonthExpected = allInquiries.filter(i => i.expectedDate?.startsWith(thisMonth));
      const nextMonthExpected = allInquiries.filter(i => i.expectedDate?.startsWith(nextMonth));
      const recentWon = allInquiries.filter(i => i.status === "won").slice(0, 3);
      const recentLost = allInquiries.filter(i => i.status === "lost").slice(0, 3);

      const allProjects = await storage.getProjects();
      const activeProjects = allProjects.filter(p => (p.status || "active") === "active");

      const allPayments = await storage.getPayments();
      const overduePayments = allPayments.filter(p => {
        if (p.status === "completed") return false;
        if (!p.plannedDate) return false;
        return p.plannedDate < now.toISOString().split('T')[0] && p.type === "income";
      });

      const allSalesInvoices = await storage.getSalesInvoices();
      const today = now.toISOString().split('T')[0];
      const in30Days = new Date(now); in30Days.setDate(in30Days.getDate() + 30);
      const in30DaysStr = in30Days.toISOString().split('T')[0];

      // 미발행 계산서: plannedIssueDate 있고 issueDate 없는 것
      const unissuedInvoices = allSalesInvoices.filter(i => !i.issueDate && i.plannedIssueDate);
      const overdueInvoices = unissuedInvoices.filter(i => i.plannedIssueDate! < today);
      const upcomingInvoices = unissuedInvoices.filter(i => i.plannedIssueDate! >= today && i.plannedIssueDate! <= in30DaysStr);

      // 미발행 목록 상세 (최대 20건, 긴급순)
      const pendingIssuanceList = [...overdueInvoices, ...upcomingInvoices]
        .sort((a, b) => (a.plannedIssueDate ?? "").localeCompare(b.plannedIssueDate ?? ""))
        .slice(0, 20)
        .map(i => ({
          id: i.id,
          companyName: i.companyName,
          projectId: i.projectId,
          totalAmount: i.totalAmount ?? 0,
          supplyAmount: i.supplyAmount ?? 0,
          plannedIssueDate: i.plannedIssueDate,
          isOverdue: (i.plannedIssueDate ?? "") < today,
        }));

      // 미수금: 예정일 지난 수금계획 목록 상세 (최대 20건)
      const overdueCollectionList = overduePayments
        .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""))
        .slice(0, 20)
        .map(p => ({
          id: p.id,
          companyName: p.companyName,
          amount: p.amount ?? 0,
          plannedDate: p.plannedDate,
          salesInvoiceId: p.salesInvoiceId,
          projectId: p.projectId,
        }));

      const allPurchaseInvoices = await storage.getPurchaseInvoices();

      const allItems = await storage.getItems();
      const allPurchaseItems = await storage.getPurchaseItems();

      res.json({
        sales: {
          activeCount: activeInquiries.length,
          biddingPreorderCount: biddingPreorder.length,
          thisMonthCount: thisMonthExpected.length,
          nextMonthCount: nextMonthExpected.length,
          recentWon: recentWon.map(i => ({ id: i.id, inquiryNumber: i.inquiryNumber, customerName: i.customerName })),
          recentLost: recentLost.map(i => ({ id: i.id, inquiryNumber: i.inquiryNumber, customerName: i.customerName })),
        },
        projects: {
          activeCount: activeProjects.length,
          totalCount: allProjects.length,
          overduePaymentCount: overduePayments.length,
          overduePaymentAmount: overduePayments.reduce((s, p) => s + (p.amount || 0), 0),
        },
        finance: {
          overdueInvoiceCount: overdueInvoices.length,
          overdueInvoiceAmount: overdueInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0),
          unissuedCount: unissuedInvoices.length,
          unissuedAmount: unissuedInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0),
          upcomingInvoiceCount: upcomingInvoices.length,
          uncollectedCount: overduePayments.length,
          uncollectedAmount: overduePayments.reduce((s, p) => s + (p.amount || 0), 0),
          salesInvoiceCount: allSalesInvoices.length,
          purchaseInvoiceCount: allPurchaseInvoices.length,
          pendingIssuanceList,
          overdueCollectionList,
        },
        trade: {
          itemCount: allItems.length,
          purchaseItemCount: allPurchaseItems.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard", async (req, res) => {
    try {
      const yearsParam = req.query.years as string | undefined;
      const years = yearsParam
        ? yearsParam.split(",").map(y => parseInt(y.trim())).filter(y => !isNaN(y))
        : undefined;
      const stats = await storage.getDashboardStats(years);

      const allInquiries = await storage.getInquiries();
      const now = new Date();
      const mapItem = (i: any) => ({
        id: i.id,
        customerName: i.customerName,
        inquiryNumber: i.inquiryNumber,
        salesNumber: i.salesNumber ?? null,
        expectedDate: i.expectedDate || null,
        probability: i.probability || 0,
        status: i.status,
      });

      const futureMonths = new Set<string>();
      for (const inq of allInquiries) {
        if (inq.expectedDate) {
          const m = inq.expectedDate.substring(0, 7);
          const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          if (m >= thisMonth) futureMonths.add(m);
        }
      }
      for (let offset = 0; offset < 3; offset++) {
        const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        futureMonths.add(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
      }
      const sortedMonths = Array.from(futureMonths).sort();

      const labels = ["이번달", "다음달", "다다음달"];
      const upcomingByMonth = sortedMonths.map((monthStr, idx) => {
        const matching = allInquiries.filter(i => i.expectedDate?.startsWith(monthStr));
        return {
          month: monthStr,
          label: idx < 3 ? labels[idx] : monthStr,
          count: matching.length,
          items: matching.map(mapItem),
        };
      });

      const noDate = allInquiries.filter(i =>
        !i.expectedDate && i.status === "active"
      );

      res.json({
        ...stats,
        upcomingByMonth,
        noDate: { count: noDate.length, items: noDate.map(mapItem) },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiry-source-stats", async (_req, res) => {
    try {
      const allInquiries = await storage.getInquiries();
      const webInquiries = allInquiries.filter(i => i.isWebInquiry || i.source === "website");

      const sourceCounts: Record<string, number> = {};
      for (const inq of allInquiries) {
        const src = (inq.isWebInquiry || inq.source === "website") ? "website"
          : inq.source === "onedrive" ? "onedrive"
          : inq.source === "manual" ? "manual"
          : inq.source || "manual";
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      }
      const sourceLabels: Record<string, string> = {
        website: "홈페이지",
        onedrive: "OneDrive",
        manual: "직접입력",
      };
      const sourceSummary = Object.entries(sourceCounts).map(([source, count]) => ({
        source,
        label: sourceLabels[source] || source,
        count,
      }));

      const now = new Date();
      const monthlyMap: Record<string, number> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap[key] = 0;
      }
      for (const inq of webInquiries) {
        const d = inq.createdAt ? new Date(inq.createdAt) : null;
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthlyMap) monthlyMap[key]++;
      }
      const monthlyTrend = Object.entries(monthlyMap).map(([month, count]) => {
        const [y, m] = month.split("-");
        return { month, label: `${m}월`, year: parseInt(y), count };
      });

      const webTotal = webInquiries.length;
      const webWon = webInquiries.filter(i => i.status === "won").length;
      const winRate = webTotal > 0 ? Math.round((webWon / webTotal) * 100) : 0;

      const recentList = [...webInquiries]
        .sort((a, b) => {
          const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bd - ad;
        })
        .slice(0, 20)
        .map(i => ({
          id: i.id,
          inquiryNumber: i.inquiryNumber,
          customerName: i.customerName,
          productInfo: i.productInfo || null,
          status: i.status,
          createdAt: i.createdAt,
          snapshotContactName: i.snapshotContactName || null,
        }));

      res.json({ sourceSummary, monthlyTrend, conversionStats: { total: webTotal, won: webWon, winRate }, recentList });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/onedrive/status", async (req, res) => {
    try {
      const status = await checkConnectionStatus(req.get('host'));
      res.json(status);
    } catch (err: any) {
      res.json({ connected: false, message: err.message });
    }
  });

  app.get("/api/onedrive/auth", async (req, res) => {
    try {
      const authUrl = getAuthUrl(req.get('host'));
      res.json({ authUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/onedrive/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const error = req.query.error as string;

      if (error) {
        const errorDesc = req.query.error_description as string || error;
        console.error('[OneDrive OAuth] 인증 실패:', errorDesc);
        return res.redirect('/?onedrive_error=' + encodeURIComponent(errorDesc));
      }

      if (!code) {
        return res.redirect('/?onedrive_error=' + encodeURIComponent('인증 코드가 없습니다.'));
      }

      await exchangeCodeForTokens(code, req.get('host'));
      return res.redirect('/?onedrive_connected=true');
    } catch (err: any) {
      console.error('[OneDrive OAuth] 콜백 처리 실패:', err.message);
      return res.redirect('/?onedrive_error=' + encodeURIComponent(err.message));
    }
  });

  app.post("/api/onedrive/disconnect", async (_req, res) => {
    try {
      await storage.deleteOnedriveToken();
      resetTokenCache();
      res.json({ ok: true, message: 'OneDrive 연결이 해제되었습니다.' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/onedrive/share/:itemId", async (req, res) => {
    try {
      const { createShareLink } = await import("./onedrive");
      const link = await createShareLink(req.params.itemId);
      if (!link) return res.status(500).json({ message: "공유 링크 생성 실패" });
      res.json({ link });
    } catch (err: any) {
      console.error("Share link error:", err.message);
      res.status(500).json({ message: err.message || "공유 링크 생성 실패" });
    }
  });

  app.get("/api/telegram/status", async (_req, res) => {
    const { isConfigured, hasChatId, testConnection } = await import("./telegram");
    if (!isConfigured()) return res.json({ configured: false, hasChatId: false, botName: null });
    const conn = await testConnection();
    res.json({ configured: true, hasChatId: hasChatId(), botName: conn.botName || null, botOk: conn.ok });
  });

  app.post("/api/telegram/detect-chat", async (_req, res) => {
    const { isConfigured, detectChatId } = await import("./telegram");
    if (!isConfigured()) return res.status(400).json({ message: "봇 토큰이 설정되지 않았습니다" });
    const result = await detectChatId();
    if (!result) return res.json({ found: false, message: "채팅을 찾을 수 없습니다. 그룹에 봇을 추가하고 메시지를 보낸 후 다시 시도하세요." });
    process.env.TELEGRAM_CHAT_ID = result.chatId;
    res.json({ found: true, chatId: result.chatId, title: result.title });
  });

  app.post("/api/telegram/test", async (_req, res) => {
    const { sendTelegramMessage } = await import("./telegram");
    const ok = await sendTelegramMessage("🔔 <b>테스트 알림</b>\n영업 관리 시스템에서 보내는 알림이 정상적으로 연결되었습니다.");
    res.json({ ok });
  });

  // 일일 보고서 미리보기(전송 안 함)
  app.get("/api/daily-report/preview", async (_req, res) => {
    try {
      const { buildDailyReport } = await import("./daily-report");
      res.json({ message: await buildDailyReport() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 일일 보고서 즉시 발송(휴일 무시, 텔레그램 전송)
  app.post("/api/daily-report/send", async (_req, res) => {
    try {
      const { sendDailyReport } = await import("./daily-report");
      res.json({ ok: await sendDailyReport(true) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telegram/memos", async (_req, res) => {
    try {
      const memos = await storage.getTelegramMemos();
      res.json(memos);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telegram/memos/unread-count", async (_req, res) => {
    try {
      const count = await storage.getUnreadMemoCount();
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/telegram/memos/:id/read", async (req, res) => {
    try {
      const memo = await storage.markMemoRead(req.params.id);
      if (!memo) return res.status(404).json({ message: "Not found" });
      res.json(memo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/telegram/memos/:id", async (req, res) => {
    try {
      await storage.deleteTelegramMemo(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/onedrive/refresh", async (req, res) => {
    try {
      resetTokenCache();
      const status = await checkConnectionStatus(req.get('host'));
      res.json(status);
    } catch (err: any) {
      res.json({ connected: false, message: err.message });
    }
  });

  app.get("/api/onedrive/years", async (_req, res) => {
    try {
      const yearFolders = await listRootSalesFolder();
      const years = yearFolders
        .filter(f => f.name.includes('영업'))
        .map(f => {
          const m = f.name.match(/(\d{4})/);
          return m ? parseInt(m[1]) : null;
        })
        .filter((y): y is number => y !== null)
        .sort((a, b) => b - a);
      res.json(years);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sync-onedrive", async (req, res) => {
    try {
      const targetYear = req.body?.year ? parseInt(req.body.year) : undefined;
      const yearFolders = await listRootSalesFolder();
      let synced = 0;
      let skipped = 0;
      let total = 0;

      const foldersToSync = yearFolders.filter(f => {
        if (!f.name.includes('영업')) return false;
        const m = f.name.match(/(\d{4})/);
        if (!m) return false;
        if (targetYear) return parseInt(m[1]) === targetYear;
        return true;
      });

      for (const yearFolder of foldersToSync) {
        const yearMatch = yearFolder.name.match(/(\d{4})/)!;
        const year = parseInt(yearMatch[1]);

        const inquiryFolders = await listYearFolders(yearFolder.name);
        total += inquiryFolders.length;

        for (const folder of inquiryFolders) {
          try {
            const existing = await storage.getInquiryByFolderId(folder.id);
            if (existing) {
              if (folder.createdDateTime) {
                const parsedFolderDate = new Date(folder.createdDateTime);
                if (!isNaN(parsedFolderDate.getTime())) {
                  await storage.updateInquiry(existing.id, { createdAt: parsedFolderDate });
                }
              }
              skipped++;
              continue;
            }

            const parsed = parseInquiryFolderName(folder.name, year);
            if (!parsed) {
              console.warn(`Skipping invalid folder: ${folder.name}`);
              skipped++;
              continue;
            }

            const info = await readInfoJson(folder.id);

            const rawProb = info?.probability != null ? parseInt(String(info.probability)) : 0;
            const safeProbability = Number.isFinite(rawProb) && rawProb >= 0 && rawProb <= 5 ? rawProb : 0;
            const rawStatus = info?.status;
            const safeStatus = ["active", "won", "lost", "quoted", "none"].includes(rawStatus) ? rawStatus : "none";

            let folderDate = new Date(year, 0, 1);
            if (folder.createdDateTime) {
              const parsed_date = new Date(folder.createdDateTime);
              if (!isNaN(parsed_date.getTime())) {
                folderDate = parsed_date;
              }
            }

            const inquiry = await storage.createInquiry({
              inquiryNumber: parsed.inquiryNumber,
              customerName: parsed.customerName,
              productInfo: parsed.productInfo || null,
              year,
              probability: safeProbability,
              createdAt: folderDate,
              expectedDate: info?.expectedDate || null,
              paymentTerms: info?.paymentTerms || null,
              memo: info?.memo || null,
              status: safeStatus,
              onedriveFolderId: folder.id,
              onedriveFolderName: folder.name,
              source: "onedrive",
              productWidth: info?.productWidth || null,
              productDepth: info?.productDepth || null,
              productHeight: info?.productHeight || null,
              weight: info?.weight || null,
              material: info?.material || null,
              productType: info?.productType || null,
              industry: info?.industry || null,
              supplySpeed: info?.supplySpeed || null,
              contractRatio: info?.contractRatio != null ? parseInt(String(info.contractRatio)) || null : null,
              contractTimingType: info?.contractTimingType || null,
              contractTimingDays: info?.contractTimingDays != null ? parseInt(String(info.contractTimingDays)) || null : null,
              midRatio: info?.midRatio != null ? parseInt(String(info.midRatio)) || null : null,
              midAfterDelivery: info?.midAfterDelivery || null,
              midTimingType: info?.midTimingType || null,
              midTimingDays: info?.midTimingDays != null ? parseInt(String(info.midTimingDays)) || null : null,
              finalRatio: info?.finalRatio != null ? parseInt(String(info.finalRatio)) || null : null,
              finalAfterDelivery: info?.finalAfterDelivery || null,
              finalTimingType: info?.finalTimingType || null,
              finalTimingDays: info?.finalTimingDays != null ? parseInt(String(info.finalTimingDays)) || null : null,
              deliveryDate: info?.deliveryDate || null,
            });

            const files = await listFolderFiles(folder.id);
            for (const file of files) {
              const ext = file.name.split('.').pop()?.toLowerCase() || '';
              await storage.createInquiryFile({
                inquiryId: inquiry.id,
                fileName: file.name,
                fileType: ext,
                onedriveItemId: file.id,
                webUrl: file.webUrl,
                size: file.size,
              });
            }
            synced++;
          } catch (folderErr: any) {
            console.warn(`Error processing folder ${folder.name}:`, folderErr.message);
            skipped++;
          }
        }
      }

      let linkedCount = 0;
      try {
        const allInquiries = await storage.getInquiries(targetYear ? { year: targetYear } : {});
        const unlinked = allInquiries.filter(i => !i.customerId && i.customerName);
        if (unlinked.length > 0) {
          const allCustomers = await storage.getCustomers();
          const customersByName = new Map<string, typeof allCustomers[0]>();
          for (const c of allCustomers) {
            customersByName.set(c.companyName.trim().toLowerCase(), c);
          }

          for (const inq of unlinked) {
            const nameKey = inq.customerName.trim().toLowerCase();
            let matched = customersByName.get(nameKey);

            if (!matched) {
              for (const [key, c] of customersByName) {
                if (key.includes(nameKey) || nameKey.includes(key)) {
                  matched = c;
                  break;
                }
              }
            }

            if (!matched) {
              const newCustomer = await storage.createCustomer({
                companyName: inq.customerName,
              });
              customersByName.set(newCustomer.companyName.trim().toLowerCase(), newCustomer);
              matched = newCustomer;
            }

            await storage.updateInquiry(inq.id, { customerId: matched.id });
            linkedCount++;
          }
        }
      } catch (linkErr: any) {
        console.warn("Auto-link customers error:", linkErr.message);
      }

      res.json({
        message: `${synced}개 동기화, ${linkedCount}개 고객 연결 완료`,
        synced,
        skipped,
        total,
        linked: linkedCount,
        year: targetYear || "전체",
      });
    } catch (err: any) {
      console.error("OneDrive sync error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sync-onedrive/:id/files", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry || !inquiry.onedriveFolderId) {
        return res.status(404).json({ message: "Inquiry not found or no OneDrive folder" });
      }

      await storage.deleteInquiryFilesByInquiryId(inquiry.id);
      const files = await listFolderFiles(inquiry.onedriveFolderId);
      const created = [];
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const f = await storage.createInquiryFile({
          inquiryId: inquiry.id,
          fileName: file.name,
          fileType: ext,
          onedriveItemId: file.id,
          webUrl: file.webUrl,
          size: file.size,
        });
        created.push(f);
      }

      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Customer routes (공식 고객사 - 사업자등록 기준)
  app.get("/api/customers", async (req, res) => {
    try {
      const list = await storage.getCustomers();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      if (q.length < 1) return res.json([]);
      const results = await storage.searchCustomers(q);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      res.json(customer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const data = insertCustomerSchema.parse(req.body);
      // 사업자번호 중복차단: 같은 번호의 거래처가 이미 있으면 생성하지 않고 기존 건 반환
      if (data.businessNumber && data.businessNumber.replace(/[^0-9]/g, "")) {
        const existing = await storage.getCustomerByBusinessNumber(data.businessNumber);
        if (existing) {
          return res.status(409).json({ message: `이미 등록된 거래처입니다: ${existing.companyName}`, existing });
        }
      }
      const customer = await storage.createCustomer(data);
      res.status(201).json(customer);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // 사업자등록증 OCR 자동입력 — 네이버 CLOVA OCR(Document OCR · 사업자등록증)
  const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
  app.post("/api/customers/extract-business-cert", certUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 필요합니다" });
      const invokeUrl = process.env.CLOVA_OCR_INVOKE_URL;
      const secret = process.env.CLOVA_OCR_SECRET;
      if (!invokeUrl || !secret) {
        return res.status(503).json({ message: "CLOVA OCR 설정이 없습니다. 서버 환경변수 CLOVA_OCR_INVOKE_URL / CLOVA_OCR_SECRET 를 등록해 주세요." });
      }

      const mime = (req.file.mimetype || "").toLowerCase();
      const format = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("tif") ? "tiff" : "jpg";
      const body = {
        version: "V2",
        requestId: `cert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        images: [{ format, name: "biz-license", data: req.file.buffer.toString("base64") }],
      };

      const resp = await fetch(invokeUrl, {
        method: "POST",
        headers: { "X-OCR-SECRET": secret, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return res.status(502).json({ message: `CLOVA OCR 호출 실패 (${resp.status})`, detail: t.slice(0, 300) });
      }
      const data: any = await resp.json();
      const image = data?.images?.[0];
      if (!image || image.inferResult !== "SUCCESS") {
        return res.status(422).json({ message: "사업자등록증을 인식하지 못했습니다. 더 선명한 이미지를 사용하세요." });
      }
      const r = image.bizLicense?.result || {};
      const pick = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => x?.text).filter(Boolean).join(" ").trim() : "";
      res.json({
        companyName: pick(r.companyName) || pick(r.corpName) || "",
        businessNumber: pick(r.registerNumber) || "",
        representative: pick(r.repName) || "",
        address: pick(r.bisAddress) || pick(r.headAddress) || "",
        businessType: pick(r.bisType) || "",
        businessCategory: pick(r.bisItem) || "",
      });
    } catch (err: any) {
      console.error("[extract-business-cert]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const data = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, data);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });

      const relatedInquiries = await storage.getInquiriesByCustomerId(req.params.id);
      for (const inq of relatedInquiries) {
        const snapshotUpdate: Record<string, any> = {};
        if (data.companyName !== undefined) snapshotUpdate.snapshotCompanyName = data.companyName;
        if (data.address !== undefined) snapshotUpdate.snapshotAddress = data.address || null;
        if (Object.keys(snapshotUpdate).length > 0) {
          await storage.updateInquiry(inq.id, snapshotUpdate);
        }
      }

      res.json(customer);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/customers/:id/favorite", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      const updated = await storage.updateCustomer(req.params.id, { isFavorite: !customer.isFavorite });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers-with-stats", async (_req, res) => {
    try {
      const list = await storage.getCustomers();
      const inquiryCounts = await storage.getCustomerInquiryCounts();
      const contactCounts = await storage.getCustomerContactCounts();
      const lastTxDates = await storage.getCustomerLastTransactionDates();
      const result = list.map(c => ({
        ...c,
        inquiryCount: inquiryCounts.get(c.id) || 0,
        contactCount: contactCounts.get(c.id) || 0,
        lastTransactionDate: lastTxDates.get(c.id) || null,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/customers/:id/merge-into/:targetId", async (req, res) => {
    try {
      const { id: sourceId, targetId } = req.params;
      const source = await storage.getCustomer(sourceId);
      const target = await storage.getCustomer(targetId);
      if (!source) return res.status(404).json({ message: "Source customer not found" });
      if (!target) return res.status(404).json({ message: "Target customer not found" });

      const targetContacts = await storage.getCompaniesByCustomerId(targetId);
      const firstContact = targetContacts.length > 0 ? targetContacts[0] : null;
      const snapshotUpdate = {
        customerId: targetId,
        snapshotCompanyName: target.companyName,
        snapshotAddress: target.address || null,
        snapshotContactName: firstContact?.contactName || null,
        snapshotEmail: firstContact?.email || null,
        snapshotPhone: firstContact?.phone || null,
      };

      const sourceInquiries = await storage.getInquiriesByCustomerId(sourceId);
      for (const inq of sourceInquiries) {
        await storage.updateInquiry(inq.id, snapshotUpdate);
      }

      const orphanInquiries = await storage.getUnlinkedInquiriesByCustomerName(source.companyName);
      let linkedOrphans = 0;
      for (const inq of orphanInquiries) {
        await storage.updateInquiry(inq.id, snapshotUpdate);
        linkedOrphans++;
      }

      const sourceCompanies = await storage.getCompaniesByCustomerId(sourceId);
      for (const comp of sourceCompanies) {
        await storage.updateCompany(comp.id, { customerId: targetId });
      }

      // 매출계산서·프로젝트의 거래처 참조도 대상으로 이전 (병합 후 참조 끊김 방지)
      const movedInvoicesRes = await pool.query(
        `UPDATE sales_invoices SET customer_id = $1 WHERE customer_id = $2`,
        [targetId, sourceId]
      );
      const movedProjectsRes = await pool.query(
        `UPDATE projects SET customer_id = $1 WHERE customer_id = $2`,
        [targetId, sourceId]
      );

      await storage.deleteCustomer(sourceId);

      res.json({
        message: `${source.companyName} → ${target.companyName} 병합 완료`,
        movedInquiries: sourceInquiries.length,
        movedCompanies: sourceCompanies.length,
        movedInvoices: movedInvoicesRes.rowCount ?? 0,
        movedProjects: movedProjectsRes.rowCount ?? 0,
        linkedOrphans,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers/:id/contacts", async (req, res) => {
    try {
      const contacts = await storage.getCompaniesByCustomerId(req.params.id);
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/unlinked-count", async (_req, res) => {
    try {
      const count = await storage.getTemporaryCompanyCount();
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/temporary", async (_req, res) => {
    try {
      const list = await storage.getTemporaryCompanies();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies/auto-link", async (_req, res) => {
    try {
      const tempCompanies = await storage.getTemporaryCompanies();
      const allCustomers = await storage.getCustomers();
      let linked = 0;
      let unmatched = 0;

      for (const tc of tempCompanies) {
        const tcName = tc.companyName.trim().toLowerCase();
        const exactMatch = allCustomers.find(c => c.companyName.trim().toLowerCase() === tcName);
        if (exactMatch) {
          await storage.updateCompany(tc.id, { customerId: exactMatch.id, isTemporary: false });
          linked++;
          continue;
        }

        const partialMatches = allCustomers.filter(c => {
          const cName = c.companyName.trim().toLowerCase();
          return cName.includes(tcName) || tcName.includes(cName);
        });
        if (partialMatches.length === 1) {
          await storage.updateCompany(tc.id, { customerId: partialMatches[0].id, isTemporary: false });
          linked++;
          continue;
        }

        unmatched++;
      }

      res.json({
        message: `자동 매칭 완료: ${linked}건 연결, ${unmatched}건 미매칭`,
        linked,
        unmatched,
        total: tempCompanies.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sync-customers", async (_req, res) => {
    try {
      const rows = await parseCustomerListFromOneDrive();
      let created = 0;
      let updated = 0;
      let linked = 0;

      for (const row of rows) {
        const existing = row.businessNumber
          ? await storage.getCustomerByBusinessNumber(row.businessNumber)
          : await storage.getCustomerByName(row.companyName);

        const data = {
          companyName: row.companyName,
          businessNumber: row.businessNumber || null,
          representative: row.representative || null,
          address: row.address || null,
          businessType: row.businessType || null,
          businessCategory: row.businessCategory || null,
          mgmtDepartment: row.mgmtDepartment || null,
          mgmtContactName: row.mgmtContactName || null,
          mgmtPhone: row.mgmtPhone || null,
          mgmtMobile: row.mgmtMobile || null,
          mgmtFax: row.mgmtFax || null,
          mgmtEmail: row.mgmtEmail || null,
          notes: row.notes || null,
          primaryContact: row.primaryContact || null,
          registrationDate: row.registrationDate || null,
        };

        let customer;
        if (existing) {
          customer = await storage.updateCustomer(existing.id, data);
          updated++;
        } else {
          customer = await storage.createCustomer(data);
          created++;
        }

        if (customer) {
          const tempCompanies = await storage.getTemporaryCompaniesByName(row.companyName);
          for (const tc of tempCompanies) {
            await storage.updateCompany(tc.id, {
              customerId: customer.id,
              isTemporary: false,
            });
            linked++;
          }
        }
      }

      res.json({
        message: `고객사 목록 동기화 완료: ${created}개 신규, ${updated}개 업데이트, ${linked}개 임시→정식 연결`,
        total: rows.length,
        created,
        updated,
        linked,
      });
    } catch (err: any) {
      console.error("고객사 동기화 오류:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers/:id/inquiries", async (req, res) => {
    try {
      const list = await storage.getInquiriesByCustomerId(req.params.id);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies/:id/link-customer", async (req, res) => {
    try {
      const { customerId } = z.object({ customerId: z.string() }).parse(req.body);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      const company = await storage.linkCompanyToCustomer(req.params.id, customerId);
      if (!company) return res.status(404).json({ message: "담당자를 찾을 수 없습니다" });
      res.json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/companies/:id/unlink-customer", async (req, res) => {
    try {
      const company = await storage.updateCompany(req.params.id, { customerId: null, isTemporary: true });
      if (!company) return res.status(404).json({ message: "담당자를 찾을 수 없습니다" });
      res.json(company);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/link-customer", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      const { customerId, companyId } = z.object({ customerId: z.string(), companyId: z.string().optional() }).parse(req.body);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      const contacts = await storage.getCompaniesByCustomerId(customerId);
      let selectedContact = contacts.length > 0 ? contacts[0] : null;
      if (companyId) {
        const found = contacts.find(c => c.id === companyId);
        if (found) selectedContact = found;
      }
      const snapshotUpdate: Record<string, any> = {
        customerId: customer.id,
        companyId: selectedContact?.id || null,
        snapshotCompanyName: customer.companyName,
        snapshotAddress: customer.address || null,
        snapshotContactName: selectedContact?.contactName || null,
        snapshotEmail: selectedContact?.email || null,
        snapshotPhone: selectedContact?.phone || null,
      };
      const updated = await storage.updateInquiry(inquiry.id, {
        ...snapshotUpdate,
        customerName: customer.companyName,
      });

      let linkedSiblings = 0;
      if (inquiry.customerName) {
        const siblingInquiries = await storage.getUnlinkedInquiriesByCustomerName(inquiry.customerName);
        for (const inq of siblingInquiries) {
          if (inq.id !== inquiry.id) {
            // 고객사(customerId)만 연결, 담당자(contact)는 각 영업건이 독립적으로 유지
            await storage.updateInquiry(inq.id, {
              customerId: customer.id,
              snapshotCompanyName: customer.companyName,
              snapshotAddress: customer.address || null,
              customerName: customer.companyName,
            });
            linkedSiblings++;
          }
        }
      }

      res.json({ ...updated, linkedSiblings });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Inquiry Memo routes
  app.get("/api/inquiries/:id/memos", async (req, res) => {
    try {
      const memos = await storage.getInquiryMemos(req.params.id);
      res.json(memos);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/memos", async (req, res) => {
    try {
      const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
      const now = new Date().toISOString();
      const memo = await storage.createInquiryMemo({
        inquiryId: req.params.id,
        content,
        createdAt: now,
      });
      res.status(201).json(memo);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/inquiry-memos/:id", async (req, res) => {
    try {
      const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
      const memo = await storage.updateInquiryMemo(req.params.id, content);
      if (!memo) return res.status(404).json({ message: "메모를 찾을 수 없습니다" });
      res.json(memo);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/inquiry-memos/:id", async (req, res) => {
    try {
      await storage.deleteInquiryMemo(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/tasks/pending", async (req, res) => {
    try {
      const tasks = await storage.getAllPendingTasks();
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiries/:id/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByInquiry(req.params.id);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/tasks", async (req, res) => {
    try {
      const { content, dueDate, dueTime, taskType, staffId } = req.body;
      const resolvedTaskType = taskType === "schedule" ? "schedule" : "todo";
      if (!content?.trim()) return res.status(400).json({ message: "내용을 입력하세요" });
      const normalizedDueDate = typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : null;
      const normalizedDueTime = typeof dueTime === "string" && /^\d{2}:\d{2}/.test(dueTime) ? dueTime.slice(0, 5) : null;
      const prefix = resolvedTaskType === "schedule" ? "[일정]" : "[할일]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const inquiry = await storage.getInquiry(req.params.id);
          const title = `${prefix} ${inquiry?.inquiryNumber || ""}_${inquiry?.customerName || ""}: ${content.trim()}`;
          {
            const { createTaskEvent } = await import("./google-calendar");
            calendarEventId = await createTaskEvent(title, normalizedDueDate, resolvedTaskType === "schedule" ? normalizedDueTime : null);
          }
        } catch (calErr: any) {
          console.log(`Google 등록 실패 (할일 생성은 계속): ${calErr.message}`);
        }
      }

      const task = await storage.createTask({
        inquiryId: req.params.id,
        content: content.trim(),
        completed: false,
        dueDate: normalizedDueDate,
        dueTime: normalizedDueTime,
        calendarEventId,
        taskType: resolvedTaskType,
        staffId: staffId || null,
        createdAt: new Date().toISOString().slice(0, 10),
      });
      storage.getInquiry(req.params.id).then(inq => {
        const info = inq ? `${inq.inquiryNumber || ""}_${inq.customerName || ""}` : undefined;
        import("./telegram").then(t => t.notifyTask("추가", task, "영업", info)).catch(() => {});
      }).catch(() => {});
      res.status(201).json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const allowed: Record<string, any> = {};
      if (typeof req.body.completed === "boolean") allowed.completed = req.body.completed;
      if (typeof req.body.content === "string" && req.body.content.trim()) allowed.content = req.body.content.trim();
      if (req.body.dueDate !== undefined) {
        allowed.dueDate = typeof req.body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(req.body.dueDate)
          ? req.body.dueDate.slice(0, 10) : null;
      }
      if (req.body.dueTime !== undefined) {
        allowed.dueTime = typeof req.body.dueTime === "string" && /^\d{2}:\d{2}/.test(req.body.dueTime)
          ? req.body.dueTime.slice(0, 5) : null;
      }
      if (req.body.staffId !== undefined) {
        allowed.staffId = req.body.staffId || null;
      }
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "수정할 내용이 없습니다" });

      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });

      if (allowed.completed === true) {
        if (existing.calendarEventId) {
          try {
            {
              const { deleteCalendarEvent } = await import("./google-calendar");
              await deleteCalendarEvent(existing.calendarEventId);
              allowed.calendarEventId = null;
            }
          } catch (calErr: any) {
            console.log(`Google 완료 처리 실패: ${calErr.message}`);
          }
        }
      } else if (allowed.dueDate !== undefined || allowed.dueTime !== undefined) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google 기존 이벤트 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
        }
        const newDueDate = allowed.dueDate !== undefined ? allowed.dueDate : existing.dueDate;
        const newDueTime = allowed.dueTime !== undefined ? allowed.dueTime : existing.dueTime;
        if (newDueDate) {
          try {
            const inquiry = await storage.getInquiry(existing.inquiryId);
            const content = allowed.content || existing.content;
            const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
            const title = `${prefix} ${inquiry?.inquiryNumber || ""}_${inquiry?.customerName || ""}: ${content}`;
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, newDueDate, existing.taskType === "schedule" ? newDueTime : null);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google 재등록 실패: ${calErr.message}`);
          }
        }
      } else if (allowed.content && existing.calendarEventId) {
        try {
          const inquiry = await storage.getInquiry(existing.inquiryId);
          const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
          const title = `${prefix} ${inquiry?.inquiryNumber || ""}_${inquiry?.customerName || ""}: ${allowed.content}`;
          if (existing.dueDate) {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
            allowed.calendarEventId = newEventId;
          }
        } catch (calErr: any) {
          console.log(`Google 제목 업데이트 실패: ${calErr.message}`);
        }
      }

      const task = await storage.updateTask(req.params.id, allowed);
      if (!task) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (allowed.completed === true && !existing.completed) {
        storage.getInquiry(existing.inquiryId).then(inq => {
          const info = inq ? `${inq.inquiryNumber || ""}_${inq.customerName || ""}` : undefined;
          import("./telegram").then(t => t.notifyTask("완료", task, "영업", info)).catch(() => {});
        }).catch(() => {});
      }
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (existing?.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch (calErr: any) {
          console.log(`Google 삭제 실패: ${calErr.message}`);
        }
      }
      await storage.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Project Task routes
  app.get("/api/projects/:id/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByProject(req.params.id);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/project-tasks/pending", async (req, res) => {
    try {
      const tasks = await storage.getAllPendingProjectTasks();
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/tasks", async (req, res) => {
    try {
      const { content, dueDate, dueTime, taskType, staffId } = req.body;
      const resolvedTaskType = taskType === "schedule" ? "schedule" : "todo";
      if (!content?.trim()) return res.status(400).json({ message: "내용을 입력하세요" });
      const normalizedDueDate = typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : null;
      const normalizedDueTime = typeof dueTime === "string" && /^\d{2}:\d{2}/.test(dueTime) ? dueTime.slice(0, 5) : null;
      const prefix = resolvedTaskType === "schedule" ? "[일정]" : "[할일]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const project = await storage.getProject(req.params.id);
          const title = `${prefix} ${project?.projectNumber || ""}_${project?.customerName || ""}: ${content.trim()}`;
          {
            const { createTaskEvent } = await import("./google-calendar");
            calendarEventId = await createTaskEvent(title, normalizedDueDate, resolvedTaskType === "schedule" ? normalizedDueTime : null);
          }
        } catch (calErr: any) {
          console.log(`Google 등록 실패 (프로젝트 할일 생성은 계속): ${calErr.message}`);
        }
      }

      const task = await storage.createProjectTask({
        projectId: req.params.id,
        content: content.trim(),
        completed: false,
        dueDate: normalizedDueDate,
        dueTime: normalizedDueTime,
        calendarEventId,
        taskType: resolvedTaskType,
        staffId: staffId || null,
        createdAt: new Date().toISOString().slice(0, 10),
      });
      storage.getProject(req.params.id).then(proj => {
        const info = proj ? `${proj.projectNumber || ""}_${proj.customerName || ""}` : undefined;
        import("./telegram").then(t => t.notifyTask("추가", task, "프로젝트", info)).catch(() => {});
      }).catch(() => {});
      res.status(201).json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/project-tasks/:id", async (req, res) => {
    try {
      const allowed: Record<string, any> = {};
      if (typeof req.body.completed === "boolean") allowed.completed = req.body.completed;
      if (typeof req.body.content === "string" && req.body.content.trim()) allowed.content = req.body.content.trim();
      if (req.body.dueDate !== undefined) {
        allowed.dueDate = typeof req.body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(req.body.dueDate)
          ? req.body.dueDate.slice(0, 10) : null;
      }
      if (req.body.dueTime !== undefined) {
        allowed.dueTime = typeof req.body.dueTime === "string" && /^\d{2}:\d{2}/.test(req.body.dueTime)
          ? req.body.dueTime.slice(0, 5) : null;
      }
      if (req.body.staffId !== undefined) {
        allowed.staffId = req.body.staffId || null;
      }
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "수정할 내용이 없습니다" });

      const existing = await storage.getProjectTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });

      if (allowed.completed === true) {
        if (existing.calendarEventId) {
          try {
            {
              const { deleteCalendarEvent } = await import("./google-calendar");
              await deleteCalendarEvent(existing.calendarEventId);
              allowed.calendarEventId = null;
            }
          } catch (calErr: any) {
            console.log(`Google 완료 처리 실패: ${calErr.message}`);
          }
        }
      } else if (allowed.dueDate !== undefined || allowed.dueTime !== undefined) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google 기존 이벤트 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
        }
        const newDueDate = allowed.dueDate !== undefined ? allowed.dueDate : existing.dueDate;
        const newDueTime = allowed.dueTime !== undefined ? allowed.dueTime : existing.dueTime;
        if (newDueDate) {
          try {
            const project = await storage.getProject(existing.projectId);
            const content = allowed.content || existing.content;
            const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
            const title = `${prefix} ${project?.projectNumber || ""}_${project?.customerName || ""}: ${content}`;
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, newDueDate, existing.taskType === "schedule" ? newDueTime : null);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google 재등록 실패: ${calErr.message}`);
          }
        }
      } else if (allowed.content && existing.calendarEventId) {
        try {
          const project = await storage.getProject(existing.projectId);
          const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
          const title = `${prefix} ${project?.projectNumber || ""}_${project?.customerName || ""}: ${allowed.content}`;
          if (existing.dueDate) {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
            allowed.calendarEventId = newEventId;
          }
        } catch (calErr: any) {
          console.log(`Google 제목 업데이트 실패: ${calErr.message}`);
        }
      }

      const task = await storage.updateProjectTask(req.params.id, allowed);
      if (!task) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (allowed.completed === true && !existing.completed) {
        storage.getProject(existing.projectId).then(proj => {
          const info = proj ? `${proj.projectNumber || ""}_${proj.customerName || ""}` : undefined;
          import("./telegram").then(t => t.notifyTask("완료", task, "프로젝트", info)).catch(() => {});
        }).catch(() => {});
      }
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/project-tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getProjectTask(req.params.id);
      if (existing?.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch (calErr: any) {
          console.log(`Google 삭제 실패: ${calErr.message}`);
        }
      }
      await storage.deleteProjectTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/tasks/sync-calendar", async (_req, res) => {
    try {
      const { createTaskEvent } = await import("./google-calendar");
      const inquiryTasksList = await storage.getAllPendingTasks();
      const projectTasksList = await storage.getAllPendingProjectTasks();

      let synced = 0, failed = 0;

      for (const task of inquiryTasksList) {
        if (task.calendarEventId || !task.dueDate) continue;
        try {
          const prefix = task.taskType === "schedule" ? "[일정]" : "[할일]";
          const title = `${prefix} ${task.inquiryNumber || ""}_${task.customerName || ""}: ${task.content}`;
          const eventId = await createTaskEvent(title, task.dueDate, task.taskType === "schedule" ? task.dueTime : null);
          if (eventId) {
            await storage.updateTask(task.id, { calendarEventId: eventId });
            synced++;
          } else { failed++; }
        } catch { failed++; }
      }

      for (const task of projectTasksList) {
        if (task.calendarEventId || !task.dueDate) continue;
        try {
          const prefix = task.taskType === "schedule" ? "[일정]" : "[할일]";
          const title = `${prefix} P:${task.projectNumber || ""}_${task.customerName || ""}: ${task.content}`;
          const eventId = await createTaskEvent(title, task.dueDate, task.taskType === "schedule" ? task.dueTime : null);
          if (eventId) {
            await storage.updateProjectTask(task.id, { calendarEventId: eventId });
            synced++;
          } else { failed++; }
        } catch { failed++; }
      }

      const poTasksList = await storage.getAllPendingPurchaseOrderTasks();
      for (const task of poTasksList) {
        if (task.calendarEventId || !task.dueDate) continue;
        try {
          const poPrefix = task.taskType === "todo" ? "[할일]" : "[일정]";
          const title = `${poPrefix} ${task.content}`;
          const eventId = await createTaskEvent(title, task.dueDate, task.taskType === "schedule" ? task.dueTime : null);
          if (eventId) {
            await storage.updatePurchaseOrderTask(task.id, { calendarEventId: eventId });
            synced++;
          } else { failed++; }
        } catch { failed++; }
      }

      const finTasksList = await storage.getAllPendingFinanceTasks();
      for (const task of finTasksList) {
        if (task.calendarEventId || !task.dueDate) continue;
        try {
          const finPrefix = task.taskType === "todo" ? "[할일]" : "[일정]";
          const title = `${finPrefix} ${task.content}`;
          const eventId = await createTaskEvent(title, task.dueDate, task.taskType === "schedule" ? task.dueTime : null);
          if (eventId) {
            await storage.updateFinanceTask(task.id, { calendarEventId: eventId });
            synced++;
          } else { failed++; }
        } catch { failed++; }
      }

      const totalUnsyncedInquiry = inquiryTasksList.filter(t => !t.calendarEventId && t.dueDate).length;
      const totalUnsyncedProject = projectTasksList.filter(t => !t.calendarEventId && t.dueDate).length;
      const totalUnsyncedPO = poTasksList.filter(t => !t.calendarEventId && t.dueDate).length;
      const totalUnsyncedFin = finTasksList.filter(t => !t.calendarEventId && t.dueDate).length;
      res.json({ synced, failed, total: totalUnsyncedInquiry + totalUnsyncedProject + totalUnsyncedPO + totalUnsyncedFin });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/tasks/:id/sync-calendar", async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (!existing.dueDate) return res.status(400).json({ message: "기한이 설정되지 않았습니다" });

      if (existing.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch {}
      }

      const inquiry = await storage.getInquiry(existing.inquiryId);
      const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
      const title = `${prefix} ${inquiry?.inquiryNumber || ""}_${inquiry?.customerName || ""}: ${existing.content}`;
      let eventId: string | null = null;
      {
        const { createTaskEvent } = await import("./google-calendar");
        eventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
      }
      await storage.updateTask(existing.id, { calendarEventId: eventId });
      const updated = await storage.getTask(existing.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/project-tasks/:id/sync-calendar", async (req, res) => {
    try {
      const existing = await storage.getProjectTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (!existing.dueDate) return res.status(400).json({ message: "기한이 설정되지 않았습니다" });

      if (existing.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch {}
      }

      const project = await storage.getProject(existing.projectId);
      const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
      const title = `${prefix} P:${project?.projectNumber || ""}_${project?.customerName || ""}: ${existing.content}`;
      let eventId: string | null = null;
      {
        const { createTaskEvent } = await import("./google-calendar");
        eventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
      }
      await storage.updateProjectTask(existing.id, { calendarEventId: eventId });
      const updated = await storage.getProjectTask(existing.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Purchase Order Tasks
  app.get("/api/purchase-order-tasks/pending", async (req, res) => {
    try {
      const tasks = await storage.getAllPendingPurchaseOrderTasks();
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-order-tasks", async (req, res) => {
    try {
      const { content, dueDate, dueTime, purchaseOrderId, taskType, staffId } = req.body;
      const resolvedTaskType = taskType === "todo" ? "todo" : "schedule";
      if (!content) return res.status(400).json({ message: "내용은 필수입니다" });
      const normalizedDueDate = dueDate || null;
      const normalizedDueTime = dueTime || null;
      const prefix = resolvedTaskType === "todo" ? "[할일]" : "[일정]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const title = `${prefix} ${content}`;
          {
            const { createTaskEvent } = await import("./google-calendar");
            calendarEventId = await createTaskEvent(title, normalizedDueDate, resolvedTaskType === "schedule" ? normalizedDueTime : null);
          }
        } catch (calErr: any) {
          console.log(`Google 등록 실패 (구매발주 할일 생성은 계속): ${calErr.message}`);
        }
      }

      const task = await storage.createPurchaseOrderTask({
        purchaseOrderId: purchaseOrderId || null,
        content,
        completed: false,
        dueDate: normalizedDueDate,
        dueTime: normalizedDueTime,
        calendarEventId,
        taskType: resolvedTaskType,
        staffId: staffId || null,
        createdAt: new Date().toISOString(),
      });
      (async () => {
        const po = purchaseOrderId ? await storage.getPurchaseOrder(purchaseOrderId) : null;
        const info = po ? `${po.orderNumber || ""}_${po.vendor || ""}` : undefined;
        import("./telegram").then(t => t.notifyTask("추가", task, "구매발주", info)).catch(() => {});
      })().catch(() => {});
      res.status(201).json(task);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-order-tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getPurchaseOrderTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });

      const allowed: any = {};
      if ("content" in req.body) allowed.content = req.body.content;
      if ("completed" in req.body) {
        allowed.completed = req.body.completed;
        if (req.body.completed && existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            allowed.calendarEventId = null;
          } catch (calErr: any) {
            console.log(`Google 완료 처리 실패: ${calErr.message}`);
          }
        }
      }
      if ("dueDate" in req.body || "dueTime" in req.body) {
        const newDueDate = "dueDate" in req.body ? (req.body.dueDate || null) : existing.dueDate;
        const newDueTime = "dueTime" in req.body ? (req.body.dueTime || null) : existing.dueTime;
        allowed.dueDate = newDueDate;
        allowed.dueTime = newDueTime;

        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch {}
          allowed.calendarEventId = null;
        }
        const isCompleted = "completed" in req.body ? req.body.completed : existing.completed;
        if (newDueDate && !isCompleted) {
          try {
            const poPrefix = existing.taskType === "todo" ? "[할일]" : "[일정]";
            const title = `${poPrefix} ${req.body.content || existing.content}`;
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, newDueDate, existing.taskType === "schedule" ? newDueTime : null);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google 재등록 실패: ${calErr.message}`);
          }
        }
      }

      if (allowed.content && !("dueDate" in req.body) && !("dueTime" in req.body) && !("completed" in req.body) && existing.calendarEventId) {
        try {
          const poPrefix = existing.taskType === "todo" ? "[할일]" : "[일정]";
          const title = `${poPrefix} ${allowed.content}`;
          if (existing.dueDate) {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
            allowed.calendarEventId = newEventId;
          }
        } catch (calErr: any) {
          console.log(`Google 제목 업데이트 실패: ${calErr.message}`);
        }
      }

      const updated = await storage.updatePurchaseOrderTask(req.params.id, allowed);
      if (allowed.completed === true && !existing.completed) {
        (async () => {
          const po = existing.purchaseOrderId ? await storage.getPurchaseOrder(existing.purchaseOrderId) : null;
          const info = po ? `${po.orderNumber || ""}_${po.vendor || ""}` : undefined;
          import("./telegram").then(t => t.notifyTask("완료", updated, "구매발주", info)).catch(() => {});
        })().catch(() => {});
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/purchase-order-tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getPurchaseOrderTask(req.params.id);
      if (existing?.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch (calErr: any) {
          console.log(`Google 삭제 실패: ${calErr.message}`);
        }
      }
      await storage.deletePurchaseOrderTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Finance Tasks
  app.get("/api/finance-tasks/pending", async (req, res) => {
    try {
      const tasks = await storage.getAllPendingFinanceTasks();
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance-tasks", async (req, res) => {
    try {
      const { content, dueDate, dueTime, category, taskType, staffId } = req.body;
      const resolvedTaskType = taskType === "todo" ? "todo" : "schedule";
      if (!content) return res.status(400).json({ message: "내용은 필수입니다" });
      const normalizedDueDate = dueDate || null;
      const normalizedDueTime = dueTime || null;
      const prefix = resolvedTaskType === "todo" ? "[할일]" : "[일정]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const title = `${prefix} ${content}`;
          {
            const { createTaskEvent } = await import("./google-calendar");
            calendarEventId = await createTaskEvent(title, normalizedDueDate, resolvedTaskType === "schedule" ? normalizedDueTime : null);
          }
        } catch (calErr: any) {
          console.log(`Google 등록 실패 (경영지원 할일 생성은 계속): ${calErr.message}`);
        }
      }

      const task = await storage.createFinanceTask({
        category: category || null,
        content,
        completed: false,
        dueDate: normalizedDueDate,
        dueTime: normalizedDueTime,
        calendarEventId,
        taskType: resolvedTaskType,
        staffId: staffId || null,
        createdAt: new Date().toISOString(),
      });
      import("./telegram").then(t => t.notifyTask("추가", task, "경영지원")).catch(() => {});
      res.status(201).json(task);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/finance-tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getFinanceTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });

      const allowed: any = {};
      if ("content" in req.body) allowed.content = req.body.content;
      if ("category" in req.body) allowed.category = req.body.category;
      if ("completed" in req.body) {
        allowed.completed = req.body.completed;
        if (req.body.completed && existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            allowed.calendarEventId = null;
          } catch (calErr: any) {
            console.log(`Google 완료 처리 실패: ${calErr.message}`);
          }
        }
      }
      if ("dueDate" in req.body || "dueTime" in req.body) {
        const newDueDate = "dueDate" in req.body ? (req.body.dueDate || null) : existing.dueDate;
        const newDueTime = "dueTime" in req.body ? (req.body.dueTime || null) : existing.dueTime;
        allowed.dueDate = newDueDate;
        allowed.dueTime = newDueTime;

        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch {}
          allowed.calendarEventId = null;
        }
        const isCompleted = "completed" in req.body ? req.body.completed : existing.completed;
        if (newDueDate && !isCompleted) {
          try {
            const finPrefix = existing.taskType === "todo" ? "[할일]" : "[일정]";
            const title = `${finPrefix} ${req.body.content || existing.content}`;
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, newDueDate, existing.taskType === "schedule" ? newDueTime : null);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google 재등록 실패: ${calErr.message}`);
          }
        }
      }

      if (allowed.content && !("dueDate" in req.body) && !("dueTime" in req.body) && !("completed" in req.body) && existing.calendarEventId) {
        try {
          const finPrefix = existing.taskType === "todo" ? "[할일]" : "[일정]";
          const title = `${finPrefix} ${allowed.content}`;
          if (existing.dueDate) {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
            const { createTaskEvent } = await import("./google-calendar");
            const newEventId = await createTaskEvent(title, existing.dueDate, existing.taskType === "schedule" ? existing.dueTime : null);
            allowed.calendarEventId = newEventId;
          }
        } catch (calErr: any) {
          console.log(`Google 제목 업데이트 실패: ${calErr.message}`);
        }
      }

      const updated = await storage.updateFinanceTask(req.params.id, allowed);
      if (allowed.completed === true && !existing.completed) {
        import("./telegram").then(t => t.notifyTask("완료", updated, "경영지원")).catch(() => {});
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/finance-tasks/:id", async (req, res) => {
    try {
      const existing = await storage.getFinanceTask(req.params.id);
      if (existing?.calendarEventId) {
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId);
        } catch (calErr: any) {
          console.log(`Google 삭제 실패: ${calErr.message}`);
        }
      }
      await storage.deleteFinanceTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Quotation routes
  app.get("/api/inquiries/:id/quotations", async (req, res) => {
    try {
      const list = await storage.getQuotationsByInquiry(req.params.id);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/quotations", async (req, res) => {
    try {
      const { quoteNumber, quoteDate, validUntil, notes } = req.body;
      const now = new Date().toISOString();
      const q = await storage.createQuotation({
        inquiryId: req.params.id,
        quoteNumber: quoteNumber || "",
        quoteDate: quoteDate || now.split("T")[0],
        validUntil: validUntil || null,
        notes: notes || null,
        status: "draft",
        createdAt: now,
      });
      res.status(201).json(q);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/quotations/:id", async (req, res) => {
    try {
      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/quotations/:id", async (req, res) => {
    try {
      const existing = await storage.getQuotationWithItems(req.params.id);
      if (!existing) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const isLocked = existing.quotation.status === "sent" || existing.quotation.status === "accepted";
      if (isLocked) {
        const allowedKeys = ["status", "quoteName"];
        const bodyKeys = Object.keys(req.body);
        const hasOnlyAllowed = bodyKeys.every(k => allowedKeys.includes(k));
        if (!hasOnlyAllowed) {
          return res.status(403).json({ message: "발송/수주 상태의 견적서는 상태 변경만 가능합니다" });
        }
        if (req.body.status !== undefined) {
          const newStatus = req.body.status;
          const validTransition = newStatus === "sent" || newStatus === "accepted";
          if (!validTransition) {
            return res.status(403).json({ message: "발송/수주 상태의 견적서는 상태 변경만 가능합니다" });
          }
        }
      }
      const q = await storage.updateQuotation(req.params.id, req.body);
      res.json(q);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/quotations/:id", async (req, res) => {
    try {
      const existing = await storage.getQuotationWithItems(req.params.id);
      if (!existing) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      if (existing.quotation.status === "sent" || existing.quotation.status === "accepted") {
        return res.status(403).json({ message: "발송/수주 상태의 견적서는 삭제할 수 없습니다" });
      }
      await storage.deleteQuotation(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/quotations/:id/copy", async (req, res) => {
    try {
      const source = await storage.getQuotationWithItems(req.params.id);
      if (!source) return res.status(404).json({ message: "원본 견적서를 찾을 수 없습니다" });
      const siblings = await storage.getQuotationsByInquiry(source.quotation.inquiryId);
      const baseNum = source.quotation.quoteNumber.replace(/-r\d+$/, "");
      let maxRev = 0;
      for (const q of siblings) {
        const m = q.quoteNumber.match(/-r(\d+)$/);
        if (m) maxRev = Math.max(maxRev, parseInt(m[1], 10));
      }
      const newQuoteNumber = `${baseNum}-r${maxRev + 1}`;
      const newQ = await storage.copyQuotation(req.params.id, newQuoteNumber);
      res.status(201).json(newQ);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  async function syncQuotationTotalsToInquiry(quotationId: string) {
    const result = await storage.getQuotationWithItems(quotationId);
    if (!result) return null;
    const regularItems = result.items.filter(i => !i.isAdjustment);
    const adjustmentItems = result.items.filter(i => i.isAdjustment);
    const regularSales = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
    const adjustmentSales = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
    const totalSales = regularSales + adjustmentSales;
    const totalCost = regularItems.reduce((s, i) => s + ((i.costPrice || 0) * (i.quantity || 1)), 0);
    const totalMargin = totalSales - totalCost;
    await storage.updateInquiry(result.quotation.inquiryId, {
      lastQuoteSales: totalSales,
      lastQuoteCost: totalCost,
      lastQuoteMargin: totalMargin,
    });
    return { totalSales, totalCost, totalMargin };
  }

  app.post("/api/quotations/:id/sync-to-inquiry", async (req, res) => {
    try {
      const totals = await syncQuotationTotalsToInquiry(req.params.id);
      if (!totals) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      res.json({ message: "인콰이어리에 반영되었습니다", ...totals });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/quotations/:id/items", async (req, res) => {
    try {
      const parentQ = await storage.getQuotationWithItems(req.params.id);
      if (!parentQ) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      if (parentQ.quotation.status === "sent" || parentQ.quotation.status === "accepted") {
        return res.status(403).json({ message: "발송/수주 상태의 견적서에는 품목을 추가할 수 없습니다" });
      }
      const { itemCode, itemName, spec, quantity, unitPrice, costPrice, category1, category2, sortOrder, isAdjustment } = req.body;
      const qty = quantity || 1;
      const price = unitPrice || 0;
      let finalCostPrice = costPrice ?? 0;
      let finalCategory1 = category1 || null;
      let finalCategory2 = category2 || null;
      if (itemCode && (finalCostPrice === 0 || !finalCategory1 || !finalCategory2)) {
        const masterItem = await storage.getItemByCode(itemCode);
        if (masterItem) {
          if (finalCostPrice === 0) finalCostPrice = masterItem.cost || 0;
          if (!finalCategory1) finalCategory1 = masterItem.category1 || null;
          if (!finalCategory2) finalCategory2 = masterItem.category2 || null;
        }
      }
      const item = await storage.createQuotationItem({
        quotationId: req.params.id,
        itemCode: itemCode || null,
        itemName: itemName || "",
        spec: spec || null,
        quantity: qty,
        costPrice: finalCostPrice,
        unitPrice: price,
        amount: qty * price,
        category1: finalCategory1,
        category2: finalCategory2,
        sortOrder: sortOrder || 0,
        isAdjustment: isAdjustment || false,
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  async function checkQuotationItemLock(itemId: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT q.status FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id WHERE qi.id = $1`,
      [itemId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].status;
  }

  app.patch("/api/quotation-items/:id", async (req, res) => {
    try {
      const parentStatus = await checkQuotationItemLock(req.params.id);
      if (parentStatus === null) return res.status(404).json({ message: "항목을 찾을 수 없습니다" });
      if (parentStatus === "sent" || parentStatus === "accepted") {
        return res.status(403).json({ message: "발송/수주 상태의 견적서 품목은 수정할 수 없습니다" });
      }
      const data = { ...req.body };
      if (data.quantity != null || data.unitPrice != null) {
        const qty = data.quantity ?? 0;
        const price = data.unitPrice ?? 0;
        data.amount = qty * price;
      }
      const item = await storage.updateQuotationItem(req.params.id, data);
      if (!item) return res.status(404).json({ message: "항목을 찾을 수 없습니다" });
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/quotation-items/:id", async (req, res) => {
    try {
      const parentStatus = await checkQuotationItemLock(req.params.id);
      if (parentStatus === null) return res.status(404).json({ message: "항목을 찾을 수 없습니다" });
      if (parentStatus === "sent" || parentStatus === "accepted") {
        return res.status(403).json({ message: "발송/수주 상태의 견적서 품목은 삭제할 수 없습니다" });
      }
      await storage.deleteQuotationItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/quotations/:id/export", async (req, res) => {
    try {
      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const inquiry = await storage.getInquiry(result.quotation.inquiryId);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      if (!inquiry.onedriveFolderId) return res.status(400).json({ message: "OneDrive 폴더가 연결되지 않은 인콰이어리입니다" });
      const { exportQuotationToOneDrive } = await import("./quotation-export");
      const resp = await exportQuotationToOneDrive(req.params.id, result.quotation.inquiryId);
      res.json(resp);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/quotations/:id/send-email", async (req, res) => {
    try {
      const { to, subject, body, cc } = req.body;
      if (!to) return res.status(400).json({ message: "수신자 이메일이 필요합니다" });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) return res.status(400).json({ message: "올바른 이메일 형식이 아닙니다" });
      if (to.length > 254 || (subject && subject.length > 500)) return res.status(400).json({ message: "입력값이 너무 깁니다" });

      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const inquiry = await storage.getInquiry(result.quotation.inquiryId);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });

      const companyInfo = await storage.getCompanySettings();

      const { generateQuotationPDF } = await import("./quotation-export");
      const pdfBuf = await generateQuotationPDF(req.params.id, inquiry);

      const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
      const safeName = result.quotation.quoteName
        ? `_${result.quotation.quoteName.replace(/[/\\:*?"<>|]/g, "_")}`
        : "";
      const pdfFilename = `견적서_${safeNumber}${safeName}.pdf`;

      if (inquiry.onedriveFolderId) {
        try {
          const { uploadFileToFolder } = await import("./onedrive");
          await uploadFileToFolder(inquiry.onedriveFolderId, pdfFilename, pdfBuf);
        } catch (e: any) {
          console.log(`OneDrive 저장 실패 (이메일은 계속 진행): ${e.message}`);
        }
      }

      const companyName = companyInfo?.companyName || "에이아이엠";
      const buildSubject = (template: string | null | undefined, quoteNumber: string, quoteName: string | null | undefined, customerName: string) => {
        const tpl = template || "에이아이엠_{견적번호}, {견적이름}";
        return tpl
          .replace(/\{견적번호\}/g, quoteNumber)
          .replace(/\{견적이름\}/g, quoteName || "")
          .replace(/\{고객명\}/g, customerName)
          .replace(/,\s*$/, "").trim();
      };
      const emailSubject = subject || buildSubject(companyInfo?.emailSubjectTemplate, result.quotation.quoteNumber, result.quotation.quoteName, inquiry.snapshotCompanyName || inquiry.customerName || "");
      const emailBody = body
        ? `<div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</div>`
        : `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">
          <p>안녕하세요, ${inquiry.snapshotCompanyName || '고객'}님.</p>
          <p>${companyName}입니다.</p>
          <br/>
          <p>요청하신 견적서를 첨부드립니다.</p>
          <p><strong>견적번호:</strong> ${result.quotation.quoteNumber}</p>
          <br/>
          <p>검토 후 궁금하신 사항이 있으시면 언제든 연락 주시기 바랍니다.</p>
          <br/>
          <p>감사합니다.</p>
          <p>${companyName}</p>
          ${companyInfo?.phone ? `<p>Tel: ${companyInfo.phone}</p>` : ''}
          ${companyInfo?.email ? `<p>Email: ${companyInfo.email}</p>` : ''}
        </div>
      `;

      const ccList: string[] = [];
      if (cc) ccList.push(...cc.split(',').map((e: string) => e.trim()).filter(Boolean));
      if (companyInfo?.autoCc) {
        const autoCcEmails = companyInfo.autoCc.split(',').map((e: string) => e.trim()).filter(Boolean);
        for (const email of autoCcEmails) {
          if (!ccList.includes(email)) ccList.push(email);
        }
      }

      const { sendEmailWithAttachment } = await import("./gmail");
      const emailResult = await sendEmailWithAttachment({
        to,
        subject: emailSubject,
        htmlBody: emailBody,
        attachment: { filename: pdfFilename, content: pdfBuf },
        from: companyInfo?.email || undefined,
        cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      });

      if (!inquiry.snapshotEmail && to) {
        await storage.updateInquiry(inquiry.id, { snapshotEmail: to });
      }

      await storage.updateQuotation(req.params.id, { status: "sent" });

      await syncQuotationTotalsToInquiry(req.params.id);

      try {
        const { createQuoteSentEvent } = await import("./google-calendar");
        const eventDate = result.quotation.quoteDate || new Date().toISOString().split('T')[0];
        await createQuoteSentEvent(inquiry.inquiryNumber, inquiry.customerName, eventDate);
      } catch (calErr: any) {
        console.log(`Google Calendar 등록 실패 (이메일 발송은 완료): ${calErr.message}`);
      }

      res.json({ message: `${to}로 견적서가 전송되었습니다`, messageId: emailResult.messageId });
    } catch (err: any) {
      console.error("이메일 전송 오류:", err);
      res.status(500).json({ message: err.message || "이메일 전송 실패" });
    }
  });

  app.post("/api/inquiries/:id/send-batch-email", async (req, res) => {
    try {
      const { quotationIds, to, subject, body, cc } = req.body;
      if (!to) return res.status(400).json({ message: "수신자 이메일이 필요합니다" });
      if (!quotationIds || !Array.isArray(quotationIds) || quotationIds.length < 1) {
        return res.status(400).json({ message: "최소 1개 이상의 견적서를 선택하세요" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) return res.status(400).json({ message: "올바른 이메일 형식이 아닙니다" });

      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });

      const companyInfo = await storage.getCompanySettings();
      const { generateQuotationPDF } = await import("./quotation-export");

      const attachments: { filename: string; content: Buffer; mimeType?: string }[] = [];
      const processedQuotations: string[] = [];

      for (const qid of quotationIds) {
        const result = await storage.getQuotationWithItems(qid);
        if (!result) continue;
        if (result.quotation.inquiryId !== req.params.id) {
          return res.status(403).json({ message: `견적서 ${qid}는 해당 인콰이어리에 속하지 않습니다` });
        }
        const pdfBuf = await generateQuotationPDF(qid, inquiry);
        const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
        const safeName = result.quotation.quoteName
          ? `_${result.quotation.quoteName.replace(/[/\\:*?"<>|]/g, "_")}`
          : "";
        const filename = `견적서_${safeNumber}${safeName}.pdf`;
        attachments.push({ filename, content: pdfBuf });
        processedQuotations.push(qid);

        if (inquiry.onedriveFolderId) {
          try {
            const { uploadFileToFolder } = await import("./onedrive");
            await uploadFileToFolder(inquiry.onedriveFolderId, filename, pdfBuf);
          } catch (e: any) {
            console.log(`OneDrive 저장 실패: ${e.message}`);
          }
        }
      }

      if (attachments.length === 0) {
        return res.status(400).json({ message: "PDF 생성에 실패했습니다" });
      }

      const companyName = companyInfo?.companyName || "에이아이엠";
      const buildBatchSubject = (template: string | null | undefined, inquiryNumber: string, customerName: string) => {
        const tpl = template || "에이아이엠_{견적번호}, {견적이름}";
        return tpl
          .replace(/\{견적번호\}/g, inquiryNumber)
          .replace(/\{견적이름\}/g, "")
          .replace(/\{고객명\}/g, customerName)
          .replace(/,\s*$/, "").trim();
      };
      const emailSubject = subject || buildBatchSubject(companyInfo?.emailSubjectTemplate, inquiry.inquiryNumber, inquiry.snapshotCompanyName || inquiry.customerName || "");
      const emailBody = body
        ? `<div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</div>`
        : `<div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">
          <p>안녕하세요, ${inquiry.snapshotCompanyName || '고객'}님.</p>
          <p>${companyName}입니다.</p>
          <br/>
          <p>요청하신 견적서 ${attachments.length}건을 첨부드립니다.</p>
          <br/>
          <p>검토 후 궁금하신 사항이 있으시면 언제든 연락 주시기 바랍니다.</p>
          <br/>
          <p>감사합니다.</p>
          <p>${companyName}</p>
          ${companyInfo?.phone ? `<p>Tel: ${companyInfo.phone}</p>` : ''}
          ${companyInfo?.email ? `<p>Email: ${companyInfo.email}</p>` : ''}
        </div>`;

      const ccList: string[] = [];
      if (cc) ccList.push(...cc.split(',').map((e: string) => e.trim()).filter(Boolean));
      if (companyInfo?.autoCc) {
        const autoCcEmails = companyInfo.autoCc.split(',').map((e: string) => e.trim()).filter(Boolean);
        for (const email of autoCcEmails) {
          if (!ccList.includes(email)) ccList.push(email);
        }
      }

      const { sendEmailWithAttachment } = await import("./gmail");
      const emailResult = await sendEmailWithAttachment({
        to,
        subject: emailSubject,
        htmlBody: emailBody,
        attachments,
        from: companyInfo?.email || undefined,
        cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      });

      if (!inquiry.snapshotEmail && to) {
        await storage.updateInquiry(inquiry.id, { snapshotEmail: to });
      }

      for (const qid of processedQuotations) {
        await storage.updateQuotation(qid, { status: "sent" });
        await syncQuotationTotalsToInquiry(qid);
      }

      try {
        const { createQuoteSentEvent } = await import("./google-calendar");
        const eventDate = new Date().toISOString().split('T')[0];
        await createQuoteSentEvent(inquiry.inquiryNumber, inquiry.customerName, eventDate);
      } catch (calErr: any) {
        console.log(`Google Calendar 등록 실패: ${calErr.message}`);
      }

      res.json({
        message: `${to}로 견적서 ${attachments.length}건이 전송되었습니다`,
        messageId: emailResult.messageId,
      });
    } catch (err: any) {
      console.error("묶음 이메일 전송 오류:", err);
      res.status(500).json({ message: err.message || "이메일 전송 실패" });
    }
  });

  app.get("/api/quotations/:id/download/pdf", async (req, res) => {
    try {
      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const inquiry = await storage.getInquiry(result.quotation.inquiryId);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      const { generateQuotationPDF } = await import("./quotation-export");
      const buf = await generateQuotationPDF(req.params.id, inquiry);
      const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
      const safeNamePart = result.quotation.quoteName
        ? `_${result.quotation.quoteName.replace(/[/\\:*?"<>|]/g, "_")}`
        : "";
      const pdfDisplayName = `견적서_${safeNumber}${safeNamePart}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      const disposition = req.query.inline === "1" ? "inline" : "attachment";
      res.setHeader("Content-Disposition", `${disposition}; filename="quotation_${safeNumber}${safeNamePart}.pdf"; filename*=UTF-8''${encodeURIComponent(pdfDisplayName)}`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/quotations/:id/download/xlsx", async (req, res) => {
    try {
      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const inquiry = await storage.getInquiry(result.quotation.inquiryId);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      const { generateQuotationExcel } = await import("./quotation-export");
      const buf = await generateQuotationExcel(req.params.id, inquiry);
      const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="quotation_${safeNumber}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Company routes (담당자/연락처)
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/by-customer/:customerId", async (req, res) => {
    try {
      const { customerId } = req.params;
      if (!customerId || customerId.length < 1) {
        return res.status(400).json({ message: "유효하지 않은 고객사 ID입니다" });
      }
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      }
      const contacts = await storage.getCompaniesByCustomerId(customerId);
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "회사를 찾을 수 없습니다" });
      res.json(company);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      res.status(201).json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const data = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(req.params.id, data);
      if (!company) return res.status(404).json({ message: "회사를 찾을 수 없습니다" });

      const relatedInquiries = await storage.getInquiriesByCompanyId(req.params.id);
      for (const inq of relatedInquiries) {
        const snapshotUpdate: Record<string, any> = {};
        if (data.companyName !== undefined) snapshotUpdate.snapshotCompanyName = data.companyName;
        if (data.address !== undefined) snapshotUpdate.snapshotAddress = data.address || null;
        if (data.contactName !== undefined) snapshotUpdate.snapshotContactName = data.contactName || null;
        if (data.email !== undefined) snapshotUpdate.snapshotEmail = data.email || null;
        if (data.phone !== undefined) snapshotUpdate.snapshotPhone = data.phone || null;
        if (Object.keys(snapshotUpdate).length > 0) {
          await storage.updateInquiry(inq.id, snapshotUpdate);
        }
      }

      res.json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      await storage.deleteCompany(req.params.id);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiries/:id/product-images", async (req, res) => {
    try {
      const images = await storage.getProductImages(req.params.id);
      res.json(images);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/product-images", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });

      const count = await storage.countProductImages(req.params.id);
      if (count >= 5) {
        return res.status(400).json({ message: "이미지는 최대 5개까지 등록할 수 있습니다" });
      }

      const { imageData } = z.object({
        imageData: z.string().min(1),
      }).parse(req.body);

      const image = await storage.createProductImage({
        inquiryId: req.params.id,
        imageData,
        sortOrder: count,
      });

      res.status(201).json(image);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/inquiries/:id/product-images/:imageId", async (req, res) => {
    try {
      const images = await storage.getProductImages(req.params.id);
      const found = images.find(i => i.id === req.params.imageId);
      if (!found) {
        return res.status(404).json({ message: "이미지를 찾을 수 없습니다" });
      }
      await storage.deleteProductImage(req.params.imageId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Excel scan: extract customer info from Excel files in an inquiry's OneDrive folder
  app.post("/api/inquiries/:id/scan-excel", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry || !inquiry.onedriveFolderId) {
        return res.status(404).json({ message: "인콰이어리를 찾을 수 없거나 OneDrive 폴더가 없습니다" });
      }

      const customerInfoList = await parseExcelCustomerInfo(inquiry.onedriveFolderId);

      const firstQuoteDate = customerInfoList
        .map(info => info.quoteDate)
        .find(d => d && d.trim().length > 0);
      if (firstQuoteDate) {
        const normalized = firstQuoteDate.replace(/[.\-\/]/g, '-');
        const parsed = new Date(normalized);
        if (!isNaN(parsed.getTime())) {
          await storage.updateInquiry(req.params.id, { createdAt: parsed });
        }
      }

      const existingMatches: Record<string, any[]> = {};
      for (const info of customerInfoList) {
        const keywords = info.companyName.replace(/[()（）]/g, ' ').split(/\s+/).filter(k => k.length >= 2);
        const matchSet = new Map<string, any>();
        for (const keyword of keywords) {
          const matches = await storage.searchCompanies(keyword);
          for (const m of matches) {
            matchSet.set(m.id, m);
          }
        }
        const exact = await storage.getCompanyByName(info.companyName);
        if (exact) matchSet.set(exact.id, exact);
        if (matchSet.size > 0) {
          existingMatches[info.companyName] = Array.from(matchSet.values());
        }
      }

      res.json({ scanned: customerInfoList, existingMatches });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const saveCustomerInfoSchema = z.object({
    companyName: z.string().min(1, "회사명은 필수입니다"),
    address: z.string().nullable().optional(),
    contactName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    selectedCustomerId: z.string().nullable().optional(),
    forceCreate: z.boolean().optional(),
  });

  app.post("/api/inquiries/:id/save-customer-info", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) {
        return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      }

      const { companyName, address, contactName, email, phone, selectedCustomerId, forceCreate } = saveCustomerInfoSchema.parse(req.body);

      let customer;

      if (selectedCustomerId) {
        customer = await storage.getCustomer(selectedCustomerId);
        if (!customer) {
          return res.status(404).json({ message: "선택한 고객사를 찾을 수 없습니다" });
        }
        if (address && !customer.address) {
          customer = await storage.updateCustomer(customer.id, { address }) || customer;
        }
      } else if (inquiry.customerId) {
        customer = await storage.getCustomer(inquiry.customerId);
        if (customer && address && !customer.address) {
          customer = await storage.updateCustomer(customer.id, { address }) || customer;
        }
        if (!customer) {
          customer = await storage.createCustomer({ companyName, address: address || null });
        }
      } else {
        customer = await storage.getCustomerByName(companyName);
        if (!customer && !forceCreate) {
          const candidates = await storage.searchCustomers(companyName);
          const fuzzyMatches = candidates.filter(c => {
            const a = c.companyName.trim().toLowerCase();
            const b = companyName.trim().toLowerCase();
            return a.includes(b) || b.includes(a);
          });
          if (fuzzyMatches.length === 1) {
            customer = fuzzyMatches[0];
          } else if (fuzzyMatches.length > 1) {
            return res.json({ needsSelection: true, candidates: fuzzyMatches, companyName });
          }
        }
        if (!customer) {
          customer = await storage.createCustomer({
            companyName,
            address: address || null,
          });
        }
      }

      let company = await storage.getCompanyByName(companyName);
      if (company) {
        company = await storage.updateCompany(company.id, {
          customerId: customer.id,
          isTemporary: false,
          address: address || company.address,
          contactName: contactName || company.contactName,
          email: email || company.email,
          phone: phone || company.phone,
        }) || company;
      } else {
        company = await storage.createCompany({
          customerId: customer.id,
          companyName,
          address: address || null,
          contactName: contactName || null,
          email: email || null,
          phone: phone || null,
          isTemporary: false,
        });
      }

      const snapshotUpdate = {
        customerId: customer.id,
        companyId: company.id,
        snapshotCompanyName: company.companyName,
        snapshotAddress: company.address || null,
        snapshotContactName: company.contactName || null,
        snapshotEmail: company.email || null,
        snapshotPhone: company.phone || null,
      };

      await storage.updateInquiry(inquiry.id, snapshotUpdate);

      let linkedSiblings = 0;
      if (inquiry.customerName) {
        const siblingInquiries = await storage.getUnlinkedInquiriesByCustomerName(inquiry.customerName);
        for (const inq of siblingInquiries) {
          if (inq.id !== inquiry.id) {
            // 고객사(customerId)만 연결, 담당자(contact)는 각 영업건이 독립적으로 유지
            await storage.updateInquiry(inq.id, {
              customerId: customer.id,
              snapshotCompanyName: company.companyName,
              snapshotAddress: company.address || null,
              customerName: company.companyName,
            });
            linkedSiblings++;
          }
        }
      }

      if (inquiry.onedriveFolderId) {
        try {
          const existingInfo = await readInfoJson(inquiry.onedriveFolderId) || {};
          await writeInfoJson(inquiry.onedriveFolderId, {
            ...existingInfo,
            companyName: company.companyName,
            address: company.address,
            contactName: company.contactName,
            email: company.email,
            phone: company.phone,
          });
        } catch (err: any) {
          console.warn("_info.json 업데이트 실패:", err.message);
        }
      }

      res.json({ customer, company, inquiryId: inquiry.id, linkedSiblings });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/link-company", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) {
        return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      }

      const { companyId } = z.object({ companyId: z.string() }).parse(req.body);
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "회사를 찾을 수 없습니다" });
      }

      const updateData: Record<string, any> = {
        companyId: company.id,
        snapshotCompanyName: company.companyName,
        snapshotAddress: company.address || null,
        snapshotContactName: company.contactName || null,
        snapshotEmail: company.email || null,
        snapshotPhone: company.phone || null,
      };

      if (company.customerId) {
        updateData.customerId = company.customerId;
      }

      await storage.updateInquiry(inquiry.id, updateData);

      if (inquiry.onedriveFolderId) {
        try {
          const existingInfo = await readInfoJson(inquiry.onedriveFolderId) || {};
          await writeInfoJson(inquiry.onedriveFolderId, {
            ...existingInfo,
            companyName: company.companyName,
            address: company.address,
            contactName: company.contactName,
            email: company.email,
            phone: company.phone,
          });
        } catch (err: any) {
          console.warn("_info.json 업데이트 실패:", err.message);
        }
      }

      res.json({ company, inquiryId: inquiry.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors", async (_req, res) => {
    try {
      const list = await storage.getVendors();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors-with-stats", async (_req, res) => {
    try {
      const list = await storage.getVendors();
      const lastTxDates = await storage.getVendorLastTransactionDates();
      const allInvoices = await storage.getPurchaseInvoices();
      const allOrders = await storage.getPurchaseOrders();
      const allPayments = await storage.getPayments();
      const recurringExpenses = await storage.getRecurringExpenses();
      // vendor_id 직접 연결된 것 우선, 없으면 이름 매칭 fallback
      const recurringVendorIds = new Set(recurringExpenses.filter(e => e.isActive !== "false" && (e as any).vendorId).map(e => (e as any).vendorId).filter(Boolean));
      const recurringVendorNames = new Set(recurringExpenses.filter(e => e.isActive !== "false").map(e => e.companyName?.trim().toLowerCase()).filter(Boolean));

      const invoiceCountMap = new Map<string, number>();
      const invoiceVendorMap = new Map<string, string>(); // invoiceId -> vendorId
      for (const inv of allInvoices) {
        if (inv.vendorId) {
          invoiceCountMap.set(inv.vendorId, (invoiceCountMap.get(inv.vendorId) || 0) + 1);
          invoiceVendorMap.set(inv.id, inv.vendorId);
        }
      }
      const orderCountMap = new Map<string, number>();
      for (const ord of allOrders) {
        if (ord.vendorId) orderCountMap.set(ord.vendorId, (orderCountMap.get(ord.vendorId) || 0) + 1);
      }

      // 업체명 → vendorId 맵 (floating payment 매칭용)
      const vendorNameToIdEarly = new Map(list.map(v => [v.companyName?.trim().toLowerCase(), v.id]));

      // 공급업체별 결제예정(미래) / 지연(overdue) / 계획없음 집계
      const today = new Date().toISOString().split("T")[0];
      const plannedAmountMap = new Map<string, number>(); // 미래 예정
      const overdueAmountMap = new Map<string, number>(); // 지연(과거 미지급)
      for (const p of allPayments) {
        if (p.status !== "planned") continue;
        // invoice 연결된 경우 → vendorId via invoiceVendorMap
        // invoice 없는 floating payment → vendorId via company name
        let vendorId = p.purchaseInvoiceId ? invoiceVendorMap.get(p.purchaseInvoiceId) : undefined;
        if (!vendorId && p.companyName) {
          vendorId = vendorNameToIdEarly.get(p.companyName.trim().toLowerCase());
        }
        if (!vendorId) continue;
        const amount = p.amount || 0;
        if (amount === 0) continue; // 취소건 제외
        if (p.plannedDate && p.plannedDate < today) {
          overdueAmountMap.set(vendorId, (overdueAmountMap.get(vendorId) || 0) + amount);
        } else {
          plannedAmountMap.set(vendorId, (plannedAmountMap.get(vendorId) || 0) + amount);
        }
      }

      // 계획없음: payment 레코드가 없고, 완료 처리도 안 된 계산서 건수
      const invoicesWithPayment = new Set<string>();
      for (const p of allPayments) {
        if (p.purchaseInvoiceId) invoicesWithPayment.add(p.purchaseInvoiceId);
      }
      // 업체명 기준으로 completed payment가 있는 vendorId 집합
      const vendorsWithCompletedPayment = new Set<string>();
      const vendorNameToId = new Map(list.map(v => [v.companyName?.trim().toLowerCase(), v.id]));
      for (const p of allPayments) {
        if (p.status === "completed" && p.companyName && !p.purchaseInvoiceId) {
          const vid = vendorNameToId.get(p.companyName.trim().toLowerCase());
          if (vid) vendorsWithCompletedPayment.add(vid);
        }
      }
      const noPaymentCountMap = new Map<string, number>();
      for (const inv of allInvoices) {
        if (!inv.vendorId) continue;
        // 직접 연결된 payment가 있으면 제외
        if (invoicesWithPayment.has(inv.id)) continue;
        // 해당 계산서가 completed 상태면 제외
        if (inv.status === "completed" || inv.status === "paid") continue;
        noPaymentCountMap.set(inv.vendorId, (noPaymentCountMap.get(inv.vendorId) || 0) + 1);
      }

      const result = list.map(v => ({
        ...v,
        lastTransactionDate: lastTxDates.get(v.id) || null,
        invoiceCount: invoiceCountMap.get(v.id) || 0,
        orderCount: orderCountMap.get(v.id) || 0,
        isRecurring: recurringVendorIds.has(v.id) || recurringVendorNames.has(v.companyName?.trim().toLowerCase() || ""),
        plannedAmount: plannedAmountMap.get(v.id) || 0,
        overdueAmount: overdueAmountMap.get(v.id) || 0,
        noPaymentCount: noPaymentCountMap.get(v.id) || 0,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      if (q.length < 1) return res.json([]);
      const results = await storage.searchVendors(q);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors/:id", async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: "공급업체를 찾을 수 없습니다" });
      res.json(vendor);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors", async (req, res) => {
    try {
      const data = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(data);
      res.status(201).json(vendor);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/vendors/:id", async (req, res) => {
    try {
      const data = insertVendorSchema.partial().parse(req.body);
      const vendor = await storage.updateVendor(req.params.id, data);
      if (!vendor) return res.status(404).json({ message: "공급업체를 찾을 수 없습니다" });
      res.json(vendor);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/vendors/:id/favorite", async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: "공급업체를 찾을 수 없습니다" });
      const updated = await storage.updateVendor(req.params.id, { isFavorite: !vendor.isFavorite });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/vendors/:id", async (req, res) => {
    try {
      await storage.deleteVendor(req.params.id);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 업체별 거래원장
  app.get("/api/vendors/:id/ledger", async (req, res) => {
    try {
      const { id } = req.params;
      const year = req.query.year ? parseInt(req.query.year as string) : null;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const vendor = await storage.getVendor(id);
      if (!vendor) return res.status(404).json({ message: "업체를 찾을 수 없습니다" });

      // 이름 포함 비교 (공백·주식회사 등 차이 흡수)
      const normalize = (s: string | null | undefined) =>
        (s || "").replace(/\s|\(주\)|주식회사|유한회사|\(유\)/g, "").toLowerCase();
      const vendorNorm = normalize(vendor.companyName);

      // 발주서 (vendorId 일치 OR 업체명 유사 일치)
      const allOrders = await storage.getPurchaseOrders();
      const orders = allOrders.filter(o => {
        if (!(o.vendorId === id || normalize(o.vendor) === vendorNorm)) return false;
        if (startDate || endDate) {
          const d = o.expectedDeliveryDate || o.actualDeliveryDate || o.orderDate || "";
          if (startDate && d && d < startDate) return false;
          if (endDate && d && d > endDate) return false;
          return true;
        }
        if (!year) return true;
        const deliveryYear = (o.expectedDeliveryDate || o.actualDeliveryDate || "").substring(0, 4);
        return o.year === year || deliveryYear === String(year);
      });

      // 매입계산서 (vendorId 일치 OR 업체명 유사 일치)
      const allInvoices = await storage.getPurchaseInvoices();
      const invoices = allInvoices.filter(inv => {
        if (!(inv.vendorId === id || normalize(inv.companyName) === vendorNorm)) return false;
        if (startDate || endDate) {
          const d = inv.issueDate || inv.writeDate || "";
          if (startDate && d && d < startDate) return false;
          if (endDate && d && d > endDate) return false;
          return true;
        }
        return inv.year === year || !year;
      });

      // 자금계획
      const allPayments = await storage.getPayments();
      const invoiceIds = new Set(invoices.map(i => i.id));
      const payments = allPayments.filter(p =>
        p.type === "expense" && p.companyName === vendor.companyName ||
        (p.purchaseInvoiceId && invoiceIds.has(p.purchaseInvoiceId))
      );

      // N:M 연결 링크
      const { purchaseOrderInvoiceLinks } = await import("@shared/schema");
      const { db } = await import("./db");
      const { inArray } = await import("drizzle-orm");
      const orderIds = orders.map(o => o.id);
      const links = orderIds.length > 0
        ? await db.select().from(purchaseOrderInvoiceLinks).where(inArray(purchaseOrderInvoiceLinks.purchaseOrderId, orderIds))
        : [];

      // 발주서에 연결된 계산서 정보 합치기
      const invoiceMap = new Map(invoices.map(i => [i.id, i]));
      const paymentMap = new Map<string, typeof payments[0][]>();
      for (const p of payments) {
        if (p.purchaseInvoiceId) {
          const arr = paymentMap.get(p.purchaseInvoiceId) || [];
          arr.push(p);
          paymentMap.set(p.purchaseInvoiceId, arr);
        }
      }

      const ordersWithLinks = orders.map(o => {
        // 기존 1:1 링크
        const linkedInvoiceIds = new Set<string>();
        if (o.purchaseInvoiceId) linkedInvoiceIds.add(o.purchaseInvoiceId);
        // N:M 링크
        links.filter(l => l.purchaseOrderId === o.id).forEach(l => linkedInvoiceIds.add(l.purchaseInvoiceId));

        const linkedInvoices = [...linkedInvoiceIds].map(invId => {
          const inv = invoiceMap.get(invId);
          if (!inv) return null;
          return { ...inv, payments: paymentMap.get(invId) || [] };
        }).filter(Boolean);

        return { ...o, linkedInvoices };
      });

      // 계산서 중 발주서와 연결 안 된 것
      const linkedInvIds = new Set([
        ...orders.filter(o => o.purchaseInvoiceId).map(o => o.purchaseInvoiceId!),
        ...links.map(l => l.purchaseInvoiceId),
      ]);
      const unlinkedInvoices = invoices.filter(inv => !linkedInvIds.has(inv.id)).map(inv => ({
        ...inv, payments: paymentMap.get(inv.id) || [],
      }));

      // 월별 요약
      const orderTotal = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const invoiceTotal = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
      const paidTotal = payments.filter(p => p.status === "completed").reduce((s, p) => s + (p.actualAmount || p.amount || 0), 0);
      const plannedTotal = payments.filter(p => p.status === "planned").reduce((s, p) => s + (p.amount || 0), 0);

      res.json({
        vendor,
        orders: ordersWithLinks,
        unlinkedInvoices,
        summary: { orderTotal, invoiceTotal, paidTotal, plannedTotal, diff: invoiceTotal - paidTotal },
        links,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 발주서 ↔ 계산서 N:M 연결
  app.post("/api/purchase-orders/:orderId/link-invoice/:invoiceId", async (req, res) => {
    try {
      const { orderId, invoiceId } = req.params;
      const { purchaseOrderInvoiceLinks } = await import("@shared/schema");
      const { db } = await import("./db");
      const { and, eq } = await import("drizzle-orm");
      const { sql: drizzleSql } = await import("drizzle-orm");

      const existing = await db.select().from(purchaseOrderInvoiceLinks)
        .where(and(
          eq(purchaseOrderInvoiceLinks.purchaseOrderId, orderId),
          eq(purchaseOrderInvoiceLinks.purchaseInvoiceId, invoiceId)
        ));
      if (existing.length > 0) return res.json({ message: "이미 연결되어 있습니다" });

      const [link] = await db.insert(purchaseOrderInvoiceLinks).values({
        purchaseOrderId: orderId,
        purchaseInvoiceId: invoiceId,
        note: req.body?.note || null,
      }).returning();
      res.status(201).json(link);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 연결 해제
  app.delete("/api/purchase-orders/:orderId/link-invoice/:invoiceId", async (req, res) => {
    try {
      const { orderId, invoiceId } = req.params;
      const { purchaseOrderInvoiceLinks } = await import("@shared/schema");
      const { db } = await import("./db");
      const { and, eq } = await import("drizzle-orm");
      await db.delete(purchaseOrderInvoiceLinks).where(and(
        eq(purchaseOrderInvoiceLinks.purchaseOrderId, orderId),
        eq(purchaseOrderInvoiceLinks.purchaseInvoiceId, invoiceId)
      ));
      res.json({ message: "연결 해제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 업체 미연결 발주서/계산서 조회
  app.get("/api/unlinked-vendor-records", async (req, res) => {
    try {
      const allOrders = await storage.getPurchaseOrders();
      const allInvoices = await storage.getPurchaseInvoices();
      const unlinkedOrders = allOrders.filter(o => !o.vendorId && o.vendor);
      const unlinkedInvoices = allInvoices.filter(i => !i.vendorId && i.companyName);
      res.json({ orders: unlinkedOrders, invoices: unlinkedInvoices });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 고객사 미수금 현황 목록 (공급업체 목록 대칭) — 고객사별 미수금/지연/결제예정/계획없음 집계
  app.get("/api/customers-receivables-summary", async (_req, res) => {
    try {
      const customers = await storage.getCustomers();
      const invoices = await storage.getSalesInvoices();
      const allPayments = await storage.getPayments();
      const today = new Date().toISOString().split("T")[0];

      const normalize = (s: string | null | undefined) =>
        (s || "").replace(/\s|\(주\)|주식회사|유한회사|\(유\)/g, "").toLowerCase();
      const nameToId = new Map<string, string>();
      for (const c of customers) nameToId.set(normalize(c.companyName), c.id);
      const customerOf = (inv: any): string | null =>
        inv.customerId || nameToId.get(normalize(inv.companyName)) || null;

      // 은행매칭 입금
      const txResult = await pool.query(
        `SELECT matched_sales_invoice_id, SUM(credit_amount) as collected
         FROM bank_transactions WHERE matched_sales_invoice_id IS NOT NULL
         GROUP BY matched_sales_invoice_id`
      );
      const bankCollected = new Map<string, number>();
      for (const row of txResult.rows) bankCollected.set(row.matched_sales_invoice_id, Number(row.collected || 0));

      // 완료 수금레코드 + payment 보유 계산서
      const pmtCollected = new Map<string, number>();
      const invoiceWithPayment = new Set<string>();
      for (const p of allPayments) {
        if (p.type !== "income" || !p.salesInvoiceId) continue;
        invoiceWithPayment.add(p.salesInvoiceId);
        if (p.status === "completed") {
          pmtCollected.set(p.salesInvoiceId, (pmtCollected.get(p.salesInvoiceId) || 0) + (p.actualAmount || p.amount || 0));
        }
      }

      const invCustomer = new Map<string, string | null>();
      for (const inv of invoices) invCustomer.set(inv.id, customerOf(inv));

      type Agg = { outstanding: number; invoiceCount: number; overdueAmount: number; plannedAmount: number; noPaymentCount: number; lastTransactionDate: string | null };
      const agg = new Map<string, Agg>();
      const ensure = (cid: string): Agg => {
        if (!agg.has(cid)) agg.set(cid, { outstanding: 0, invoiceCount: 0, overdueAmount: 0, plannedAmount: 0, noPaymentCount: 0, lastTransactionDate: null });
        return agg.get(cid)!;
      };

      for (const inv of invoices as any[]) {
        const cid = customerOf(inv);
        if (!cid) continue;
        const e = ensure(cid);
        const billed = inv.totalAmount || 0;
        const txC = bankCollected.get(inv.id) ?? 0;
        const pmtC = pmtCollected.get(inv.id) ?? 0;
        const collected = invoiceCollected(billed, txC, pmtC, inv.status === "paid");
        e.outstanding += billed - collected;
        e.invoiceCount++;
        const d = inv.issueDate || inv.writeDate;
        if (d && (!e.lastTransactionDate || d > e.lastTransactionDate)) e.lastTransactionDate = d;
        if (!invoiceWithPayment.has(inv.id) && inv.status !== "paid" && inv.status !== "completed") e.noPaymentCount++;
      }

      // 결제예정/지연: 미완료(planned) income 결제계획
      for (const p of allPayments) {
        if (p.type !== "income" || p.status !== "planned") continue;
        let cid = p.salesInvoiceId ? invCustomer.get(p.salesInvoiceId) : null;
        if (!cid && p.companyName) cid = nameToId.get(normalize(p.companyName)) ?? null;
        if (!cid) continue;
        const amount = p.amount || 0;
        if (amount === 0) continue;
        const e = ensure(cid);
        if (p.plannedDate && p.plannedDate < today) e.overdueAmount += amount;
        else e.plannedAmount += amount;
      }

      const result = customers
        .filter(c => agg.has(c.id))
        .map(c => ({ customerId: c.id, companyName: c.companyName, isFavorite: c.isFavorite ?? false, ...agg.get(c.id)! }))
        .sort((a, b) => b.outstanding - a.outstanding);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 고객사 거래원장: 고객사별 프로젝트/매출계산서/수금/미수금
  app.get("/api/customers/:id/ledger", async (req, res) => {
    try {
      const { id } = req.params;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });

      const inPeriod = (d: string | null | undefined) => {
        if (!startDate && !endDate) return true;
        const v = d || "";
        if (startDate && v && v < startDate) return false;
        if (endDate && v && v > endDate) return false;
        return true;
      };

      // 거래처원장은 customer_id 기준으로만 모음 (이름 유사매칭 제거 — 오연결/오염 방지).
      // 모든 매출계산서가 customer_id를 보유하므로 이름매칭 없이도 누락 없음.
      const allProjects = await storage.getProjects();
      const projects = allProjects.filter(p => p.customerId === id);
      const projectIds = new Set(projects.map(p => p.id));

      // 매출계산서 (customerId 일치) + 기간 필터
      const allInvoices = await storage.getSalesInvoices();
      const invoices = allInvoices.filter(inv =>
        inv.customerId === id && inPeriod(inv.issueDate || inv.writeDate)
      );
      const invoiceIds = new Set(invoices.map(i => i.id));

      // 수금(income): 이 고객의 계산서 또는 프로젝트에 연결된 것만 (이름매칭 제거)
      const allPayments = await storage.getPayments();
      const payments = allPayments.filter(p =>
        p.type === "income" &&
        ((p.salesInvoiceId && invoiceIds.has(p.salesInvoiceId)) ||
         (p.projectId && projectIds.has(p.projectId)))
      );
      const paymentsByInvoice = new Map<string, typeof payments>();
      for (const p of payments) {
        if (p.salesInvoiceId && invoiceIds.has(p.salesInvoiceId)) {
          const arr = paymentsByInvoice.get(p.salesInvoiceId) || [];
          arr.push(p);
          paymentsByInvoice.set(p.salesInvoiceId, arr);
        }
      }

      // 은행거래 매칭 입금 (수금관리/미수금 화면과 동일 모델로 통일)
      const bankByInvoice = new Map<string, number>();
      if (invoiceIds.size > 0) {
        const txRes = await pool.query(
          `SELECT matched_sales_invoice_id, SUM(credit_amount) as collected
           FROM bank_transactions WHERE matched_sales_invoice_id = ANY($1::varchar[])
           GROUP BY matched_sales_invoice_id`,
          [Array.from(invoiceIds)]
        );
        for (const r of txRes.rows) bankByInvoice.set(r.matched_sales_invoice_id, Number(r.collected || 0));
      }

      // 계산서별 수금 합산 + 상태 (sales-invoices-with-payments와 동일 규칙)
      const invoicesWithPay = invoices.map(inv => {
        const pmts = (paymentsByInvoice.get(inv.id) || [])
          .slice()
          .sort((a, b) => (a.actualDate || a.plannedDate || "").localeCompare(b.actualDate || b.plannedDate || ""));
        const totalAmount = inv.totalAmount || 0;
        const recordPaid = pmts.filter(p => p.status === "completed").reduce((s, p) => s + (p.actualAmount || p.amount || 0), 0);
        const bankPaid = bankByInvoice.get(inv.id) ?? 0;
        const statusPaid = inv.status === "paid";
        const paidAmount = invoiceCollected(totalAmount, bankPaid, recordPaid, statusPaid);
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);
        const paymentCount = pmts.length;
        const completedCount = pmts.filter(p => p.status === "completed").length;
        const pendingPayments = pmts.filter(p => p.status !== "completed");
        const nextPaymentDate = pendingPayments.length > 0 ? pendingPayments[0].plannedDate : null;
        let paymentStatus = "none";
        if (statusPaid || completedCount === paymentCount && paymentCount > 0 || paidAmount >= totalAmount && totalAmount > 0) paymentStatus = "completed";
        else if (paymentCount === 0) paymentStatus = "none";
        else if (completedCount > 0) paymentStatus = "partial";
        else paymentStatus = "planned";
        return { ...inv, payments: pmts, paidAmount, remainingAmount, paymentCount, completedCount, paymentStatus, nextPaymentDate };
      });

      // 프로젝트별 그룹핑 + 미연결 그룹
      const projectMap = new Map(projects.map(p => [p.id, p]));
      const groupMap = new Map<string, { project: any; invoices: typeof invoicesWithPay }>();
      const unlinked: typeof invoicesWithPay = [];
      for (const inv of invoicesWithPay) {
        if (inv.projectId && projectMap.has(inv.projectId)) {
          const g = groupMap.get(inv.projectId) || { project: projectMap.get(inv.projectId), invoices: [] };
          g.invoices.push(inv);
          groupMap.set(inv.projectId, g);
        } else {
          unlinked.push(inv);
        }
      }
      // 계산서 없는 프로젝트도 노출
      for (const p of projects) {
        if (!groupMap.has(p.id)) groupMap.set(p.id, { project: p, invoices: [] });
      }
      const groups: { project: any; invoices: typeof invoicesWithPay }[] = Array.from(groupMap.values());
      if (unlinked.length > 0) groups.push({ project: null, invoices: unlinked });

      const invoiceTotal = invoicesWithPay.reduce((s, i) => s + (i.totalAmount || 0), 0);
      const collectedTotal = invoicesWithPay.reduce((s, i) => s + i.paidAmount, 0);
      const outstanding = invoicesWithPay.reduce((s, i) => s + i.remainingAmount, 0);

      res.json({
        customer,
        summary: { invoiceTotal, collectedTotal, outstanding, projectCount: projects.length, invoiceCount: invoices.length },
        groups,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 발주서에 vendorId 연결
  app.patch("/api/purchase-orders/:id/assign-vendor", async (req, res) => {
    try {
      const { vendorId } = req.body;
      if (!vendorId) return res.status(400).json({ message: "vendorId 필수" });
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) return res.status(404).json({ message: "업체를 찾을 수 없습니다" });
      const updated = await storage.updatePurchaseOrder(req.params.id, {
        vendorId,
        vendor: vendor.companyName,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 계산서에 vendorId 연결
  app.patch("/api/purchase-invoices/:id/assign-vendor", async (req, res) => {
    try {
      const { vendorId } = req.body;
      if (!vendorId) return res.status(400).json({ message: "vendorId 필수" });
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) return res.status(404).json({ message: "업체를 찾을 수 없습니다" });
      const updated = await storage.updatePurchaseInvoice(req.params.id, {
        vendorId,
        companyName: vendor.companyName,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vendors/:vendorId/contacts", async (req, res) => {
    try {
      const contacts = await storage.getVendorContacts(req.params.vendorId);
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors/:vendorId/contacts", async (req, res) => {
    try {
      const { name, email, phone } = req.body;
      if (!name) return res.status(400).json({ message: "이름은 필수입니다" });
      const created = await storage.createVendorContact({
        vendorId: req.params.vendorId,
        name,
        email: email || null,
        phone: phone || null,
      });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/vendor-contacts/:id", async (req, res) => {
    try {
      const allowedFields = ["name", "email", "phone"];
      const patch: Record<string, any> = {};
      for (const key of allowedFields) {
        if (key in req.body) patch[key] = req.body[key];
      }
      const updated = await storage.updateVendorContact(req.params.id, patch);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/vendor-contacts/:id", async (req, res) => {
    try {
      await storage.deleteVendorContact(req.params.id);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors/sync-from-invoices", async (_req, res) => {
    try {
      const allInvoices = await storage.getPurchaseInvoices();
      const existingVendors = await storage.getVendors();

      const vendorByBizNum = new Map<string, { id: string; representative: string | null; address: string | null; contactEmail: string | null }>();
      for (const v of existingVendors) {
        if (v.businessNumber) {
          vendorByBizNum.set(v.businessNumber.replace(/-/g, ""), {
            id: v.id,
            representative: v.representative,
            address: v.address,
            contactEmail: v.contactEmail,
          });
        }
      }

      let vendorsCreated = 0;
      let vendorsUpdated = 0;
      let invoicesLinked = 0;
      let skippedNoBizNum = 0;

      for (const inv of allInvoices) {
        if (!inv.businessNumber) { skippedNoBizNum++; continue; }
        const bizNumClean = inv.businessNumber.replace(/-/g, "");
        if (!bizNumClean) continue;

        let vendorEntry = vendorByBizNum.get(bizNumClean);

        if (!vendorEntry && inv.companyName) {
          const newVendor = await storage.createVendor({
            companyName: inv.companyName,
            businessNumber: inv.businessNumber,
            representative: inv.representative || null,
            address: inv.address || null,
            contactEmail: inv.email1 || null,
          });
          vendorEntry = {
            id: newVendor.id,
            representative: newVendor.representative,
            address: newVendor.address,
            contactEmail: newVendor.contactEmail,
          };
          vendorByBizNum.set(bizNumClean, vendorEntry);
          vendorsCreated++;
        } else if (vendorEntry) {
          const updates: Record<string, string> = {};
          if (!vendorEntry.representative && inv.representative) updates.representative = inv.representative;
          if (!vendorEntry.address && inv.address) updates.address = inv.address;
          if (!vendorEntry.contactEmail && inv.email1) updates.contactEmail = inv.email1;
          if (Object.keys(updates).length > 0) {
            await storage.updateVendor(vendorEntry.id, updates);
            Object.assign(vendorEntry, updates);
            vendorsUpdated++;
          }
        }

        if (!inv.vendorId && vendorEntry) {
          await storage.updatePurchaseInvoice(inv.id, { vendorId: vendorEntry.id });
          invoicesLinked++;
        }
      }

      const uniqueBizNums = new Set(allInvoices.filter(i => i.businessNumber).map(i => i.businessNumber!.replace(/-/g, "")));
      res.json({ vendorsCreated, vendorsUpdated, invoicesLinked, totalInvoices: allInvoices.length, uniqueBusinessNumbers: uniqueBizNums.size, skippedNoBizNum });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sales-invoices", async (_req, res) => {
    try {
      const list = await storage.getSalesInvoices();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sales-invoices-with-payments", async (_req, res) => {
    try {
      const list = await storage.getSalesInvoices();
      const allPayments = await storage.getPayments();
      const paymentsByInvoice = new Map<string, any[]>();
      allPayments.forEach(p => {
        if (p.salesInvoiceId) {
          if (!paymentsByInvoice.has(p.salesInvoiceId)) paymentsByInvoice.set(p.salesInvoiceId, []);
          paymentsByInvoice.get(p.salesInvoiceId)!.push(p);
        }
      });

      const result = list.map(inv => {
        const pmts = paymentsByInvoice.get(inv.id) || [];
        const totalAmount = inv.totalAmount || 0;
        const paidAmount = pmts.filter(p => p.status === "completed").reduce((s: number, p: any) => s + (p.actualAmount || p.amount || 0), 0);
        const plannedAmount = pmts.filter(p => p.status !== "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);
        const paymentCount = pmts.length;
        const completedCount = pmts.filter(p => p.status === "completed").length;
        const pendingPayments = pmts.filter(p => p.status !== "completed").sort((a: any, b: any) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
        const nextPaymentDate = pendingPayments.length > 0 ? pendingPayments[0].plannedDate : null;

        let paymentStatus = "none";
        if (paymentCount === 0) paymentStatus = "none";
        else if (completedCount === paymentCount || paidAmount >= totalAmount) paymentStatus = "completed";
        else if (completedCount > 0) paymentStatus = "partial";
        else paymentStatus = "planned";

        return {
          ...inv,
          paymentStatus,
          paidAmount,
          plannedAmount,
          remainingAmount,
          paymentCount,
          completedCount,
          nextPaymentDate,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sales-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getSalesInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "매출계산서를 찾을 수 없습니다" });
      res.json(invoice);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 같은 프로젝트에 실발행 계산서가 있으면 placeholder 자동 삭제
  app.post("/api/sales-invoices/cleanup-placeholders", async (_req, res) => {
    try {
      const allInvoices = await storage.getSalesInvoices();
      const allPayments = await storage.getPayments();

      // 프로젝트별로 묶어, 같은 건의 중복(예정/사업자번호없는 발행 vs 실발행)을 정리
      const byProject = new Map<string, typeof allInvoices>();
      for (const inv of allInvoices) {
        if (!inv.projectId) continue;
        if (!byProject.has(inv.projectId)) byProject.set(inv.projectId, []);
        byProject.get(inv.projectId)!.push(inv);
      }

      // "실발행도(real)" 점수: 사업자번호(+2) + 발행일(+1) → 점수 높은 쪽을 정본으로 유지
      const rank = (i: any) => (i.businessNumber ? 2 : 0) + (i.issueDate ? 1 : 0);
      const isMatch = (a: any, b: any) =>
        (a.invoiceStage && b.invoiceStage === a.invoiceStage) ||
        ((a.supplyAmount || 0) > 0 && Math.abs((b.supplyAmount || 0) - (a.supplyAmount || 0)) <= (a.supplyAmount || 0) * 0.1);

      const toDelete: string[] = [];

      for (const invs of Array.from(byProject.values())) {
        for (const cand of invs as any[]) {
          if (toDelete.includes(cand.id)) continue;
          // cand보다 "더 정본"이면서 같은 건으로 매칭되는 대상 찾기
          const target = (invs as any[]).find((t: any) =>
            t.id !== cand.id && !toDelete.includes(t.id) && rank(t) > rank(cand) && isMatch(cand, t));
          if (!target) continue;

          // 중복(cand)의 입금/은행매칭을 정본(target)으로 이전 후 삭제
          for (const p of allPayments.filter(p => p.salesInvoiceId === cand.id)) {
            await storage.updatePayment(p.id, { salesInvoiceId: target.id });
            (p as any).salesInvoiceId = target.id;
          }
          await pool.query(
            `UPDATE bank_transactions SET matched_sales_invoice_id = $1 WHERE matched_sales_invoice_id = $2`,
            [target.id, cand.id]
          );
          toDelete.push(cand.id);
        }
      }

      for (const id of toDelete) {
        await storage.deleteSalesInvoice(id);
      }

      res.json({ deleted: toDelete.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 취소쌍 정리: 같은 거래처에서 수금근거 없는 +A 원본과 -A 취소(수정세금계산서)를 짝지어 상계 처리(둘 다 paid로 닫음)
  app.post("/api/sales-invoices/reconcile-cancellations", async (_req, res) => {
    try {
      const invoices = await storage.getSalesInvoices();
      // 수금근거(완료 수금레코드 / 은행매칭) 보유 계산서 → 실거래라 정리 대상 제외
      const collected = new Set<string>();
      const payments = await storage.getPayments();
      for (const p of payments) {
        if (p.type === "income" && p.status === "completed" && p.salesInvoiceId) collected.add(p.salesInvoiceId);
      }
      const txRows = await pool.query(`SELECT DISTINCT matched_sales_invoice_id FROM bank_transactions WHERE matched_sales_invoice_id IS NOT NULL`);
      for (const r of txRows.rows) collected.add(r.matched_sales_invoice_id);

      const normalize = (s: string | null | undefined) =>
        (s || "").replace(/\s|\(주\)|주식회사|유한회사|\(유\)/g, "").toLowerCase();
      const keyOf = (i: any) => i.customerId || ("name:" + normalize(i.companyName));
      const byCust = new Map<string, any[]>();
      for (const i of invoices) {
        const k = keyOf(i);
        if (!byCust.has(k)) byCust.set(k, []);
        byCust.get(k)!.push(i);
      }

      const dayDiff = (a: any, b: any) =>
        Math.abs(Date.parse(a.issueDate || a.writeDate || "") - Date.parse(b.issueDate || b.writeDate || ""));

      const closed: { companyName: string | null; amount: number }[] = [];
      for (const list of Array.from(byCust.values())) {
        const negs = list.filter(i => (i.totalAmount || 0) < 0 && i.status !== "paid");
        const usedPos = new Set<string>();
        for (const n of negs) {
          const A = -(n.totalAmount || 0);
          const cand = list
            .filter(p => p.totalAmount === A && p.status !== "paid" && !usedPos.has(p.id) && !collected.has(p.id))
            .sort((a, b) => dayDiff(a, n) - dayDiff(b, n))[0];
          if (!cand) continue;
          usedPos.add(cand.id);
          await storage.updateSalesInvoice(cand.id, { status: "paid", memo: `취소정리: 취소건(${n.issueDate || "-"})과 상계` });
          await storage.updateSalesInvoice(n.id, { status: "paid", memo: `취소정리: 원본(${cand.issueDate || "-"})과 상계` });
          closed.push({ companyName: list[0].companyName, amount: A });
        }
      }
      res.json({ closedPairs: closed.length, pairs: closed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sales-invoices/rematch", async (_req, res) => {
    try {
      const allInvoices = await storage.getSalesInvoices();
      const allCustomers = await storage.getCustomers();
      const allProjects = await storage.getProjects();

      const customerByBizNum = new Map<string, string>();
      const customerByName = new Map<string, string>();
      for (const c of allCustomers) {
        if (c.businessNumber) customerByBizNum.set(c.businessNumber.replace(/-/g, ""), c.id);
        if (c.companyName) customerByName.set(c.companyName.trim().toLowerCase(), c.id);
      }

      const projectsByCustomerId = new Map<string, string[]>();
      for (const p of allProjects) {
        if (p.customerId) {
          if (!projectsByCustomerId.has(p.customerId)) projectsByCustomerId.set(p.customerId, []);
          projectsByCustomerId.get(p.customerId)!.push(p.id);
        }
      }

      let matched = 0;
      let projectLinked = 0;

      for (const inv of allInvoices) {
        if (inv.customerId) continue; // 이미 연결됨

        const bizClean = inv.businessNumber ? inv.businessNumber.replace(/-/g, "") : "";
        const nameLower = (inv.companyName || "").trim().toLowerCase();

        let customerId = bizClean ? (customerByBizNum.get(bizClean) || null) : null;
        if (!customerId && nameLower) customerId = customerByName.get(nameLower) || null;
        // Fuzzy/partial name match: "오토런" ↔ "주식회사 오토런 시스템"
        if (!customerId && nameLower && nameLower.length >= 2) {
          for (const [custName, custId] of customerByName.entries()) {
            if (custName.includes(nameLower) || nameLower.includes(custName)) {
              customerId = custId;
              break;
            }
          }
        }
        if (!customerId) continue;

        const updates: Record<string, any> = { customerId };

        if (!inv.projectId) {
          const projects = projectsByCustomerId.get(customerId) || [];
          if (projects.length === 1) {
            updates.projectId = projects[0];
            projectLinked++;
          }
        }

        await storage.updateSalesInvoice(inv.id, updates);
        matched++;
      }

      res.json({ matched, projectLinked });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sales-invoices", async (req, res) => {
    try {
      const data = insertSalesInvoiceSchema.parse(req.body);
      const invoice = await storage.createSalesInvoice(data);
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/sales-invoices/:id", async (req, res) => {
    try {
      const body = req.body;
      const linkKeys = Object.keys(body).every(k => ["projectId", "invoiceStage"].includes(k));
      if (linkKeys && "projectId" in body) {
        const invoice = await storage.updateSalesInvoice(req.params.id, { projectId: body.projectId, invoiceStage: body.invoiceStage ?? null });
        if (!invoice) return res.status(404).json({ message: "매출계산서를 찾을 수 없습니다" });

        if (body.projectId && body.invoiceStage) {
          const allInvoices = await storage.getSalesInvoices();
          const placeholders = allInvoices.filter(i =>
            i.projectId === body.projectId &&
            i.invoiceStage === body.invoiceStage &&
            i.id !== invoice.id &&
            !i.issueDate
          );
          for (const ph of placeholders) {
            await storage.deleteSalesInvoice(ph.id);
          }
        }

        return res.json(invoice);
      }
      const data = insertSalesInvoiceSchema.partial().parse(body);
      const invoice = await storage.updateSalesInvoice(req.params.id, data);
      if (!invoice) return res.status(404).json({ message: "매출계산서를 찾을 수 없습니다" });
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/sales-invoices/:id", async (req, res) => {
    try {
      const invoiceId = req.params.id;

      // 연결된 수금계획 삭제
      const allPayments = await storage.getPayments();
      const linkedPayments = allPayments.filter(p => p.salesInvoiceId === invoiceId);
      for (const p of linkedPayments) {
        await storage.deletePayment(p.id);
      }

      // 은행내역 매칭 해제 (matchedSalesInvoiceId → null)
      await pool.query(
        `UPDATE bank_transactions SET matched_sales_invoice_id = NULL, match_status = 'unmatched'
         WHERE matched_sales_invoice_id = $1`,
        [invoiceId]
      );

      await storage.deleteSalesInvoice(invoiceId);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-invoices", async (_req, res) => {
    try {
      const list = await storage.getPurchaseInvoices();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-invoices-with-payments", async (_req, res) => {
    try {
      const list = await storage.getPurchaseInvoices();
      const allPayments = await storage.getPayments();
      const vendors = await storage.getVendors();
      const vendorTermsById = new Map<string, string | null>(vendors.map((v: any) => [v.id, v.defaultPaymentTerms ?? null]));
      const today = new Date().toISOString().split("T")[0];
      const paymentsByInvoice = new Map<string, any[]>();
      allPayments.forEach(p => {
        if (p.purchaseInvoiceId) {
          if (!paymentsByInvoice.has(p.purchaseInvoiceId)) paymentsByInvoice.set(p.purchaseInvoiceId, []);
          paymentsByInvoice.get(p.purchaseInvoiceId)!.push(p);
        }
      });

      const result = list.map(inv => {
        const pmts = paymentsByInvoice.get(inv.id) || [];
        const totalAmount = inv.totalAmount || 0;
        const paidAmount = pmts.filter(p => p.status === "completed").reduce((s: number, p: any) => s + (p.actualAmount || p.amount || 0), 0);
        const plannedAmount = pmts.filter(p => p.status !== "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);
        const paymentCount = pmts.length;
        const completedCount = pmts.filter(p => p.status === "completed").length;
        const pendingPayments = pmts.filter(p => p.status !== "completed").sort((a: any, b: any) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
        const nextPaymentDate = pendingPayments.length > 0 ? pendingPayments[0].plannedDate : null;

        let paymentStatus = "none";
        if (paymentCount === 0) paymentStatus = "none";
        else if (completedCount === paymentCount || paidAmount >= totalAmount) paymentStatus = "completed";
        else if (completedCount > 0) paymentStatus = "partial";
        else paymentStatus = "planned";

        // 지연 판정: 발행일(또는 작성일) + 업체 결제조건으로 지급기한을 산정하고,
        // 기한이 지났는데 잔액이 남아 있으면 지연(부분지급 잔액 포함). 잔액 일정 날짜와는 무관.
        const dueDate = calcDueDateFromTerms(vendorTermsById.get(inv.vendorId || "") ?? null, inv.writeDate || inv.issueDate);
        const isOverdue = remainingAmount > 0 && !!dueDate && dueDate < today;
        const overdueAmount = isOverdue ? remainingAmount : 0;

        return {
          ...inv,
          paymentStatus,
          paidAmount,
          plannedAmount,
          remainingAmount,
          paymentCount,
          completedCount,
          nextPaymentDate,
          dueDate,
          isOverdue,
          overdueAmount,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "매입계산서를 찾을 수 없습니다" });
      res.json(invoice);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-invoices", async (req, res) => {
    try {
      const data = insertPurchaseInvoiceSchema.parse(req.body);
      const invoice = await storage.createPurchaseInvoice(data);
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const body = req.body;
      if (Object.keys(body).length === 1 && "projectId" in body) {
        const invoice = await storage.updatePurchaseInvoice(req.params.id, { projectId: body.projectId });
        if (!invoice) return res.status(404).json({ message: "매입계산서를 찾을 수 없습니다" });
        return res.json(invoice);
      }
      const data = insertPurchaseInvoiceSchema.partial().parse(body);
      const invoice = await storage.updatePurchaseInvoice(req.params.id, data);
      if (!invoice) return res.status(404).json({ message: "매입계산서를 찾을 수 없습니다" });
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoiceId = req.params.id;

      const allOrders = await storage.getPurchaseOrders();
      const linkedOrders = allOrders.filter(o => o.purchaseInvoiceId === invoiceId);
      const orderPaymentIds = new Set(linkedOrders.map(o => o.paymentId).filter(Boolean));

      for (const order of linkedOrders) {
        await storage.updatePurchaseOrder(order.id, { purchaseInvoiceId: null });
      }

      const allPayments = await storage.getPayments();
      const invoicePayments = allPayments.filter(p => p.purchaseInvoiceId === invoiceId);
      for (const payment of invoicePayments) {
        if (orderPaymentIds.has(payment.id)) {
          await storage.updatePayment(payment.id, { purchaseInvoiceId: null });
        } else {
          await storage.deletePayment(payment.id);
        }
      }

      // N:M 링크 테이블 정리 (FK CASCADE 없으므로 직접 삭제)
      {
        const { purchaseOrderInvoiceLinks } = await import("@shared/schema");
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");
        await db.delete(purchaseOrderInvoiceLinks).where(eq(purchaseOrderInvoiceLinks.purchaseInvoiceId, invoiceId));
      }
      await storage.deletePurchaseInvoice(invoiceId);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoice-years", async (_req, res) => {
    try {
      const years = await getAvailableInvoiceYears();
      res.json(years);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sales-invoices/import-onedrive", async (req, res) => {
    try {
      const { year } = req.body;
      if (!year) return res.status(400).json({ message: "연도를 지정해주세요" });

      const rows = await parseSalesTaxInvoices(year);
      const existing = await storage.getSalesInvoicesByYear(year);
      const allInvoices = await storage.getSalesInvoices();

      const exactKeyMap = new Map<string, typeof existing[0]>();
      for (const e of existing) {
        if (e.issueDate) {
          const key = `${e.issueDate}|${(e.businessNumber || "").replace(/-/g, "")}|${e.supplyAmount}`;
          exactKeyMap.set(key, e);
        }
      }

      const pendingInvoices = allInvoices.filter(e => !e.issueDate && e.projectId && (!e.year || e.year === year));

      const customers = await storage.getCustomers();
      const customerByBizNum = new Map<string, string>();
      const customerByCompanyName = new Map<string, string>();
      const ambiguousCompanyNames = new Set<string>();
      const customerById = new Map<string, typeof customers[0]>();
      for (const c of customers) {
        if (c.businessNumber) {
          customerByBizNum.set(c.businessNumber.replace(/-/g, ""), c.id);
        }
        if (c.companyName) {
          const nameKey = c.companyName.toLowerCase().trim();
          if (customerByCompanyName.has(nameKey)) {
            ambiguousCompanyNames.add(nameKey);
          } else {
            customerByCompanyName.set(nameKey, c.id);
          }
        }
        customerById.set(c.id, c);
      }

      const allProjects = await storage.getProjects();
      const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "진행");
      const projectsByCustomerId = new Map<string, typeof activeProjects>();
      for (const p of activeProjects) {
        if (p.customerId) {
          const existing = projectsByCustomerId.get(p.customerId) || [];
          existing.push(p);
          projectsByCustomerId.set(p.customerId, existing);
        }
      }

      const matchedIds = new Set<string>();
      const processedKeys = new Set<string>();
      let imported = 0;
      let matched = 0;
      let updated = 0;
      let skipped = 0;
      let autoLinked = 0;

      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }

        const exactKey = `${row.issueDate}|${(row.businessNumber || "").replace(/-/g, "")}|${row.supplyAmount}`;
        if (processedKeys.has(exactKey)) { skipped++; continue; }
        processedKeys.add(exactKey);

        const exactMatch = exactKeyMap.get(exactKey);
        if (exactMatch && !matchedIds.has(exactMatch.id)) {
          matchedIds.add(exactMatch.id);
          await storage.updateSalesInvoice(exactMatch.id, {
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            email2: row.email2 || null,
            writeDate: row.writeDate || null,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          skipped++;
          continue;
        }

        const rowBizClean = row.businessNumber ? row.businessNumber.replace(/-/g, "") : "";
        const rowCompanyLower = (row.companyName || "").toLowerCase().trim();

        const pendingCandidates = pendingInvoices.filter(p => {
          if (matchedIds.has(p.id)) return false;

          const pBizClean = p.businessNumber ? p.businessNumber.replace(/-/g, "") : "";
          const pCompanyLower = (p.companyName || "").toLowerCase().trim();

          let custBizClean = "";
          if (p.customerId) {
            const cust = customerById.get(p.customerId);
            if (cust?.businessNumber) custBizClean = cust.businessNumber.replace(/-/g, "");
          }

          const bizMatch = rowBizClean && (pBizClean === rowBizClean || custBizClean === rowBizClean);
          const nameMatch = rowCompanyLower && pCompanyLower && pCompanyLower === rowCompanyLower;
          if (!bizMatch && !nameMatch) return false;

          const amountDiff = Math.abs((p.supplyAmount || 0) - row.supplyAmount);
          const threshold = Math.abs(row.supplyAmount) * 0.05;
          return amountDiff <= threshold;
        });

        if (pendingCandidates.length === 1) {
          const pending = pendingCandidates[0];
          matchedIds.add(pending.id);
          await storage.updateSalesInvoice(pending.id, {
            issueDate: row.issueDate || null,
            writeDate: row.writeDate || null,
            businessNumber: row.businessNumber || null,
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            email2: row.email2 || null,
            supplyAmount: row.supplyAmount,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          matched++;
          continue;
        }

        if (pendingCandidates.length > 1) {
          const best = pendingCandidates.reduce((a, b) => {
            const diffA = Math.abs((a.supplyAmount || 0) - row.supplyAmount);
            const diffB = Math.abs((b.supplyAmount || 0) - row.supplyAmount);
            return diffB < diffA ? b : a;
          });
          matchedIds.add(best.id);
          await storage.updateSalesInvoice(best.id, {
            issueDate: row.issueDate || null,
            writeDate: row.writeDate || null,
            businessNumber: row.businessNumber || null,
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            email2: row.email2 || null,
            supplyAmount: row.supplyAmount,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          matched++;
          continue;
        }

        let customerId = rowBizClean ? customerByBizNum.get(rowBizClean) || null : null;
        if (!customerId && rowCompanyLower && !ambiguousCompanyNames.has(rowCompanyLower)) {
          customerId = customerByCompanyName.get(rowCompanyLower) || null;
        }

        let autoProjectId: string | null = null;
        if (customerId) {
          const candidateProjects = projectsByCustomerId.get(customerId) || [];
          if (candidateProjects.length === 1) {
            autoProjectId = candidateProjects[0].id;
            autoLinked++;
          }
        }

        await storage.createSalesInvoice({
          customerId,
          projectId: autoProjectId || undefined,
          issueDate: row.issueDate || null,
          writeDate: row.writeDate || null,
          businessNumber: row.businessNumber || null,
          companyName: row.companyName || null,
          representative: row.representative || null,
          address: row.address || null,
          email1: row.email1 || null,
          email2: row.email2 || null,
          year,
          supplyAmount: row.supplyAmount,
          taxAmount: row.taxAmount,
          totalAmount: row.totalAmount,
        });
        imported++;
      }

      res.json({ imported, matched, updated, skipped, autoLinked, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const memUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".xls", ".xlsx"];
      const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("xls 또는 xlsx 파일만 업로드 가능합니다"));
      }
    },
  });

  app.post("/api/sales-invoices/import-upload", (req, res, next) => {
    memUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });

      const rows = parseSalesTaxInvoicesFromBuffer(req.file.buffer);
      const allInvoices = await storage.getSalesInvoices();

      const exactKeyMap = new Map<string, typeof allInvoices[0]>();
      for (const e of allInvoices) {
        if (e.issueDate) {
          const key = `${e.issueDate}|${(e.businessNumber || "").replace(/-/g, "")}|${e.supplyAmount}`;
          exactKeyMap.set(key, e);
        }
      }

      const pendingInvoices = allInvoices.filter(e => !e.issueDate && e.projectId);

      const customers = await storage.getCustomers();
      const customerByBizNum = new Map<string, string>();
      const customerByCompanyName = new Map<string, string>();
      const ambiguousCompanyNames = new Set<string>();
      const customerById = new Map<string, typeof customers[0]>();
      for (const c of customers) {
        if (c.businessNumber) {
          customerByBizNum.set(c.businessNumber.replace(/-/g, ""), c.id);
        }
        if (c.companyName) {
          const nameKey = c.companyName.toLowerCase().trim();
          if (customerByCompanyName.has(nameKey)) {
            ambiguousCompanyNames.add(nameKey);
          } else {
            customerByCompanyName.set(nameKey, c.id);
          }
        }
        customerById.set(c.id, c);
      }

      const allProjects = await storage.getProjects();
      const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "진행");
      const projectsByCustomerId = new Map<string, typeof activeProjects>();
      for (const p of activeProjects) {
        if (p.customerId) {
          const existing = projectsByCustomerId.get(p.customerId) || [];
          existing.push(p);
          projectsByCustomerId.set(p.customerId, existing);
        }
      }

      const matchedIds = new Set<string>();
      const processedKeys = new Set<string>();
      let imported = 0;
      let matched = 0;
      let skipped = 0;
      let autoLinked = 0;

      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }

        const rowBizClean = (row.businessNumber || "").replace(/-/g, "");
        const exactKey = `${row.issueDate}|${rowBizClean}|${row.supplyAmount}`;

        if (processedKeys.has(exactKey)) { skipped++; continue; }
        processedKeys.add(exactKey);

        const exactMatch = exactKeyMap.get(exactKey);
        if (exactMatch && !matchedIds.has(exactMatch.id)) {
          matchedIds.add(exactMatch.id);
          skipped++;
          continue;
        }

        const rowCompanyLower = (row.companyName || "").toLowerCase().trim();

        const pendingCandidates = pendingInvoices.filter(p => {
          if (matchedIds.has(p.id)) return false;
          const pBizClean = (p.businessNumber || "").replace(/-/g, "");
          const pCompanyLower = (p.companyName || "").toLowerCase().trim();

          let custBizClean = "";
          if (p.customerId) {
            const cust = customerById.get(p.customerId);
            if (cust?.businessNumber) custBizClean = cust.businessNumber.replace(/-/g, "");
          }

          const bizMatch = rowBizClean && (pBizClean === rowBizClean || custBizClean === rowBizClean);
          const nameMatch = rowCompanyLower && pCompanyLower && pCompanyLower === rowCompanyLower;
          if (!bizMatch && !nameMatch) return false;

          const amountDiff = Math.abs((p.supplyAmount || 0) - row.supplyAmount);
          const threshold = Math.abs(row.supplyAmount) * 0.05;
          return amountDiff <= threshold;
        });

        if (pendingCandidates.length >= 1) {
          const best = pendingCandidates.length === 1
            ? pendingCandidates[0]
            : pendingCandidates.reduce((a, b) => {
                const diffA = Math.abs((a.supplyAmount || 0) - row.supplyAmount);
                const diffB = Math.abs((b.supplyAmount || 0) - row.supplyAmount);
                return diffB < diffA ? b : a;
              });
          matchedIds.add(best.id);
          await storage.updateSalesInvoice(best.id, {
            issueDate: row.issueDate || null,
            writeDate: row.writeDate || null,
            businessNumber: row.businessNumber || null,
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            email2: row.email2 || null,
            supplyAmount: row.supplyAmount,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          matched++;
          continue;
        }

        let customerId = rowBizClean ? customerByBizNum.get(rowBizClean) || null : null;
        if (!customerId && rowCompanyLower && !ambiguousCompanyNames.has(rowCompanyLower)) {
          customerId = customerByCompanyName.get(rowCompanyLower) || null;
        }
        // 고객사가 없으면 엑셀 데이터로 자동 생성
        if (!customerId && row.companyName) {
          const newCustomer = await storage.createCustomer({
            companyName: row.companyName,
            businessNumber: row.businessNumber || null,
            representative: row.representative || null,
            address: row.address || null,
          });
          customerId = newCustomer.id;
          // 새로 만든 고객사를 맵에도 추가 (같은 업체 중복 생성 방지)
          if (rowBizClean) customerByBizNum.set(rowBizClean, customerId);
          if (rowCompanyLower) customerByCompanyName.set(rowCompanyLower, customerId);
        }
        const year = row.issueDate ? parseInt(row.issueDate.substring(0, 4)) : null;

        let autoProjectId: string | null = null;
        if (customerId) {
          const candidateProjects = projectsByCustomerId.get(customerId) || [];
          if (candidateProjects.length === 1) {
            autoProjectId = candidateProjects[0].id;
            autoLinked++;
          }
        }

        await storage.createSalesInvoice({
          customerId,
          projectId: autoProjectId || undefined,
          issueDate: row.issueDate || null,
          writeDate: row.writeDate || null,
          businessNumber: row.businessNumber || null,
          companyName: row.companyName || null,
          representative: row.representative || null,
          address: row.address || null,
          email1: row.email1 || null,
          email2: row.email2 || null,
          year: year || undefined,
          supplyAmount: row.supplyAmount,
          taxAmount: row.taxAmount,
          totalAmount: row.totalAmount,
        });
        imported++;
      }

      res.json({ imported, matched, skipped, autoLinked, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sales-invoices/excel-url", requireAuth, async (req, res) => {
    try {
      const year = req.query.year as string;
      if (!year) return res.status(400).json({ message: "연도를 지정해주세요" });
      const { listFilesByPath } = await import("./onedrive");
      const basePath = `4.경영지원/database/${year}`;
      const files = await listFilesByPath(basePath);
      const excel = files.find((f: any) => f.name.startsWith("매출전자세금계산서목록") && (f.name.endsWith(".xls") || f.name.endsWith(".xlsx")));
      if (!excel) return res.status(404).json({ message: `${year}년 매출전자세금계산서 파일을 찾을 수 없습니다` });
      res.json({ webUrl: excel.webUrl, fileName: excel.name });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-invoices/import-onedrive", async (req, res) => {
    try {
      const { year } = req.body;
      if (!year) return res.status(400).json({ message: "연도를 지정해주세요" });

      const rows = await parsePurchaseTaxInvoices(year);
      const existing = await storage.getPurchaseInvoicesByYear(year);

      const exactKeyMap = new Map<string, typeof existing[0]>();
      const partialKeyMap = new Map<string, typeof existing[0][]>();
      for (const e of existing) {
        const bizClean = (e.businessNumber || "").replace(/-/g, "");
        const exactKey = `${e.issueDate}|${bizClean}|${e.supplyAmount}`;
        exactKeyMap.set(exactKey, e);

        const partialKey = `${e.issueDate}|${bizClean}`;
        if (!partialKeyMap.has(partialKey)) partialKeyMap.set(partialKey, []);
        partialKeyMap.get(partialKey)!.push(e);
      }

      const matchedIds = new Set<string>();

      const vendors = await storage.getVendors();
      const vendorByBizNum = new Map<string, string>();
      for (const v of vendors) {
        if (v.businessNumber) {
          vendorByBizNum.set(v.businessNumber.replace(/-/g, ""), v.id);
        }
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let vendorsCreated = 0;
      const processedExactKeys = new Set<string>();
      const OWN_BIZ_NUM = "3708700308"; // 주식회사 에이아이엠 자사 사업자번호
      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }
        const rowBizClean = (row.businessNumber || "").replace(/-/g, "");
        // 자사 사업자번호로 발행된 계산서는 매입계산서가 아니므로 건너뜀
        if (rowBizClean === OWN_BIZ_NUM) { skipped++; continue; }
        const exactKey = `${row.issueDate}|${rowBizClean}|${row.supplyAmount}`;

        if (processedExactKeys.has(exactKey)) { skipped++; continue; }
        processedExactKeys.add(exactKey);

        const exactMatch = exactKeyMap.get(exactKey);

        if (exactMatch && !matchedIds.has(exactMatch.id)) {
          matchedIds.add(exactMatch.id);
          const needsUpdate =
            exactMatch.companyName !== (row.companyName || null) ||
            exactMatch.representative !== (row.representative || null) ||
            exactMatch.taxAmount !== row.taxAmount ||
            exactMatch.totalAmount !== row.totalAmount ||
            exactMatch.writeDate !== (row.writeDate || null);

          if (needsUpdate) {
            await storage.updatePurchaseInvoice(exactMatch.id, {
              companyName: row.companyName || null,
              representative: row.representative || null,
              address: row.address || null,
              email1: row.email1 || null,
              writeDate: row.writeDate || null,
              taxAmount: row.taxAmount,
              totalAmount: row.totalAmount,
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        const partialKey = `${row.issueDate}|${rowBizClean}`;
        const candidates = partialKeyMap.get(partialKey) || [];
        const unmatched = candidates.filter(c => !matchedIds.has(c.id));

        if (unmatched.length === 1) {
          const match = unmatched[0];
          matchedIds.add(match.id);
          await storage.updatePurchaseInvoice(match.id, {
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            writeDate: row.writeDate || null,
            supplyAmount: row.supplyAmount,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          updated++;
          continue;
        }

        if (unmatched.length > 1) {
          const closest = unmatched.reduce((best, c) => {
            const diffBest = Math.abs((best.supplyAmount || 0) - row.supplyAmount);
            const diffC = Math.abs((c.supplyAmount || 0) - row.supplyAmount);
            return diffC < diffBest ? c : best;
          });
          matchedIds.add(closest.id);
          await storage.updatePurchaseInvoice(closest.id, {
            companyName: row.companyName || null,
            representative: row.representative || null,
            address: row.address || null,
            email1: row.email1 || null,
            writeDate: row.writeDate || null,
            supplyAmount: row.supplyAmount,
            taxAmount: row.taxAmount,
            totalAmount: row.totalAmount,
          });
          updated++;
          continue;
        }

        const bizNumClean = row.businessNumber ? row.businessNumber.replace(/-/g, "") : "";
        let vendorId = bizNumClean ? vendorByBizNum.get(bizNumClean) || null : null;

        if (!vendorId && bizNumClean && row.companyName) {
          const newVendor = await storage.createVendor({
            companyName: row.companyName,
            businessNumber: row.businessNumber || null,
            representative: row.representative || null,
            address: row.address || null,
            contactEmail: row.email1 || null,
          });
          vendorId = newVendor.id;
          vendorByBizNum.set(bizNumClean, newVendor.id);
          vendorsCreated++;
        }

        await storage.createPurchaseInvoice({
          vendorId,
          issueDate: row.issueDate || null,
          writeDate: row.writeDate || null,
          businessNumber: row.businessNumber || null,
          companyName: row.companyName || null,
          representative: row.representative || null,
          address: row.address || null,
          email1: row.email1 || null,
          year,
          supplyAmount: row.supplyAmount,
          taxAmount: row.taxAmount,
          totalAmount: row.totalAmount,
        });
        imported++;
      }

      res.json({ imported, updated, skipped, vendorsCreated, autoLinked: 0, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-invoices/import-upload", (req, res, next) => {
    memUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });

      const rows = parsePurchaseTaxInvoicesFromBuffer(req.file.buffer);
      const allInvoices = await storage.getPurchaseInvoices();

      const exactKeyMap = new Map<string, typeof allInvoices[0]>();
      for (const e of allInvoices) {
        if (e.issueDate) {
          const key = `${e.issueDate}|${(e.businessNumber || "").replace(/-/g, "")}|${e.supplyAmount}`;
          exactKeyMap.set(key, e);
        }
      }

      const vendors = await storage.getVendors();
      const vendorByBizNum = new Map<string, string>();
      const vendorByCompanyName = new Map<string, string>();
      for (const v of vendors) {
        if (v.businessNumber) {
          vendorByBizNum.set(v.businessNumber.replace(/-/g, ""), v.id);
        }
        if (v.companyName) {
          vendorByCompanyName.set(v.companyName.toLowerCase().trim(), v.id);
        }
      }

      const processedKeys = new Set<string>();
      let imported = 0;
      let skipped = 0;
      let vendorsCreated = 0;

      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }

        const bizNumClean = (row.businessNumber || "").replace(/-/g, "");
        const exactKey = `${row.issueDate}|${bizNumClean}|${row.supplyAmount}`;
        if (processedKeys.has(exactKey)) { skipped++; continue; }
        processedKeys.add(exactKey);

        if (exactKeyMap.has(exactKey)) { skipped++; continue; }

        const companyLower = (row.companyName || "").toLowerCase().trim();
        let vendorId = bizNumClean ? vendorByBizNum.get(bizNumClean) || null : null;
        if (!vendorId && companyLower) vendorId = vendorByCompanyName.get(companyLower) || null;

        // 업체가 없으면 자동 생성
        if (!vendorId && row.companyName) {
          const newVendor = await storage.createVendor({
            companyName: row.companyName,
            businessNumber: row.businessNumber || null,
            representative: row.representative || null,
            address: row.address || null,
            contactEmail: row.email1 || null,
          });
          vendorId = newVendor.id;
          if (bizNumClean) vendorByBizNum.set(bizNumClean, newVendor.id);
          if (companyLower) vendorByCompanyName.set(companyLower, newVendor.id);
          vendorsCreated++;
        }

        const year = row.issueDate ? parseInt(row.issueDate.substring(0, 4)) : null;

        await storage.createPurchaseInvoice({
          vendorId,
          issueDate: row.issueDate || null,
          writeDate: row.writeDate || null,
          businessNumber: row.businessNumber || null,
          companyName: row.companyName || null,
          representative: row.representative || null,
          address: row.address || null,
          email1: row.email1 || null,
          year: year || undefined,
          supplyAmount: row.supplyAmount,
          taxAmount: row.taxAmount,
          totalAmount: row.totalAmount,
        });
        imported++;
      }

      res.json({ imported, skipped, vendorsCreated, autoLinked: 0, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-invoices/excel-url", requireAuth, async (req, res) => {
    try {
      const year = req.query.year as string;
      if (!year) return res.status(400).json({ message: "연도를 지정해주세요" });
      const { listFilesByPath } = await import("./onedrive");
      const basePath = `4.경영지원/database/${year}`;
      const files = await listFilesByPath(basePath);
      const excel = files.find((f: any) => f.name.startsWith("매입전자세금계산서목록") && (f.name.endsWith(".xls") || f.name.endsWith(".xlsx")));
      if (!excel) return res.status(404).json({ message: `${year}년 매입전자세금계산서 파일을 찾을 수 없습니다` });
      res.json({ webUrl: excel.webUrl, fileName: excel.name });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Payment routes
  app.get("/api/payments", async (req, res) => {
    try {
      const { year, month, startDate, endDate, companyName, minAmount, maxAmount, dateFrom, dateTo } = req.query;
      let list: any[];
      if (dateFrom && dateTo) {
        list = await storage.getPaymentsByDateRange(dateFrom as string, dateTo as string);
      } else if (startDate && endDate) {
        list = await storage.getPaymentsByDateRange(startDate as string, endDate as string);
      } else if (year && month) {
        list = await storage.getPaymentsByMonth(parseInt(year as string), parseInt(month as string));
      } else {
        list = await storage.getPayments();
      }

      if (companyName) {
        const q = (companyName as string).toLowerCase();
        list = list.filter(p =>
          (p.companyName && p.companyName.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
        );
      }
      if (minAmount) {
        const min = parseInt(minAmount as string);
        if (!isNaN(min)) list = list.filter(p => (p.amount || 0) >= min);
      }
      if (maxAmount) {
        const max = parseInt(maxAmount as string);
        if (!isNaN(max)) list = list.filter(p => (p.amount || 0) <= max);
      }

      const salesInvoices = await storage.getSalesInvoices();
      const purchaseInvoices = await storage.getPurchaseInvoices();
      const salesMap = new Map(salesInvoices.map(i => [i.id, i]));
      const purchaseMap = new Map(purchaseInvoices.map(i => [i.id, i]));

      const projects = await storage.getProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));

      const allOrders = await storage.getPurchaseOrders();
      const orderByPaymentId = new Map(
        allOrders.filter(o => o.paymentId).map(o => [o.paymentId!, o.orderNumber || null])
      );

      const allPayments = await storage.getPayments();
      const paidBySalesInvoice = new Map<string, number>();
      const paidByPurchaseInvoice = new Map<string, number>();
      allPayments.forEach(ap => {
        if (ap.status === "completed" && ap.salesInvoiceId) {
          paidBySalesInvoice.set(ap.salesInvoiceId, (paidBySalesInvoice.get(ap.salesInvoiceId) || 0) + (ap.actualAmount || ap.amount || 0));
        }
        if (ap.status === "completed" && ap.purchaseInvoiceId) {
          paidByPurchaseInvoice.set(ap.purchaseInvoiceId, (paidByPurchaseInvoice.get(ap.purchaseInvoiceId) || 0) + (ap.actualAmount || ap.amount || 0));
        }
      });

      const enriched = list.map(p => {
        let invoiceIssueDate: string | null = null;
        let invoiceNumber: string | null = null;
        let invoiceTotalAmount: number | null = null;
        let invoiceItem: string | null = null;
        let invoicePaidAmount = 0;
        let invoiceRemainingAmount = 0;
        if (p.salesInvoiceId && salesMap.has(p.salesInvoiceId)) {
          const inv = salesMap.get(p.salesInvoiceId)!;
          invoiceIssueDate = inv.writeDate || inv.issueDate || null;
          invoiceNumber = inv.invoiceNumber || null;
          invoiceTotalAmount = inv.totalAmount || 0;
          invoiceItem = inv.item || null;
          invoicePaidAmount = paidBySalesInvoice.get(p.salesInvoiceId) || 0;
          invoiceRemainingAmount = Math.max((invoiceTotalAmount || 0) - invoicePaidAmount, 0);
        } else if (p.purchaseInvoiceId && purchaseMap.has(p.purchaseInvoiceId)) {
          const inv = purchaseMap.get(p.purchaseInvoiceId)!;
          invoiceIssueDate = inv.writeDate || inv.issueDate || null;
          invoiceNumber = inv.invoiceNumber || null;
          invoiceTotalAmount = inv.totalAmount || 0;
          invoiceItem = inv.item || null;
          invoicePaidAmount = paidByPurchaseInvoice.get(p.purchaseInvoiceId) || 0;
          invoiceRemainingAmount = Math.max((invoiceTotalAmount || 0) - invoicePaidAmount, 0);
        }
        let invoiceSupplyAmount: number | null = null;
        let invoiceTaxAmount: number | null = null;
        if (p.salesInvoiceId && salesMap.has(p.salesInvoiceId)) {
          const inv = salesMap.get(p.salesInvoiceId)!;
          invoiceSupplyAmount = inv.supplyAmount ?? null;
          invoiceTaxAmount = inv.taxAmount ?? null;
        } else if (p.purchaseInvoiceId && purchaseMap.has(p.purchaseInvoiceId)) {
          const inv = purchaseMap.get(p.purchaseInvoiceId)!;
          invoiceSupplyAmount = inv.supplyAmount ?? null;
          invoiceTaxAmount = inv.taxAmount ?? null;
        }
        const proj = p.projectId ? projectMap.get(p.projectId) : null;
        return {
          ...p,
          invoiceIssueDate, invoiceNumber, invoiceTotalAmount, invoiceItem, invoicePaidAmount, invoiceRemainingAmount,
          invoiceSupplyAmount, invoiceTaxAmount,
          projectNumber: proj?.projectNumber || null,
          projectCustomerName: proj?.customerName || null,
          purchaseOrderNumber: orderByPaymentId.get(p.id) || null,
        };
      });

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/payments/by-invoice", async (req, res) => {
    try {
      const { type, invoiceId } = req.query;
      if (!type || !invoiceId) return res.status(400).json({ message: "type and invoiceId required" });
      const list = await storage.getPaymentsByInvoice(type as string, invoiceId as string);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const payment = await storage.createPayment(req.body);
      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/payments/:id", async (req, res) => {
    try {
      const patch = { ...req.body };
      if (patch.status === "completed" && patch.actualDate && !patch.plannedDate) {
        patch.plannedDate = patch.actualDate;
      }
      const updated = await storage.updatePayment(req.params.id, patch);
      if (!updated) return res.status(404).json({ message: "not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/bulk-complete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }

      const allPayments = await storage.getPayments();
      const salesInvoices = await storage.getSalesInvoices();
      const purchaseInvoices = await storage.getPurchaseInvoices();
      const salesMap = new Map(salesInvoices.map(i => [i.id, i]));
      const purchaseMap = new Map(purchaseInvoices.map(i => [i.id, i]));

      const targetPayments = allPayments.filter(p => (ids as string[]).includes(p.id) && p.status !== "completed");

      const results = await Promise.all(
        targetPayments.map(p => {
          let actualDate: string | null = p.plannedDate || null;
          if (p.salesInvoiceId && salesMap.has(p.salesInvoiceId)) {
            const inv = salesMap.get(p.salesInvoiceId)!;
            actualDate = inv.writeDate || inv.issueDate || actualDate;
          } else if (p.purchaseInvoiceId && purchaseMap.has(p.purchaseInvoiceId)) {
            const inv = purchaseMap.get(p.purchaseInvoiceId)!;
            actualDate = inv.writeDate || inv.issueDate || actualDate;
          }
          return storage.updatePayment(p.id, {
            status: "completed",
            actualDate: actualDate || undefined,
            actualAmount: p.amount || undefined,
          });
        })
      );

      res.json({ updated: results.filter(Boolean).length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/bulk-date", async (req, res) => {
    try {
      const { ids, plannedDate } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!plannedDate || typeof plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) {
        return res.status(400).json({ message: "plannedDate는 YYYY-MM-DD 형식이어야 합니다" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }
      // Only update non-completed payments
      const allPayments = await storage.getPayments();
      const validIds = (ids as string[]).filter(id =>
        allPayments.some(p => p.id === id && p.status !== "completed")
      );
      const results = await Promise.all(
        validIds.map((id: string) => storage.updatePayment(id, { plannedDate }))
      );
      res.json({ updated: results.filter(Boolean).length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/:id/confirm", async (req, res) => {
    try {
      const { actualDate, actualAmount, originalAmount, remainderAction, remainderTargetId, remainderNewDescription, remainderPlannedDate, projectId, companyName } = req.body;
      if (!actualDate || actualAmount === undefined || actualAmount < 0) {
        return res.status(400).json({ message: "actualDate, actualAmount(0 이상) 필수" });
      }

      const remainder = (originalAmount || 0) - actualAmount;

      if (remainderAction && remainder <= 0) {
        return res.status(400).json({ message: "잔여 금액이 없어 잔여 처리를 할 수 없습니다" });
      }
      if (remainderAction === "merge" && !remainderTargetId) {
        return res.status(400).json({ message: "합산 대상 항목이 지정되지 않았습니다" });
      }
      if (remainderAction === "new" && !projectId) {
        return res.status(400).json({ message: "프로젝트 ID가 필요합니다" });
      }

      const updated = await storage.updatePayment(req.params.id, {
        amount: actualAmount,
        actualAmount,
        actualDate,
        plannedDate: null,
        status: "completed",
      });
      if (!updated) return res.status(404).json({ message: "결제 항목을 찾을 수 없습니다" });

      let remainderResult = null;

      if (remainderAction === "merge" && remainderTargetId && remainder > 0) {
        const allPayments = await storage.getPayments();
        const target = allPayments.find(p => p.id === remainderTargetId);
        if (!target) return res.status(400).json({ message: "합산 대상 항목을 찾을 수 없습니다" });
        await storage.updatePayment(remainderTargetId, {
          amount: (target.amount || 0) + remainder,
        });
        remainderResult = { action: "merge", targetId: remainderTargetId, amount: remainder };
      } else if (remainderAction === "new" && projectId && remainder > 0) {
        const newPayment = await storage.createPayment({
          type: updated.type,
          projectId,
          companyName: companyName || "",
          description: remainderNewDescription || "잔여",
          amount: remainder,
          plannedDate: remainderPlannedDate || null,
          status: "planned",
        });
        remainderResult = { action: "new", paymentId: newPayment.id, amount: remainder };
      }

      import("./telegram").then(t => t.notifyPayment("결제완료", updated)).catch(() => {});
      res.json({ message: "입금 처리 완료", payment: updated, remainder: remainderResult });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      // 은행내역 매칭 해제
      await pool.query(
        `UPDATE bank_transactions SET matched_payment_id = NULL, match_status = 'unmatched'
         WHERE matched_payment_id = $1`,
        [req.params.id]
      );
      await storage.deletePayment(req.params.id);
      res.json({ message: "삭제 완료" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/auto-generate", async (req, res) => {
    try {
      const { invoiceId, type, paymentMethod, splitCount, amounts, plannedDates } = req.body;
      if (!invoiceId || !type || !paymentMethod) {
        return res.status(400).json({ message: "invoiceId, type, paymentMethod required" });
      }

      let invoice: any;
      let companyName = "";
      if (type === "income") {
        invoice = await storage.getSalesInvoice(invoiceId);
        companyName = invoice?.companyName || "";
      } else {
        invoice = await storage.getPurchaseInvoice(invoiceId);
        companyName = invoice?.companyName || "";
      }
      if (!invoice) return res.status(404).json({ message: "invoice not found" });

      const allPayments = await storage.getPayments();
      const existingProjectPayments = allPayments.filter(p =>
        p.salesInvoiceId === invoiceId && p.projectId && type === "income"
      );
      if (existingProjectPayments.length > 0) {
        return res.json({ created: 0, payments: existingProjectPayments, message: "프로젝트 수금계획에 이미 연결된 항목이 있습니다." });
      }

      if (type === "expense") {
        const linkedPayments = allPayments.filter(p => p.purchaseInvoiceId === invoiceId);
        if (linkedPayments.length > 0) {
          const allOrders = await storage.getPurchaseOrders();
          const paymentIds = new Set(linkedPayments.map(p => p.id));
          const affectedOrders = allOrders.filter(o => o.paymentId && paymentIds.has(o.paymentId));
          for (const order of affectedOrders) {
            await storage.updatePurchaseOrder(order.id, { paymentId: null });
          }
        }
      }

      await storage.deletePaymentsByInvoice(type, invoiceId);

      const total = invoice.totalAmount || 0;
      const splits = splitCount || 1;
      const created = [];

      for (let i = 0; i < splits; i++) {
        const amount = amounts?.[i] || Math.round(total / splits);
        let plannedDate = plannedDates?.[i] || null;

        if (!plannedDate && (invoice.writeDate || invoice.issueDate) && paymentMethod !== "specific_date") {
          const baseDate = new Date(invoice.writeDate || invoice.issueDate!);
          if (paymentMethod === "end_of_next_month") {
            const nextMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 0);
            plannedDate = nextMonth.toISOString().split("T")[0];
          } else if (paymentMethod === "end_of_month") {
            const endOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
            plannedDate = endOfMonth.toISOString().split("T")[0];
          }
        }

        const payment = await storage.createPayment({
          type,
          salesInvoiceId: type === "income" ? invoiceId : null,
          purchaseInvoiceId: type === "expense" ? invoiceId : null,
          companyName,
          description: invoice.item || null,
          amount,
          paymentMethod,
          plannedDate,
          status: "planned",
          splitIndex: i + 1,
          splitTotal: splits,
        });
        created.push(payment);
      }

      res.json({ created: created.length, payments: created });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/years", async (_req, res) => {
    try {
      const allProjects = await storage.getProjects();
      const yearSet = new Set<number>();
      for (const p of allProjects) {
        if (p.year) yearSet.add(p.year);
      }
      try {
        const folders = await listFoldersByPath("2.공사");
        for (const f of folders) {
          const y = parseInt(f.name);
          if (!isNaN(y)) yearSet.add(y);
        }
      } catch {}
      const years = Array.from(yearSet).sort((a, b) => b - a);
      res.json(years);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const list = await storage.getProjects(year);

      const salesInvoices = await storage.getSalesInvoices();
      const purchaseInvoices = await storage.getPurchaseInvoices();
      const allPayments = await storage.getPayments();
      const allInquiries = await storage.getInquiries();
      const inquiryMap = new Map(allInquiries.map(i => [i.id, i.inquiryNumber]));

      const enriched = list.map(p => {
        const sales = salesInvoices.filter(i => i.projectId === p.id);
        const purchases = purchaseInvoices.filter(i => i.projectId === p.id);
        const projectPayments = allPayments.filter(pay => pay.projectId === p.id);

        const issuedSales = sales.filter(i => !!i.issueDate);
        const salesTotal = issuedSales.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
        const salesSupplyTotal = issuedSales.reduce((sum, i) => sum + (i.supplyAmount || 0), 0);
        const purchaseTotal = purchases.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
        const profit = salesTotal - purchaseTotal;

        const paidIncome = projectPayments.filter(pay => pay.type === "income" && pay.status === "completed")
          .reduce((sum, pay) => sum + (pay.actualAmount || pay.amount || 0), 0);
        const paidExpense = projectPayments.filter(pay => pay.type === "expense" && pay.status === "completed")
          .reduce((sum, pay) => sum + (pay.actualAmount || pay.amount || 0), 0);
        const pendingPayments = projectPayments.filter(pay => pay.status !== "completed").length;

        return {
          ...p,
          salesTotal,
          salesSupplyTotal,
          purchaseTotal,
          profit,
          paidIncome,
          paidExpense,
          pendingPayments,
          salesCount: sales.length,
          purchaseCount: purchases.length,
          inquiryNumber: p.inquiryId ? (inquiryMap.get(p.inquiryId) || null) : null,
        };
      });

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      const project = projects.find(p => p.id === req.params.id);
      if (!project) return res.status(404).json({ message: "Not found" });

      const salesInvoices = (await storage.getSalesInvoices()).filter(i => i.projectId === project.id);
      const purchaseInvoices = (await storage.getPurchaseInvoices()).filter(i => i.projectId === project.id);
      const payments = (await storage.getPayments()).filter(p => p.projectId === project.id);

      let customer = null;
      if (project.customerId) {
        customer = await storage.getCustomer(project.customerId);
      }

      let inquiryNumber = null;
      if (project.inquiryId) {
        const inquiry = await storage.getInquiry(project.inquiryId);
        inquiryNumber = inquiry?.inquiryNumber || null;
      }

      res.json({ ...project, salesInvoices, purchaseInvoices, payments, customer: customer || null, inquiryNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/unlinked-suggestions", async (_req, res) => {
    try {
      const allProjects = await storage.getProjects();
      const allCustomers = await storage.getCustomers();
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

      const unlinked = allProjects.filter(p => !p.customerId && p.customerName);

      const result = unlinked.map(project => {
        const pNorm = norm(project.customerName!);
        const candidates = allCustomers
          .map(c => {
            const cNorm = norm(c.companyName);
            let score = 0;
            if (cNorm === pNorm) score = 100;
            else if (cNorm.includes(pNorm) || pNorm.includes(cNorm)) score = 80;
            else {
              // partial token overlap
              const overlap = [...pNorm].filter(ch => cNorm.includes(ch)).length;
              score = Math.round((overlap / Math.max(pNorm.length, cNorm.length)) * 60);
            }
            return { id: c.id, companyName: c.companyName, businessNumber: c.businessNumber, score };
          })
          .filter(c => c.score >= 50)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        return {
          id: project.id,
          projectNumber: project.projectNumber,
          customerName: project.customerName,
          year: project.year,
          candidates,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/auto-match-customers", async (req, res) => {
    try {
      const allProjects = await storage.getProjects();
      const allCustomers = await storage.getCustomers();
      let matched = 0;
      let alreadyLinked = 0;
      const unmatched: string[] = [];
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

      for (const project of allProjects) {
        if (project.customerId) {
          alreadyLinked++;
          continue;
        }
        if (!project.customerName) {
          unmatched.push(project.projectNumber || project.id);
          continue;
        }
        const pNorm = norm(project.customerName);
        // Exact match first
        let match = allCustomers.find(c => norm(c.companyName) === pNorm);
        // Substring match only when exactly one candidate — avoids false positives
        if (!match) {
          const substringMatches = allCustomers.filter(c => {
            const cNorm = norm(c.companyName);
            return cNorm.includes(pNorm) || pNorm.includes(cNorm);
          });
          if (substringMatches.length === 1) match = substringMatches[0];
        }
        if (match) {
          await storage.updateProject(project.id, { customerId: match.id, customerName: match.companyName });
          matched++;
        } else {
          unmatched.push(project.customerName);
        }
      }

      res.json({
        message: `자동 매칭 완료: ${matched}건 연결, ${alreadyLinked}건 기연결, ${unmatched.length}건 미매칭`,
        matched,
        alreadyLinked,
        unmatchedCount: unmatched.length,
        unmatched: [...new Set(unmatched)].slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/invoice-match-preview", async (_req, res) => {
    try {
      const allInvoices = await storage.getSalesInvoices();
      const allProjects = await storage.getProjects();
      const allCustomers = await storage.getCustomers();

      const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

      const customerById = new Map(allCustomers.map(c => [c.id, c]));

      const unlinked = allInvoices.filter(i => !i.projectId && !!i.issueDate);

      const groupMap = new Map<string, { invoiceCount: number; totalAmount: number; invoiceIds: string[] }>();
      for (const inv of unlinked) {
        const key = inv.companyName || "(거래처 없음)";
        if (!groupMap.has(key)) groupMap.set(key, { invoiceCount: 0, totalAmount: 0, invoiceIds: [] });
        const g = groupMap.get(key)!;
        g.invoiceCount++;
        g.totalAmount += inv.supplyAmount || 0;
        g.invoiceIds.push(inv.id);
      }

      const groups = Array.from(groupMap.entries()).map(([companyName, data]) => {
        const norm = normalize(companyName);
        const candidates = allProjects.filter(p => {
          const pNorm = normalize(p.customerName || "");
          if (pNorm === norm) return true;
          if (p.customerId) {
            const cust = customerById.get(p.customerId);
            if (cust && normalize(cust.companyName) === norm) return true;
          }
          return false;
        }).map(p => ({ id: p.id, projectNumber: p.projectNumber, customerName: p.customerName, year: p.year, description: p.description }));

        return { companyName, invoiceCount: data.invoiceCount, totalAmount: data.totalAmount, candidates };
      });

      groups.sort((a, b) => b.invoiceCount - a.invoiceCount);

      res.json({ groups, totalUnlinked: unlinked.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/retroactive-invoice-match", async (req, res) => {
    try {
      const { mappings } = req.body as { mappings: { companyName: string; projectId: string }[] };
      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res.status(400).json({ message: "mappings 배열이 필요합니다" });
      }

      const seen = new Set<string>();
      const dedupedMappings: { companyName: string; projectId: string }[] = [];
      for (const m of mappings) {
        if (!m.companyName || !m.projectId || typeof m.companyName !== "string" || typeof m.projectId !== "string") {
          return res.status(400).json({ message: "각 매핑은 companyName과 projectId가 필요합니다" });
        }
        if (!seen.has(m.companyName)) {
          seen.add(m.companyName);
          dedupedMappings.push(m);
        }
      }

      const allProjects = await storage.getProjects();
      const projectIds = new Set(allProjects.map(p => p.id));
      const invalidIds = dedupedMappings.filter(m => !projectIds.has(m.projectId)).map(m => m.projectId);
      if (invalidIds.length > 0) {
        return res.status(400).json({ message: `존재하지 않는 프로젝트 ID: ${[...new Set(invalidIds)].join(", ")}` });
      }

      const allInvoices = await storage.getSalesInvoices();
      let matched = 0;
      const details: { companyName: string; count: number }[] = [];

      for (const { companyName, projectId } of dedupedMappings) {
        const toLink = allInvoices.filter(i => !i.projectId && !!i.issueDate && i.companyName === companyName);
        for (const inv of toLink) {
          await storage.updateSalesInvoice(inv.id, { projectId });
          matched++;
        }
        details.push({ companyName, count: toLink.length });
      }

      res.json({ matched, message: `${matched}건의 계산서가 프로젝트에 연결되었습니다.`, details });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/sync", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string || req.body.year);
      if (!year) return res.status(400).json({ message: "year required" });

      const folderPath = `2.공사/${year}`;
      const folders = await listFoldersByPath(folderPath);

      let created = 0, updated = 0, skipped = 0, deleted = 0;

      const onedriveFolderNames = new Set(folders.map(f => f.name));

      for (const folder of folders) {
        const existing = await storage.getProjectByFolderName(folder.name);
        const parts = folder.name.split("_");
        const projectNumber = parts[0] || folder.name;
        const customerName = parts[1] || "";
        const description = parts.slice(2).join("_") || "";

        const regDate = folder.createdDateTime ? folder.createdDateTime.split("T")[0] : null;

        if (existing) {
          const updateData: any = {
            onedriveFolderId: folder.id,
            onedriveWebUrl: folder.webUrl,
            projectNumber,
            customerName,
            description,
            year,
          };
          if (!existing.registrationDate && regDate) {
            updateData.registrationDate = regDate;
          }
          await storage.updateProject(existing.id, updateData);
          updated++;
        } else {
          await storage.createProject({
            projectNumber,
            customerName,
            description,
            year,
            folderName: folder.name,
            onedriveFolderId: folder.id,
            onedriveWebUrl: folder.webUrl,
            status: "active",
            registrationDate: regDate,
          });
          created++;
        }
      }

      const existingProjects = await storage.getProjects(year);
      for (const project of existingProjects) {
        if (project.folderName && !onedriveFolderNames.has(project.folderName)) {
          await pool.query(`UPDATE sales_invoices SET project_id = NULL WHERE project_id = $1`, [project.id]);
          await pool.query(`UPDATE purchase_invoices SET project_id = NULL WHERE project_id = $1`, [project.id]);
          await pool.query(`UPDATE payments SET project_id = NULL WHERE project_id = $1`, [project.id]);
          await pool.query(`UPDATE bank_transactions SET matched_project_id = NULL WHERE matched_project_id = $1`, [project.id]);
          await storage.deleteProject(project.id);
          deleted++;
        }
      }

      res.json({ message: `동기화 완료: ${created}건 생성, ${updated}건 갱신, ${deleted}건 삭제`, created, updated, deleted, skipped, total: folders.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const oldProject = req.body.status ? await storage.getProject(req.params.id) : null;
      const result = await storage.updateProject(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Not found" });
      if (req.body.status && oldProject && req.body.status !== oldProject.status) {
        import("./telegram").then(t => t.notifyProject("상태변경", result)).catch(() => {});
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const projectId = req.params.id;

      // 연결된 매출/매입계산서의 projectId null 처리 (계산서 자체는 유지)
      await pool.query(`UPDATE sales_invoices SET project_id = NULL WHERE project_id = $1`, [projectId]);
      await pool.query(`UPDATE purchase_invoices SET project_id = NULL WHERE project_id = $1`, [projectId]);

      // 연결된 수금/지급계획의 projectId null 처리
      await pool.query(`UPDATE payments SET project_id = NULL WHERE project_id = $1`, [projectId]);

      // 은행내역의 matchedProjectId null 처리
      await pool.query(`UPDATE bank_transactions SET matched_project_id = NULL WHERE matched_project_id = $1`, [projectId]);

      await storage.deleteProject(projectId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:id/items", async (req, res) => {
    try {
      const items = await storage.getProjectItems(req.params.id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/items", async (req, res) => {
    try {
      const parsed = insertProjectItemSchema.parse({ ...req.body, projectId: req.params.id });
      const item = await storage.createProjectItem(parsed);
      res.status(201).json(item);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "유효성 검증 실패", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/project-items/:id", async (req, res) => {
    try {
      const { projectId, ...rest } = req.body;
      const parsed = insertProjectItemSchema.partial().parse(rest);
      const item = await storage.updateProjectItem(req.params.id, parsed);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "유효성 검증 실패", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/project-items/:id", async (req, res) => {
    try {
      await storage.deleteProjectItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/convert-to-project", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });

      const allProjects = await storage.getProjects();
      const existingProject = allProjects.find(p => p.inquiryId === inquiry.id);
      if (existingProject) {
        return res.status(409).json({ message: "이미 프로젝트로 전환되었습니다", projectId: existingProject.id });
      }

      // 사업자등록번호가 없는 거래처는 프로젝트로 전환할 수 없음 (예정/완료 계산서 혼재 방지)
      const convertCustomer = inquiry.customerId ? await storage.getCustomer(inquiry.customerId) : null;
      if (!convertCustomer || !convertCustomer.businessNumber || !convertCustomer.businessNumber.trim()) {
        return res.status(400).json({ message: "사업자등록번호가 등록된 거래처만 프로젝트로 전환할 수 있습니다. 거래처에 사업자등록번호를 먼저 등록해 주세요." });
      }

      // 견적 최종 금액(할인 반영) 계산 — 게이트와 프로젝트 총액에 사용
      let latestQuoteTotalAmount: number | null = null;
      try {
        const quots0 = await storage.getQuotationsByInquiry(inquiry.id);
        if (quots0.length > 0) {
          const quotData0 = await storage.getQuotationWithItems(quots0[quots0.length - 1].id);
          if (quotData0 && quotData0.items.length > 0) {
            const supply = quotData0.items.reduce((s, i) => s + (i.amount || 0), 0);
            const q = quotData0.quotation;
            const dType = q.discountType || "amount";
            const dVal = q.discountValue || 0;
            const dAmt = dVal > 0 ? (dType === "percent" ? Math.round(supply * dVal / 100) : dVal) : 0;
            const dUnit = parseInt((q.discountTruncUnit as string) || "0") || 0;
            let afterDiscount = supply - dAmt;
            if (dUnit > 0 && dAmt > 0) afterDiscount = Math.floor(afterDiscount / dUnit) * dUnit;
            latestQuoteTotalAmount = afterDiscount;
          }
        }
      } catch (calcErr: any) {
        console.log(`최종금액 계산 실패 (lastQuoteSales 사용): ${calcErr.message}`);
      }

      // 전환 게이트: 계산서·수금 계획을 생성할 수 있는 비율·금액이 갖춰져야 전환 허용.
      // 없으면 프로젝트/폴더를 만들지 않고 차단(생성·전환 모두 안 됨).
      const convTotal = latestQuoteTotalAmount ?? inquiry.lastQuoteSales ?? 0;
      const ratioSum = (inquiry.contractRatio || 0) + (inquiry.midRatio || 0) + (inquiry.finalRatio || 0);
      const needDelivery =
        (inquiry.midAfterDelivery === "true" && (inquiry.midRatio || 0) > 0) ||
        (inquiry.finalAfterDelivery === "true" && (inquiry.finalRatio || 0) > 0);
      const planErrors: string[] = [];
      if (!convTotal || convTotal <= 0) planErrors.push("견적 금액(총액)이 없습니다 — 견적서를 연결/작성하세요.");
      if (ratioSum !== 100) planErrors.push(`수금·계산서 비율 합계가 ${ratioSum}%입니다 — 계약금+중도금+잔금 = 100%로 설정하세요.`);
      if (needDelivery && !inquiry.deliveryDate) planErrors.push("납품예정일이 없습니다 — 납품 기준 수금 타이밍 계산에 필요합니다.");
      if (planErrors.length > 0) {
        return res.status(400).json({ message: "계산서·수금 계획을 먼저 설정해야 전환할 수 있습니다:\n· " + planErrors.join("\n· "), planErrors });
      }

      const year = inquiry.year || new Date().getFullYear();
      const prefix = String(year).slice(-2);
      const yearProjects = allProjects.filter(p => p.year === year && p.projectNumber);
      let maxSeq = 0;
      for (const p of yearProjects) {
        const match = p.projectNumber?.match(/^\d+-(\d+)/);
        if (match) {
          const seq = parseInt(match[1]);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
      const projectNumber = `${prefix}-${maxSeq + 1}`;

      const customerName = inquiry.customerName || "";
      const description = inquiry.productInfo || "";
      const safeName = `${projectNumber}_${customerName}_${description}`.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100);

      let onedriveFolderId: string | null = null;
      let onedriveWebUrl: string | null = null;
      try {
        const { ensureFolderByPath } = await import("./onedrive");
        const folderPath = `2.공사/${year}/${safeName}`;
        onedriveFolderId = await ensureFolderByPath(folderPath);
        if (onedriveFolderId) {
          const { getAccessToken, DRIVE_ID } = await import("./onedrive");
          const token = await getAccessToken();
          const folderRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${onedriveFolderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json() as any;
            onedriveWebUrl = folderData.webUrl || null;
          }
        }
      } catch (driveErr: any) {
        console.log(`OneDrive 프로젝트 폴더 생성 실패 (전환은 계속): ${driveErr.message}`);
      }

      const project = await storage.createProject({
        projectNumber,
        customerName,
        customerId: inquiry.customerId || null,
        description,
        year,
        folderName: safeName,
        onedriveFolderId,
        onedriveWebUrl,
        status: "active",
        totalAmount: latestQuoteTotalAmount ?? inquiry.lastQuoteSales ?? null,
        depositRatio: inquiry.contractRatio || null,
        depositTimingType: inquiry.contractTimingType || null,
        depositTimingDays: inquiry.contractTimingDays || null,
        midRatio: inquiry.midRatio || null,
        midTimingType: inquiry.midTimingType || null,
        midTimingDays: inquiry.midTimingDays || null,
        midAfterDelivery: inquiry.midAfterDelivery || null,
        finalRatio: inquiry.finalRatio || null,
        finalTimingType: inquiry.finalTimingType || null,
        finalTimingDays: inquiry.finalTimingDays || null,
        finalAfterDelivery: inquiry.finalAfterDelivery || null,
        deliveryDate: inquiry.deliveryDate || null,
        inquiryId: inquiry.id,
        warrantyTerms: inquiry.warrantyTerms || null,
        contractClauses: inquiry.contractClauses || null,
        registrationDate: new Date().toISOString().split("T")[0],
      });

      const quots = await storage.getQuotationsByInquiry(inquiry.id);
      if (quots.length > 0) {
        const latestQuot = quots[quots.length - 1];
        const quotData = await storage.getQuotationWithItems(latestQuot.id);
        if (quotData) {
          const realItems = quotData.items.filter(i => !i.isAdjustment);
          for (let idx = 0; idx < realItems.length; idx++) {
            const qi = realItems[idx];
            await storage.createProjectItem({
              projectId: project.id,
              itemCode: qi.itemCode || null,
              itemName: qi.itemName,
              spec: qi.spec || null,
              quantity: qi.quantity,
              costPrice: qi.costPrice || 0,
              unitPrice: qi.unitPrice,
              amount: qi.amount,
              category1: qi.category1 || null,
              category2: qi.category2 || null,
              sortOrder: idx,
            });
          }
        }
      }

      // 전환 시 계산서 발행계획 + 수금계획 자동 생성 (게이트를 통과했으므로 비율·금액 유효).
      // 단계별로 미발행 계산서(placeholder) + 예정 수금(payment)을 한 번에 생성.
      try {
        const genTotal = project.totalAmount || 0;
        const baseDate = new Date().toISOString().split("T")[0];
        const genDelivery = project.deliveryDate || baseDate;
        const genStages = [
          { name: "계약금", ratio: project.depositRatio || 0, timingType: project.depositTimingType, timingDays: project.depositTimingDays, afterDelivery: null as string | null, idx: 1 },
          { name: "중도금", ratio: project.midRatio || 0, timingType: project.midTimingType, timingDays: project.midTimingDays, afterDelivery: project.midAfterDelivery, idx: 2 },
          { name: "잔금", ratio: project.finalRatio || 0, timingType: project.finalTimingType, timingDays: project.finalTimingDays, afterDelivery: project.finalAfterDelivery, idx: 3 },
        ].filter(s => s.ratio > 0);
        const splitTotal = genStages.length;
        for (const stage of genStages) {
          const supplyAmt = Math.round((genTotal * stage.ratio) / 100);
          const tax = Math.round(supplyAmt * 0.1);
          const amount = supplyAmt + tax;
          const refDate = stage.afterDelivery === "true" ? genDelivery : baseDate;
          const plannedDate = calcPaymentDate(refDate, stage.timingType, stage.timingDays);
          const inv = await storage.createSalesInvoice({
            projectId: project.id,
            customerId: project.customerId || null,
            companyName: convertCustomer.companyName || project.customerName || "",
            businessNumber: convertCustomer.businessNumber || null,
            representative: convertCustomer.representative || null,
            address: convertCustomer.address || null,
            issueDate: null,
            year: project.year || year,
            item: `${project.projectNumber || ""} ${stage.name}`.trim() || null,
            supplyAmount: supplyAmt,
            taxAmount: tax,
            totalAmount: amount,
            invoiceStage: stage.name,
            plannedIssueDate: plannedDate,
            status: "pending",
          });
          await storage.createPayment({
            type: "income",
            projectId: project.id,
            salesInvoiceId: inv.id,
            companyName: project.customerName || "",
            description: `${project.projectNumber} ${stage.name}`,
            amount,
            plannedDate,
            paymentMethod: stage.timingType || "end_of_next_month",
            status: "planned",
            splitIndex: stage.idx,
            splitTotal,
          });
        }
      } catch (genErr: any) {
        console.log(`전환 시 계획 자동생성 실패: ${genErr.message}`);
      }

      await storage.updateInquiry(inquiry.id, { status: "won" });
      import("./telegram").then(t => t.notifyProject("프로젝트 전환", project)).catch(() => {});

      res.status(201).json({ project, message: "프로젝트로 전환되었습니다" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function calcPaymentDate(baseDate: string, timingType: string | null, timingDays: number | null): string {
    const base = new Date(baseDate);
    if (!timingType) return baseDate;
    switch (timingType) {
      case "end_of_next_month": {
        const d = new Date(base.getFullYear(), base.getMonth() + 2, 0);
        return d.toISOString().split("T")[0];
      }
      case "two_weeks": {
        const d = new Date(base);
        d.setDate(d.getDate() + 14);
        return d.toISOString().split("T")[0];
      }
      case "end_of_month": {
        const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
        return d.toISOString().split("T")[0];
      }
      case "specific_days": {
        const d = new Date(base);
        d.setDate(d.getDate() + (timingDays || 30));
        return d.toISOString().split("T")[0];
      }
      default:
        return baseDate;
    }
  }

  app.post("/api/projects/:id/generate-collection-plan", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      const project = projects.find(p => p.id === req.params.id);
      if (!project) return res.status(404).json({ message: "프로젝트를 찾을 수 없습니다" });
      if (!project.totalAmount) return res.status(400).json({ message: "프로젝트 총 금액을 먼저 설정하세요" });

      // 예정계산서에 거래처/사업자번호를 채워 홈택스 실발행건과 자동 매칭(예정/완료 혼재 방지)
      const planCustomer = project.customerId ? await storage.getCustomer(project.customerId) : null;

      const existingPayments = await storage.getPayments();
      const projectPayments = existingPayments.filter(p => p.projectId === project.id && p.type === "income");
      const plannedCount = projectPayments.filter(p => p.status !== "completed").length;

      if (plannedCount > 0 && !req.body.confirmed) {
        return res.status(409).json({ message: `예정 항목 ${plannedCount}건이 삭제됩니다. 계속하시겠습니까?`, needConfirm: true, plannedCount });
      }

      const deleted = await storage.deletePlannedPaymentsByProject(project.id);

      const completedPayments = projectPayments.filter(p => p.status === "completed");
      const completedStages = new Set(completedPayments.map(p => p.splitIndex).filter(Boolean));

      const allSalesInvoices = await storage.getSalesInvoices();
      const projectInvoices = allSalesInvoices.filter(inv => inv.projectId === project.id);
      const invoiceByStage = new Map<string, any>();
      projectInvoices.forEach(inv => {
        if (inv.invoiceStage) invoiceByStage.set(inv.invoiceStage, inv);
      });

      const baseDate = req.body.baseDate || new Date().toISOString().split("T")[0];
      const deliveryDate = project.deliveryDate || baseDate;
      let created = 0;
      let skipped = 0;
      const stages: { name: string; ratio: number | null; timingType: string | null; timingDays: number | null; afterDelivery?: string | null }[] = [
        { name: "계약금", ratio: project.depositRatio, timingType: project.depositTimingType, timingDays: project.depositTimingDays },
        { name: "중도금", ratio: project.midRatio, timingType: project.midTimingType, timingDays: project.midTimingDays, afterDelivery: project.midAfterDelivery },
        { name: "잔금", ratio: project.finalRatio, timingType: project.finalTimingType, timingDays: project.finalTimingDays, afterDelivery: project.finalAfterDelivery },
      ];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (!stage.ratio || stage.ratio <= 0) continue;
        if (completedStages.has(i + 1)) { skipped++; continue; }
        const supplyAmt = Math.round((project.totalAmount * stage.ratio) / 100);
        const tax = Math.round(supplyAmt * 0.1);
        const amount = supplyAmt + tax;
        const refDate = stage.afterDelivery === "true" ? deliveryDate : baseDate;
        const plannedDate = calcPaymentDate(refDate, stage.timingType, stage.timingDays);

        const matchedInvoice = invoiceByStage.get(stage.name);
        let salesInvoiceId = matchedInvoice?.id || null;

        if (salesInvoiceId) {
          const existingInvoicePayments = existingPayments.filter(p => p.salesInvoiceId === salesInvoiceId && !p.projectId);
          for (const dup of existingInvoicePayments) {
            if (dup.status !== "completed") {
              await storage.deletePayment(dup.id);
            }
          }
        } else {
          const existingPlaceholder = projectInvoices.find(inv => inv.invoiceStage === stage.name && !inv.issueDate);
          if (existingPlaceholder) {
            salesInvoiceId = existingPlaceholder.id;
          } else {
            const newInvoice = await storage.createSalesInvoice({
              projectId: project.id,
              customerId: project.customerId || null,
              companyName: planCustomer?.companyName || project.customerName || "",
              businessNumber: planCustomer?.businessNumber || null,
              representative: planCustomer?.representative || null,
              address: planCustomer?.address || null,
              issueDate: null,
              year: project.year || new Date().getFullYear(),
              item: `${project.projectNumber || ""} ${stage.name}`.trim() || null,
              supplyAmount: supplyAmt,
              taxAmount: tax,
              totalAmount: amount,
              invoiceStage: stage.name,
              plannedIssueDate: plannedDate,
              status: "pending",
            });
            salesInvoiceId = newInvoice.id;
          }
        }

        await storage.createPayment({
          type: "income",
          projectId: project.id,
          salesInvoiceId,
          companyName: project.customerName || "",
          description: `${project.projectNumber} ${stage.name}`,
          amount,
          plannedDate,
          paymentMethod: stage.timingType || "end_of_next_month",
          status: "planned",
          splitIndex: i + 1,
          splitTotal: stages.filter(s => s.ratio && s.ratio > 0).length,
        });
        created++;
      }

      res.json({ message: `수금 계획 ${created}건 생성 완료${skipped > 0 ? ` (입금완료 ${skipped}건 유지)` : ""}`, created, skipped });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/generate-invoice-plan", async (req, res) => {
    try {
      const allProjects = await storage.getProjects();
      const project = allProjects.find(p => p.id === req.params.id);
      if (!project) return res.status(404).json({ message: "프로젝트를 찾을 수 없습니다" });
      if (!project.totalAmount) return res.status(400).json({ message: "프로젝트 총 금액을 먼저 설정하세요" });

      // 예정계산서에 거래처/사업자번호를 채워 홈택스 실발행건과 자동 매칭(예정/완료 혼재 방지)
      const planCustomer = project.customerId ? await storage.getCustomer(project.customerId) : null;

      const existingSales = (await storage.getSalesInvoices()).filter(i => i.projectId === project.id);
      const issuedInvoices = existingSales.filter(i => !!i.issueDate);
      const placeholderInvoices = existingSales.filter(i => !i.issueDate);
      const issuedStages = new Set(issuedInvoices.map(i => i.invoiceStage).filter(Boolean));

      if (placeholderInvoices.length > 0 && !req.body.confirmed) {
        return res.status(409).json({
          message: `미발행 계산서 ${placeholderInvoices.length}건이 삭제되고 새로 생성됩니다.${issuedInvoices.length > 0 ? ` (발행완료 ${issuedInvoices.length}건은 유지됩니다)` : ""} 계속하시겠습니까?`,
          needConfirm: true,
          existingCount: placeholderInvoices.length,
          preservedCount: issuedInvoices.length,
        });
      }

      const allPayments = await storage.getPayments();
      const projectPayments = allPayments.filter(p => p.projectId === project.id && p.type === "income");

      if (req.body.confirmed) {
        const deletedInvoiceIds = new Set<string>();
        for (const inv of placeholderInvoices) {
          const linkedPayments = projectPayments.filter(p => p.salesInvoiceId === inv.id);
          for (const lp of linkedPayments) {
            await storage.updatePayment(lp.id, { salesInvoiceId: null });
            (lp as any).salesInvoiceId = null;
          }
          await storage.deleteSalesInvoice(inv.id);
          deletedInvoiceIds.add(inv.id);
        }
      }

      const invoicePlan = project.invoicePlan || "split";
      const today = new Date().toISOString().split("T")[0];
      const yearNum = project.year || new Date().getFullYear();
      let created = 0;
      let skipped = 0;

      const baseDate = req.body.baseDate || today;
      const deliveryDate = project.deliveryDate || baseDate;

      if (invoicePlan === "bulk") {
        if (!issuedStages.has("일괄")) {
          const supply = project.totalAmount;
          const tax = Math.round(supply * 0.1);
          const timingType = project.depositTimingType || project.finalTimingType || "end_of_next_month";
          const timingDays = project.depositTimingDays || project.finalTimingDays || null;
          const plannedDate = calcPaymentDate(baseDate, timingType, timingDays);
          const newInv = await storage.createSalesInvoice({
            projectId: project.id,
            customerId: project.customerId || null,
            companyName: planCustomer?.companyName || project.customerName || "",
            businessNumber: planCustomer?.businessNumber || null,
            representative: planCustomer?.representative || null,
            address: planCustomer?.address || null,
            issueDate: null,
            year: yearNum,
            item: `${project.projectNumber || ""} ${project.description || ""}`.trim() || null,
            supplyAmount: supply,
            taxAmount: tax,
            totalAmount: supply + tax,
            invoiceStage: "일괄",
            plannedIssueDate: plannedDate,
            status: "pending",
          });
          created++;
          const matchingPayment = projectPayments.find(p => !p.salesInvoiceId && p.splitIndex === 1);
          if (matchingPayment) {
            await storage.updatePayment(matchingPayment.id, { salesInvoiceId: newInv.id });
          }
        } else { skipped++; }
      } else {
        const stageIndexMap: Record<string, number> = { "계약금": 1, "중도금": 2, "잔금": 3 };
        const stages = [
          { name: "계약금", ratio: project.depositRatio || 0, timingType: project.depositTimingType, timingDays: project.depositTimingDays, afterDelivery: null as string | null },
          { name: "중도금", ratio: project.midRatio || 0, timingType: project.midTimingType, timingDays: project.midTimingDays, afterDelivery: project.midAfterDelivery },
          { name: "잔금", ratio: project.finalRatio || 0, timingType: project.finalTimingType, timingDays: project.finalTimingDays, afterDelivery: project.finalAfterDelivery },
        ].filter(s => s.ratio > 0);

        for (const stage of stages) {
          if (issuedStages.has(stage.name)) { skipped++; continue; }
          const supply = Math.round((project.totalAmount * stage.ratio) / 100);
          const tax = Math.round(supply * 0.1);
          const refDate = stage.afterDelivery === "true" ? deliveryDate : baseDate;
          const plannedDate = calcPaymentDate(refDate, stage.timingType, stage.timingDays);
          const newInv = await storage.createSalesInvoice({
            projectId: project.id,
            customerId: project.customerId || null,
            companyName: planCustomer?.companyName || project.customerName || "",
            businessNumber: planCustomer?.businessNumber || null,
            representative: planCustomer?.representative || null,
            address: planCustomer?.address || null,
            issueDate: null,
            year: yearNum,
            item: `${project.projectNumber || ""} ${stage.name}`.trim() || null,
            supplyAmount: supply,
            taxAmount: tax,
            totalAmount: supply + tax,
            invoiceStage: stage.name,
            plannedIssueDate: plannedDate,
            status: "pending",
          });
          created++;
          const idx = stageIndexMap[stage.name] || 0;
          const matchingPayment = projectPayments.find(p => !p.salesInvoiceId && (p.splitIndex === idx || (p.description && p.description.includes(stage.name))));
          if (matchingPayment) {
            await storage.updatePayment(matchingPayment.id, { salesInvoiceId: newInv.id });
          }
        }
      }

      res.json({ message: `계산서 ${created}건 생성 완료${skipped > 0 ? ` (발행완료 ${skipped}건 유지)` : ""}`, created, skipped });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/management-dashboard", async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      const salesInvoices = await storage.getSalesInvoices();
      const allPayments = await storage.getPayments();
      const today = new Date().toISOString().split("T")[0];

      const unissuedInvoices: any[] = [];
      const overdueInvoices: any[] = [];
      const uncollectedPayments: any[] = [];
      const overduePayments: any[] = [];

      for (const inv of salesInvoices) {
        if (!inv.projectId) continue;
        if (inv.issueDate) continue;
        const proj = projects.find(p => p.id === inv.projectId);
        const entry = {
          invoiceId: inv.id,
          projectId: inv.projectId,
          projectNumber: proj?.projectNumber || "",
          customerName: inv.companyName || proj?.customerName || "",
          stage: inv.invoiceStage || "",
          supplyAmount: inv.supplyAmount || 0,
          taxAmount: inv.taxAmount || 0,
          totalAmount: inv.totalAmount || 0,
          plannedIssueDate: inv.plannedIssueDate || null,
          isOverdue: !!(inv.plannedIssueDate && inv.plannedIssueDate < today),
        };
        unissuedInvoices.push(entry);
        if (entry.isOverdue) overdueInvoices.push(entry);
      }

      for (const pay of allPayments) {
        if (pay.type !== "income") continue;
        if (pay.status === "completed") continue;
        const proj = pay.projectId ? projects.find(p => p.id === pay.projectId) : null;
        const inv = pay.salesInvoiceId ? salesInvoices.find(i => i.id === pay.salesInvoiceId) : null;
        const entry = {
          paymentId: pay.id,
          projectId: pay.projectId || null,
          salesInvoiceId: pay.salesInvoiceId || null,
          projectNumber: proj?.projectNumber || (inv?.invoiceNumber ? `계산서-${inv.invoiceNumber}` : ""),
          customerName: pay.companyName || proj?.customerName || inv?.companyName || "",
          description: pay.description || "",
          amount: pay.amount || 0,
          plannedDate: pay.plannedDate || null,
          isOverdue: !!(pay.plannedDate && pay.plannedDate < today),
        };
        uncollectedPayments.push(entry);
        if (entry.isOverdue) overduePayments.push(entry);
      }

      unissuedInvoices.sort((a, b) => (a.plannedIssueDate || "9999").localeCompare(b.plannedIssueDate || "9999"));
      uncollectedPayments.sort((a, b) => (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999"));

      const totalUnissuedAmount = unissuedInvoices.reduce((s, i) => s + i.supplyAmount, 0);
      const totalOverdueAmount = overdueInvoices.reduce((s, i) => s + i.supplyAmount, 0);
      const totalUncollected = uncollectedPayments.reduce((s, p) => s + p.amount, 0);
      const totalOverduePayment = overduePayments.reduce((s, p) => s + p.amount, 0);

      res.json({
        summary: {
          unissuedCount: unissuedInvoices.length,
          overdueInvoiceCount: overdueInvoices.length,
          uncollectedCount: uncollectedPayments.length,
          overduePaymentCount: overduePayments.length,
          totalUnissuedAmount,
          totalOverdueAmount,
          totalUncollected,
          totalOverduePayment,
        },
        unissuedInvoices,
        uncollectedPayments,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/items", requireAuth, async (_req, res) => {
    try {
      const items = await storage.getItemsWithDetails();
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/items/:itemCode", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItemByCode(req.params.itemCode);
      if (!item) return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      const inventory = await storage.getItemInventory(req.params.itemCode);
      const documents = await storage.getItemDocuments(req.params.itemCode);
      res.json({ ...item, inventory, documents });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/items", requireAuth, async (req, res) => {
    try {
      const parsed = insertItemMasterSchema.parse(req.body);
      const item = await storage.upsertItem(parsed);
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const allowedFields = ["itemName", "category1", "category2", "spec", "cost", "salesPrice", "active", "itemType", "isFavorite"];
      const fields: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          fields[key] = req.body[key];
        }
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "변경할 필드가 없습니다" });
      }
      const item = await storage.updateItemById(req.params.id, fields);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteItem(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/items/write-onedrive", requireAuth, async (_req, res) => {
    try {
      await writeListPriceToOneDrive();
      res.json({ message: "판매제품 목록이 OneDrive에 저장되었습니다" });
    } catch (err: any) {
      console.error("[listprice write]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/items/:itemCode/inventory", requireAuth, async (req, res) => {
    try {
      const inventory = await storage.getItemInventory(req.params.itemCode);
      res.json(inventory);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/items/:itemCode/inventory", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, itemCode: req.params.itemCode };
      const parsed = insertItemInventorySchema.parse(data);
      const inv = await storage.upsertItemInventory(parsed);
      res.json(inv);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/items/sync-onedrive", requireAuth, async (_req, res) => {
    try {
      const parsed = await parseListPriceFromOneDrive();
      let upserted = 0;
      let inventoryCount = 0;
      let docCount = 0;

      for (const item of parsed) {
        await storage.upsertItem({
          category1: item.category1,
          category2: item.category2,
          itemCode: item.itemCode,
          itemName: item.itemName,
          spec: item.spec,
          cost: item.cost,
          salesPrice: item.salesPrice,
          active: item.active,
          itemType: item.itemType,
        });
        upserted++;

        if (item.availableQty > 0) {
          await storage.upsertItemInventory({
            itemCode: item.itemCode,
            stockType: "AVAILABLE",
            qty: item.availableQty,
          });
          inventoryCount++;
        }
        if (item.testQty > 0) {
          await storage.upsertItemInventory({
            itemCode: item.itemCode,
            stockType: "TEST",
            qty: item.testQty,
          });
          inventoryCount++;
        }

        if (item.documents.length > 0) {
          await storage.deleteItemDocumentsByItemCode(item.itemCode);
          for (const doc of item.documents) {
            await storage.addItemDocument({
              itemCode: item.itemCode,
              docType: doc.docType,
              url: doc.url,
            });
            docCount++;
          }
        }
      }

      res.json({
        message: `제품 ${upserted}건 동기화 완료 (재고 ${inventoryCount}건, 문서 ${docCount}건)`,
        count: upserted,
        inventoryCount,
        docCount,
      });
    } catch (err: any) {
      console.error("[items sync]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/items/:id/components", requireAuth, async (req, res) => {
    try {
      const components = await storage.getItemComponents(req.params.id);
      res.json(components);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/items/:id/components", requireAuth, async (req, res) => {
    try {
      if (!req.body.itemName) {
        return res.status(400).json({ message: "품명은 필수입니다" });
      }
      const qty = req.body.quantity ?? 1;
      if (typeof qty !== "number" || qty < 1) {
        return res.status(400).json({ message: "수량은 1 이상이어야 합니다" });
      }
      const data = {
        itemMasterId: req.params.id,
        purchaseItemId: req.body.purchaseItemId || null,
        itemName: req.body.itemName,
        spec: req.body.spec || null,
        quantity: qty,
        unitCost: req.body.unitCost ?? null,
        isAdjustment: req.body.isAdjustment ?? false,
        sortOrder: req.body.sortOrder ?? 0,
        remark: req.body.remark || null,
      };
      const comp = await storage.createItemComponent(data);
      res.json(comp);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/items/:id/components/:componentId", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getItemComponents(req.params.id);
      if (!existing.find(c => c.id === req.params.componentId)) {
        return res.status(404).json({ message: "구성품을 찾을 수 없습니다" });
      }
      const allowedFields = ["purchaseItemId", "itemName", "spec", "quantity", "unitCost", "isAdjustment", "sortOrder", "remark"];
      const fields: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          fields[key] = req.body[key];
        }
      }
      if (fields.quantity !== undefined && (typeof fields.quantity !== "number" || fields.quantity < 1)) {
        return res.status(400).json({ message: "수량은 1 이상이어야 합니다" });
      }
      const comp = await storage.updateItemComponent(req.params.componentId, fields);
      res.json(comp);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/items/:id/components/:componentId", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getItemComponents(req.params.id);
      if (!existing.find(c => c.id === req.params.componentId)) {
        return res.status(404).json({ message: "구성품을 찾을 수 없습니다" });
      }
      await storage.deleteItemComponent(req.params.componentId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items/bom-links", requireAuth, async (_req, res) => {
    try {
      const links = await storage.getPurchaseItemBomLinks();
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items/:id/linked-products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getLinkedProductsByPurchaseItemId(req.params.id);
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items", requireAuth, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const category1 = req.query.category1 as string | undefined;
      const items = await storage.getPurchaseItems({ search, category1 });
      const allVendors = await storage.getVendors();
      const vendorMap = new Map(allVendors.map(v => [v.id, v]));
      const result = items.map(item => ({
        ...item,
        vendor: item.vendorId ? vendorMap.get(item.vendorId) || null : null,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items/categories", requireAuth, async (_req, res) => {
    try {
      const categories = await storage.getPurchaseItemCategories();
      res.json(categories);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.getPurchaseItem(req.params.id);
      if (!item) return res.status(404).json({ message: "구매품을 찾을 수 없습니다" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-items", requireAuth, async (req, res) => {
    try {
      const parsed = insertPurchaseItemSchema.parse(req.body);
      const item = await storage.createPurchaseItem(parsed);
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-items/:id", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.cost !== undefined) body.cost = typeof body.cost === "string" ? parseInt(body.cost, 10) || 0 : body.cost;
      if (body.leadTimeDays !== undefined) body.leadTimeDays = typeof body.leadTimeDays === "string" ? (parseInt(body.leadTimeDays, 10) || null) : body.leadTimeDays;
      if (body.safetyStock !== undefined) body.safetyStock = typeof body.safetyStock === "string" ? (parseInt(body.safetyStock, 10) || null) : body.safetyStock;
      if (body.moq !== undefined) body.moq = typeof body.moq === "string" ? (parseInt(body.moq, 10) || null) : body.moq;
      const partial = insertPurchaseItemSchema.partial().parse(body);
      const item = await storage.updatePurchaseItem(req.params.id, partial);
      if (!item) return res.status(404).json({ message: "구매품을 찾을 수 없습니다" });
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/purchase-items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deletePurchaseItem(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-items/auto-link-vendors", requireAuth, async (_req, res) => {
    try {
      const items = await storage.getPurchaseItems();
      const allVendors = await storage.getVendors();
      let linked = 0;
      let alreadyLinked = 0;
      let noMatch = 0;

      for (const item of items) {
        if (item.vendorId) {
          alreadyLinked++;
          continue;
        }
        if (!item.defaultVendor) {
          noMatch++;
          continue;
        }
        const vendorName = item.defaultVendor.trim().toLowerCase();
        const match = allVendors.find(v =>
          v.companyName.trim().toLowerCase() === vendorName ||
          v.companyName.trim().toLowerCase().includes(vendorName) ||
          vendorName.includes(v.companyName.trim().toLowerCase())
        );
        if (match) {
          await storage.updatePurchaseItem(item.id, { vendorId: match.id });
          linked++;
        } else {
          noMatch++;
        }
      }

      res.json({
        message: `공급업체 연결 완료: 연결 ${linked}건, 기연결 ${alreadyLinked}건, 미매칭 ${noMatch}건`,
        linked,
        alreadyLinked,
        noMatch,
        total: items.length,
      });
    } catch (err: any) {
      console.error("[auto-link-vendors]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-items/excel-url", requireAuth, async (_req, res) => {
    try {
      const { listFilesByPath } = await import("./onedrive");
      const files = await listFilesByPath("2.공사/database");
      const excel = files.find((f: any) => f.name.toLowerCase() === "purchaselist.xlsx");
      if (!excel) return res.status(404).json({ message: "purchaselist.xlsx 파일을 찾을 수 없습니다" });
      res.json({ webUrl: excel.webUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-items/sync-onedrive", requireAuth, async (_req, res) => {
    try {
      const rows = await parsePurchaseListFromOneDrive();
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = await storage.getPurchaseItemByCode(row.itemCode);
        if (existing) {
          await storage.updatePurchaseItem(existing.id, row);
          updated++;
        } else {
          await storage.createPurchaseItem(row);
          created++;
        }
      }
      res.json({
        message: `동기화 완료: ${rows.length}건 처리 (신규 ${created}건, 업데이트 ${updated}건)`,
        total: rows.length,
        created,
        updated,
      });
    } catch (err: any) {
      console.error("[purchase-items sync]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-items/write-onedrive", requireAuth, async (_req, res) => {
    try {
      await writePurchaseListToOneDrive();
      res.json({ message: "구매품 목록이 OneDrive에 저장되었습니다" });
    } catch (err: any) {
      console.error("[purchaselist write]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/contract-templates", async (_req, res) => {
    try {
      const templates = await storage.getContractTemplates();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/contract-templates", requireAuth, async (req, res) => {
    try {
      const { name, content, isDefault } = req.body;
      if (!name || !content) return res.status(400).json({ message: "이름과 내용은 필수입니다" });
      const template = await storage.createContractTemplate({ name, content, isDefault: isDefault || false });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/contract-templates/:id", requireAuth, async (req, res) => {
    try {
      const { name, content, isDefault } = req.body;
      const fields: Record<string, any> = {};
      if (name !== undefined) fields.name = name;
      if (content !== undefined) fields.content = content;
      if (isDefault !== undefined) fields.isDefault = isDefault;
      const template = await storage.updateContractTemplate(req.params.id, fields);
      if (!template) return res.status(404).json({ message: "Not found" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/contract-templates/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteContractTemplate(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/staff", requireAuth, async (_req, res) => {
    try {
      const list = await storage.getStaffList();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/staff/:id", requireAuth, async (req, res) => {
    try {
      const s = await storage.getStaff(req.params.id);
      if (!s) return res.status(404).json({ message: "직원을 찾을 수 없습니다" });
      res.json(s);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staff", requireAuth, async (req, res) => {
    try {
      const { name, department, title, email, phone } = req.body;
      if (!name || !department) return res.status(400).json({ message: "이름과 부서는 필수입니다" });
      const created = await storage.createStaff({ name, department, title: title || null, email: email || null, phone: phone || null });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/staff/:id", requireAuth, async (req, res) => {
    try {
      const allowedFields = ["name", "department", "title", "email", "phone"];
      const patch: Record<string, any> = {};
      for (const key of allowedFields) {
        if (key in req.body) patch[key] = req.body[key];
      }
      const updated = await storage.updateStaff(req.params.id, patch);
      if (!updated) return res.status(404).json({ message: "직원을 찾을 수 없습니다" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/staff/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteStaff(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const uploadsDir = path.join(process.cwd(), "server", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const logoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowed.includes(ext)) {
        return cb(new Error("지원하지 않는 파일 형식입니다. PNG, JPG, SVG, WebP만 가능합니다."));
      }
      cb(null, true);
    },
  });

  const signatureUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `signature_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowed.includes(ext)) {
        return cb(new Error("지원하지 않는 파일 형식입니다. PNG, JPG, SVG, WebP만 가능합니다."));
      }
      cb(null, true);
    },
  });

  const express = await import("express");
  app.use("/uploads", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  });
  app.use("/uploads", express.default.static(uploadsDir));

  app.get("/api/company-settings", async (_req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      res.json(settings || {});
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/company-settings", requireAuth, async (req, res) => {
    try {
      const { companyName, businessNumber, representative, address, phone, fax, email, website, logoUrl, signatureUrl, logoData, signatureData, bankInfo, autoCc, emailTemplate, quotationNotesTemplate, salesDefaultStaffId, projectDefaultStaffId, poDefaultStaffId, financeDefaultStaffId, poDefaultPaymentTerms, poDefaultWarrantyTerms, poAutoCc, poEmailTemplate, poCalendarId, emailSubjectTemplate } = req.body;
      if (logoUrl === null) {
        const existing = await storage.getCompanySettings();
        if (existing?.logoUrl) {
          const oldPath = path.join(uploadsDir, path.basename(existing.logoUrl));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      if (signatureUrl === null) {
        const existing = await storage.getCompanySettings();
        if (existing?.signatureUrl) {
          const oldPath = path.join(uploadsDir, path.basename(existing.signatureUrl));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      const settings = await storage.saveCompanySettings({
        companyName: companyName || null,
        businessNumber: businessNumber || null,
        representative: representative || null,
        address: address || null,
        phone: phone || null,
        fax: fax || null,
        email: email || null,
        website: website || null,
        logoUrl: logoUrl === undefined ? undefined : (logoUrl || null),
        signatureUrl: signatureUrl === undefined ? undefined : (signatureUrl || null),
        logoData: logoData === undefined ? undefined : (logoData || null),
        signatureData: signatureData === undefined ? undefined : (signatureData || null),
        bankInfo: bankInfo || null,
        autoCc: autoCc || null,
        emailTemplate: emailTemplate || null,
        quotationNotesTemplate: quotationNotesTemplate === undefined ? undefined : (quotationNotesTemplate || null),
        salesDefaultStaffId: salesDefaultStaffId === undefined ? undefined : (salesDefaultStaffId || null),
        projectDefaultStaffId: projectDefaultStaffId === undefined ? undefined : (projectDefaultStaffId || null),
        poDefaultStaffId: poDefaultStaffId === undefined ? undefined : (poDefaultStaffId || null),
        financeDefaultStaffId: financeDefaultStaffId === undefined ? undefined : (financeDefaultStaffId || null),
        poDefaultPaymentTerms: poDefaultPaymentTerms === undefined ? undefined : (poDefaultPaymentTerms || null),
        poDefaultWarrantyTerms: poDefaultWarrantyTerms === undefined ? undefined : (poDefaultWarrantyTerms || null),
        poAutoCc: poAutoCc === undefined ? undefined : (poAutoCc || null),
        poEmailTemplate: poEmailTemplate === undefined ? undefined : (poEmailTemplate || null),
        poCalendarId: poCalendarId === undefined ? undefined : (poCalendarId || null),
        emailSubjectTemplate: emailSubjectTemplate === undefined ? undefined : (emailSubjectTemplate || null),
      });
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/company-settings/logo", requireAuth, logoUpload.single("logo"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
      const logoUrl = `/uploads/${req.file.filename}`;
      const existing = await storage.getCompanySettings();
      if (existing?.logoUrl) {
        const oldPath = path.join(uploadsDir, path.basename(existing.logoUrl));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype || "image/png";
      const logoData = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
      const settings = await storage.saveCompanySettings({ logoUrl, logoData });
      res.json({ logoUrl: settings.logoUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/company-settings/signature", requireAuth, signatureUpload.single("signature"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
      const signatureUrl = `/uploads/${req.file.filename}`;
      const existing = await storage.getCompanySettings();
      if (existing?.signatureUrl) {
        const oldPath = path.join(uploadsDir, path.basename(existing.signatureUrl));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype || "image/png";
      const signatureData = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
      const settings = await storage.saveCompanySettings({ signatureUrl, signatureData });
      res.json({ signatureUrl: settings.signatureUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  (async () => {
    try {
      const existing = await storage.getContractTemplates();
      if (existing.length === 0) {
        await storage.createContractTemplate({
          name: "기본 계약조건",
          isDefault: true,
          content: `■ 지급 및 납기

납기는 계약금 입금일을 기준으로 산정됩니다.

지급이 지연될 경우 납기 일정은 자동으로 조정될 수 있습니다.

잔금은 납품 완료 시 지급을 원칙으로 하며, 잔금 완납 전까지 장비의 소유권은 당사에 있습니다.

잔금이 지급되지 않을 경우 기술 지원 및 유지보수는 제한될 수 있습니다.

■ 보증 및 책임 범위

설치 및 시운전은 별도 계약 또는 발주 내역에 포함된 경우에 한하여 수행됩니다.

제품은 사전 협의된 사양 기준으로 공급되며, 설치 환경 및 당사 제공 범위 외 요인에 따른 시스템 전체 성능은 보장하지 않습니다.

사양 변경 또는 추가 요청 시 금액 및 납기는 조정될 수 있습니다.

납품일로부터 1년간 하드웨어에 한하여 무상 보증을 제공합니다.`,
        });
        console.log("[seed] 기본 계약조건 템플릿 생성됨");
      }
    } catch (err: any) {
      console.error("[seed] 계약조건 템플릿 시드 실패:", err.message);
    }
  })();

  (async () => {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS item_components (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            item_master_id VARCHAR NOT NULL,
            purchase_item_id VARCHAR,
            item_name TEXT NOT NULL,
            spec TEXT,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_cost INTEGER,
            is_adjustment BOOLEAN DEFAULT false,
            sort_order INTEGER DEFAULT 0,
            remark TEXT
          )
        `);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[startup] item_components table creation failed:", err.message);
    }
  })();

  app.post("/api/admin/migrate-data", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ message: "Invalid data" });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const tableOrder = [
          'quotation_items', 'quotations', 'inquiry_memos', 'inquiry_files', 'product_images',
          'payments', 'sales_invoices', 'purchase_invoices',
          'item_document', 'item_inventory', 'item_master', 'purchase_items',
          'companies', 'inquiries', 'projects', 'vendors', 'customers',
          'staff', 'company_settings', 'contract_templates'
        ];
        for (const t of tableOrder) {
          if (t !== 'onedrive_tokens') {
            await client.query(`DELETE FROM ${t}`);
          }
        }

        const insertOrder = [
          'customers', 'vendors', 'companies', 'projects', 'staff', 'company_settings', 'contract_templates',
          'inquiries', 'inquiry_files', 'inquiry_memos', 'product_images',
          'item_master', 'item_inventory', 'item_document', 'purchase_items',
          'sales_invoices', 'purchase_invoices', 'payments',
          'quotations', 'quotation_items'
        ];

        let totalInserted = 0;
        for (const table of insertOrder) {
          const rows = data[table];
          if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

          for (const row of rows) {
            const keys = Object.keys(row).filter(k => row[k] !== null && row[k] !== undefined);
            if (keys.length === 0) continue;
            const cols = keys.map(k => `"${k}"`);
            const vals = keys.map((_, i) => `$${i + 1}`);
            const values = keys.map(k => row[k]);

            await client.query(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING`,
              values
            );
          }
          totalInserted += rows.length;
        }

        await client.query('COMMIT');
        res.json({ ok: true, message: `Migration complete. ${totalInserted} rows processed.` });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[migrate] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders", async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const orders = await storage.getPurchaseOrders(year);
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/next-number", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const nextNumber = await storage.getNextOrderNumber(year);
      res.json({ nextNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Not found" });
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders", async (req, res) => {
    try {
      const { paymentDate, items, ...orderData } = req.body;
      if (!orderData.vendor) return res.status(400).json({ message: "구매처는 필수입니다" });
      if (orderData.expectedDeliveryDate === "") orderData.expectedDeliveryDate = null;
      if (!orderData.orderNumber) {
        const year = orderData.year || new Date().getFullYear();
        orderData.orderNumber = await storage.getNextOrderNumber(year);
      }
      const order = await storage.createPurchaseOrder(orderData);

      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.addPurchaseOrderItem({ ...item, purchaseOrderId: order.id });
        }
      }

      let payment = null;

      // 결제조건으로 자금계획 자동 생성
      const computedPaymentDate = paymentDate || calcDueDateFromTerms(order.paymentTerms, order.expectedDeliveryDate);
      if (computedPaymentDate && order.totalAmount) {
        payment = await storage.createPayment({
          type: "expense",
          companyName: order.vendor || "",
          description: order.description || `${order.orderNumber} ${order.vendor}`,
          amount: order.totalAmount || 0,
          plannedDate: computedPaymentDate,
          status: "planned",
        });
        await storage.updatePurchaseOrder(order.id, { paymentId: payment.id });
      }

      if (order.expectedDeliveryDate) {
        try {
          const settings = await storage.getCompanySettings();
          const calId = settings?.poCalendarId || "sales@aim-fa.com";
          const { createDeliveryEvent } = await import("./google-calendar");
          const eventId = await createDeliveryEvent(order.orderNumber || "", order.vendor || "", order.expectedDeliveryDate, calId);
          if (eventId) {
            await storage.updatePurchaseOrder(order.id, { calendarEventId: eventId });
          }
        } catch (calErr: any) {
          console.log(`Google Calendar 입고일정 등록 실패 (발주 생성은 계속): ${calErr.message}`);
        }
      }

      try {
        const yr = order.year || new Date().getFullYear();
        const sanitize = (s: string) => s.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
        const folderSegment = sanitize(`${order.orderNumber}_${sanitize(order.vendor || '')}_${sanitize(order.description || '')}`);
        const folderPath = `2.공사/${yr}/발주서/${folderSegment}`;
        const { ensureFolderByPath, getFolderWebUrl, uploadFileToFolder } = await import("./onedrive");
        const folderId = await ensureFolderByPath(folderPath);
        const webUrl = await getFolderWebUrl(folderId);
        const folderName = `일반::${folderSegment}`;
        await storage.updatePurchaseOrder(order.id, {
          onedriveFolderId: folderId,
          onedriveWebUrl: webUrl,
          folderName,
        });

        const staffName = order.staffId ? (await storage.getStaff(order.staffId))?.name || '' : '';
        const infoData = {
          orderNumber: order.orderNumber,
          vendor: order.vendor,
          description: order.description,
          supplyAmount: order.supplyAmount,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount,
          expectedDeliveryDate: order.expectedDeliveryDate,
          staffId: order.staffId,
          staffName,
          memo: order.memo,
          status: order.status,
          year: yr,
          createdAt: new Date().toISOString(),
        };
        await uploadFileToFolder(folderId, "info.json", Buffer.from(JSON.stringify(infoData, null, 2)));
      } catch (folderErr: any) {
        console.log(`OneDrive 발주 폴더 생성 실패 (발주 생성은 계속): ${folderErr.message}`);
      }

      const updated = await storage.getPurchaseOrder(order.id);
      res.status(201).json({ order: updated, payment });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/:id/download/pdf", async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "발주를 찾을 수 없습니다" });
      const { generatePurchaseOrderPDF } = await import("./purchase-order-export");
      const pdfBuf = await generatePurchaseOrderPDF(req.params.id);
      const safeNumber = (order.orderNumber || "발주서").replace(/[/\\:*?"<>|]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`발주서_${safeNumber}.pdf`)}"`);
      res.send(pdfBuf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/:id/send-email", requireAuth, async (req, res) => {
    try {
      const { to, subject, body, cc } = req.body;
      if (!to) return res.status(400).json({ message: "수신자 이메일이 필요합니다" });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) return res.status(400).json({ message: "올바른 이메일 형식이 아닙니다" });

      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "발주를 찾을 수 없습니다" });

      const companyInfo = await storage.getCompanySettings();
      const { generatePurchaseOrderPDF } = await import("./purchase-order-export");
      const pdfBuf = await generatePurchaseOrderPDF(req.params.id);

      const safeNumber = (order.orderNumber || "발주서").replace(/[/\\:*?"<>|]/g, "_");
      const pdfFilename = `발주서_${safeNumber}.pdf`;

      if (order.onedriveFolderId) {
        try {
          const { uploadFileToFolder } = await import("./onedrive");
          await uploadFileToFolder(order.onedriveFolderId, pdfFilename, pdfBuf);
        } catch (e: any) {
          console.log(`OneDrive 저장 실패 (이메일은 계속 진행): ${e.message}`);
        }
      }

      const companyName = companyInfo?.companyName || "에이아이엠";
      const emailSubject = subject || `[발주서] ${order.orderNumber || ""} - ${companyName}`;
      const emailBody = body
        ? `<div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</div>`
        : `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px;">
          <p>안녕하세요.</p>
          <p>${companyName}입니다.</p>
          <br/>
          <p>발주서를 첨부드리오니 확인 부탁드립니다.</p>
          <p><strong>발주번호:</strong> ${order.orderNumber || "-"}</p>
          ${order.expectedDeliveryDate ? `<p><strong>납품예정일:</strong> ${order.expectedDeliveryDate}</p>` : ""}
          <br/>
          <p>감사합니다.</p>
          <p>${companyName}</p>
          ${companyInfo?.phone ? `<p>Tel: ${companyInfo.phone}</p>` : ""}
          ${companyInfo?.email ? `<p>Email: ${companyInfo.email}</p>` : ""}
        </div>
      `;

      const ccList: string[] = [];
      if (cc) ccList.push(...cc.split(",").map((e: string) => e.trim()).filter(Boolean));
      if (companyInfo?.autoCc) {
        const autoCcEmails = companyInfo.autoCc.split(",").map((e: string) => e.trim()).filter(Boolean);
        for (const email of autoCcEmails) {
          if (!ccList.includes(email)) ccList.push(email);
        }
      }

      const { sendEmailWithAttachment } = await import("./gmail");
      const emailResult = await sendEmailWithAttachment({
        to,
        subject: emailSubject,
        htmlBody: emailBody,
        attachment: { filename: pdfFilename, content: pdfBuf },
        from: companyInfo?.email || undefined,
        cc: ccList.length > 0 ? ccList.join(", ") : undefined,
      });

      res.json({ success: true, messageId: emailResult.messageId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/:id/items", async (req, res) => {
    try {
      const items = await storage.getPurchaseOrderItems(req.params.id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/:id/items", async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Purchase order not found" });
      if (!req.body.itemName) return res.status(400).json({ message: "itemName is required" });
      const item = await storage.addPurchaseOrderItem({
        purchaseOrderId: req.params.id,
        itemCode: req.body.itemCode || null,
        itemName: req.body.itemName,
        spec: req.body.spec || null,
        brand: req.body.brand || null,
        quantity: req.body.quantity ?? 1,
        unitPrice: req.body.unitPrice ?? 0,
        amount: req.body.amount ?? 0,
        category1: req.body.category1 || null,
        sortOrder: req.body.sortOrder ?? 0,
        isAdjustment: req.body.isAdjustment ?? false,
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-order-items/:id", async (req, res) => {
    try {
      const item = await storage.updatePurchaseOrderItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/purchase-order-items/:id", async (req, res) => {
    try {
      await storage.deletePurchaseOrderItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/purchase-orders/:id", async (req, res) => {
    try {
      const { paymentDate, ...updateData } = req.body;
      const existing = await storage.getPurchaseOrder(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });

      const result = await storage.updatePurchaseOrder(req.params.id, updateData);

      const updated = await storage.getPurchaseOrder(req.params.id);

      if (existing.paymentId) {
        const paymentUpdates: Record<string, any> = {};

        if ("totalAmount" in updateData && updateData.totalAmount !== existing.totalAmount) {
          paymentUpdates.amount = updateData.totalAmount || 0;
        }
        if ("vendor" in updateData && updateData.vendor !== existing.vendor) {
          paymentUpdates.companyName = updateData.vendor || "";
        }
        if ("description" in updateData && updateData.description !== existing.description) {
          paymentUpdates.description = updateData.description || "";
        }
        if (paymentDate !== undefined) {
          paymentUpdates.plannedDate = paymentDate || null;
        } else if ("paymentTerms" in updateData || "expectedDeliveryDate" in updateData) {
          const newTerms = updateData.paymentTerms ?? existing.paymentTerms;
          const newDelivery = updateData.expectedDeliveryDate ?? existing.expectedDeliveryDate;
          const computed = calcDueDateFromTerms(newTerms, newDelivery);
          if (computed) paymentUpdates.plannedDate = computed;
        }

        if ("purchaseInvoiceId" in updateData) {
          const newInvoiceId = updateData.purchaseInvoiceId;
          const oldInvoiceId = existing.purchaseInvoiceId;
          if (newInvoiceId && newInvoiceId !== oldInvoiceId) {
            paymentUpdates.purchaseInvoiceId = newInvoiceId;
            try {
              const linkedInvoice = await storage.getPurchaseInvoice(newInvoiceId);
              if (linkedInvoice) {
                paymentUpdates.amount = linkedInvoice.totalAmount || 0;
                paymentUpdates.companyName = linkedInvoice.companyName || "";
                paymentUpdates.description = linkedInvoice.item || "";
              }
            } catch (invErr: any) {
              console.log(`계산서 조회 실패 (payment 업데이트 계속): ${invErr.message}`);
            }
          } else if (!newInvoiceId && oldInvoiceId) {
            paymentUpdates.purchaseInvoiceId = null;
          }
        }

        if (Object.keys(paymentUpdates).length > 0) {
          await storage.updatePayment(existing.paymentId, paymentUpdates);
        }
      } else if (paymentDate) {
        const payment = await storage.createPayment({
          type: "expense",
          companyName: updated?.vendor || existing.vendor || "",
          description: updated?.description || existing.description || "",
          amount: updated?.totalAmount || existing.totalAmount || 0,
          plannedDate: paymentDate,
          status: "planned",
        });
        await storage.updatePurchaseOrder(req.params.id, { paymentId: payment.id });
      }

      if ("expectedDeliveryDate" in updateData) {
        const newDate = updateData.expectedDeliveryDate;
        const oldDate = existing.expectedDeliveryDate;
        if (newDate !== oldDate) {
          try {
            const settings = await storage.getCompanySettings();
            const calId = settings?.poCalendarId || "sales@aim-fa.com";
            const { createDeliveryEvent, deleteCalendarEvent } = await import("./google-calendar");
            if (existing.calendarEventId) {
              const deleted = await deleteCalendarEvent(existing.calendarEventId, calId);
              if (deleted) {
                await storage.updatePurchaseOrder(req.params.id, { calendarEventId: null });
              }
            }
            if (newDate) {
              const latestOrder = await storage.getPurchaseOrder(req.params.id);
              const eventId = await createDeliveryEvent(
                latestOrder?.orderNumber || existing.orderNumber || "",
                latestOrder?.vendor || existing.vendor || "",
                newDate,
                calId
              );
              if (eventId) {
                await storage.updatePurchaseOrder(req.params.id, { calendarEventId: eventId });
              }
            }
          } catch (calErr: any) {
            console.log(`Google Calendar 입고일정 업데이트 실패: ${calErr.message}`);
          }
        }
      }

      const final = await storage.getPurchaseOrder(req.params.id);

      if (final?.onedriveFolderId) {
        try {
          const { uploadFileToFolder } = await import("./onedrive");
          const staffName = final.staffId ? (await storage.getStaff(final.staffId))?.name || '' : '';
          let existingCreatedAt: string | undefined;
          try {
            const { downloadFile, listFolderFiles: listFiles } = await import("./onedrive");
            const files = await listFiles(final.onedriveFolderId);
            const infoFile = files.find(f => f.name === 'info.json');
            if (infoFile) {
              const buf = await downloadFile(infoFile.id);
              const prev = JSON.parse(buf.toString('utf-8'));
              existingCreatedAt = prev?.createdAt;
            }
          } catch {}
          const infoData = {
            orderNumber: final.orderNumber,
            vendor: final.vendor,
            description: final.description,
            supplyAmount: final.supplyAmount,
            taxAmount: final.taxAmount,
            totalAmount: final.totalAmount,
            expectedDeliveryDate: final.expectedDeliveryDate,
            staffId: final.staffId,
            staffName,
            memo: final.memo,
            status: final.status,
            year: final.year,
            createdAt: existingCreatedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await uploadFileToFolder(final.onedriveFolderId, "info.json", Buffer.from(JSON.stringify(infoData, null, 2)));
        } catch (infoErr: any) {
          console.log(`OneDrive 발주 info.json 업데이트 실패: ${infoErr.message}`);
        }
      }

      res.json(final);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req, res) => {
    try {
      const existing = await storage.getPurchaseOrder(req.params.id);
      if (existing?.calendarEventId) {
        try {
          const settings = await storage.getCompanySettings();
          const calId = settings?.poCalendarId || "sales@aim-fa.com";
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(existing.calendarEventId, calId);
        } catch (calErr: any) {
          console.log(`Google Calendar 입고일정 삭제 실패: ${calErr.message}`);
        }
      }
      if (existing?.paymentId) {
        try {
          const linkedPayment = await storage.getPayment(existing.paymentId);
          if (linkedPayment?.purchaseInvoiceId) {
            console.log(`발주 삭제: payment ${existing.paymentId}는 계산서 ${linkedPayment.purchaseInvoiceId}에 연결되어 있으므로 유지`);
          } else {
            await storage.deletePayment(existing.paymentId);
          }
        } catch (payErr: any) {
          console.log(`연결된 결제 처리 실패: ${payErr.message}`);
        }
      }
      // N:M 링크 테이블 정리 (FK CASCADE 없으므로 직접 삭제)
      {
        const { purchaseOrderInvoiceLinks } = await import("@shared/schema");
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");
        await db.delete(purchaseOrderInvoiceLinks).where(eq(purchaseOrderInvoiceLinks.purchaseOrderId, req.params.id));
      }
      await storage.deletePurchaseOrder(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/sync", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string || req.body.year);
      if (!year) return res.status(400).json({ message: "year required" });

      const basePath = `2.공사/${year}/발주서`;
      let created = 0, updated = 0, deleted = 0;
      const allFolderNames = new Set<string>();

      async function syncFolders(path: string, status: string) {
        try {
          const folders = await listFoldersByPath(path);
          for (const folder of folders) {
            if (folder.name === "수입" || folder.name === "입고완료") continue;
            const folderKey = `${status}::${folder.name}`;
            allFolderNames.add(folderKey);

            const existing = await storage.getPurchaseOrderByFolderName(folderKey);
            const parts = folder.name.split("_");
            const orderNumber = parts[0] || folder.name;
            const vendor = parts[1] || "";
            const description = parts.slice(2).join("_") || "";

            if (existing) {
              await storage.updatePurchaseOrder(existing.id, {
                onedriveFolderId: folder.id,
                onedriveWebUrl: folder.webUrl,
                orderNumber,
                vendor,
                description,
                year,
                status,
              });
              updated++;
            } else {
              await storage.createPurchaseOrder({
                orderNumber,
                vendor,
                description,
                year,
                status,
                folderName: folderKey,
                onedriveFolderId: folder.id,
                onedriveWebUrl: folder.webUrl,
                receivingCompleted: status === "입고완료",
              });
              created++;
            }
          }
        } catch (e: any) {
          console.log(`[purchase-orders/sync] Folder not found: ${path} - ${e.message}`);
        }
      }

      await syncFolders(basePath, "일반");
      await syncFolders(`${basePath}/수입`, "수입");
      await syncFolders(`${basePath}/입고완료`, "입고완료");

      const existingOrders = await storage.getPurchaseOrders(year);
      const { purchaseOrderInvoiceLinks: poLinks } = await import("@shared/schema");
      const { db: dbInst } = await import("./db");
      const { eq: eqOp } = await import("drizzle-orm");
      for (const order of existingOrders) {
        if (order.folderName && !allFolderNames.has(order.folderName)) {
          await dbInst.delete(poLinks).where(eqOp(poLinks.purchaseOrderId, order.id));
          await storage.deletePurchaseOrder(order.id);
          deleted++;
        }
      }

      res.json({
        message: `동기화 완료: ${created}건 생성, ${updated}건 갱신, ${deleted}건 삭제`,
        created, updated, deleted, total: allFolderNames.size,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/purchase-orders/:id/files", async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Not found" });
      if (!order.onedriveFolderId) return res.json([]);
      const files = await listFolderFiles(order.onedriveFolderId);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/purchase-orders/:id/parse-amount", async (req, res) => {
    try {
      const { fileId } = req.body;
      if (!fileId) return res.status(400).json({ message: "fileId required" });

      const { downloadFile: dlFile } = await import("./onedrive");
      const buffer = await dlFile(fileId);
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) return res.status(400).json({ message: "시트를 찾을 수 없습니다" });

      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      let amount: number | null = null;

      for (let row = range.s.r; row <= range.e.r; row++) {
        // A~E열 중에서 합계 키워드 찾기
        let foundKeyword = false;
        for (let col = 0; col <= 4; col++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell) {
            const val = String(cell.v || "").replace(/\s+/g, "");
            if (val.includes("합계") || val.toLowerCase().includes("total")) {
              foundKeyword = true;
              break;
            }
          }
        }
        if (foundKeyword) {
          // 금액은 오른쪽 열(F~J)에서 가장 큰 숫자 찾기
          for (let col = range.e.c; col >= 5; col--) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.v != null) {
              const num = typeof cell.v === "number" ? Math.round(cell.v) : Math.round(Number(String(cell.v).replace(/[^0-9.-]/g, "")));
              if (num > 0) {
                amount = num;
                break;
              }
            }
          }
          break;
        }
      }

      if (amount === null) {
        return res.status(400).json({ message: "엑셀에서 '합 계(Total)' 항목을 찾을 수 없습니다" });
      }

      const vat = Math.round(amount * 0.1);
      res.json({ supplyAmount: amount, vat, totalAmount: amount + vat });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/recurring-expenses", async (_req: Request, res: Response) => {
    const list = await storage.getRecurringExpenses();
    res.json(list);
  });

  app.post("/api/recurring-expenses", async (req: Request, res: Response) => {
    const parsed = insertRecurringExpenseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const data = parsed.data;
    const freq = data.frequency || "monthly";
    if (!["weekly", "monthly", "yearly"].includes(freq)) return res.status(400).json({ message: "Invalid frequency" });
    if (freq === "weekly" && (data.weekday == null || data.weekday < 0 || data.weekday > 6)) return res.status(400).json({ message: "weekday must be 0-6" });
    if (freq === "yearly" && (data.paymentMonth == null || data.paymentMonth < 1 || data.paymentMonth > 12)) return res.status(400).json({ message: "paymentMonth must be 1-12" });
    if (freq !== "weekly" && (data.paymentDay < 0 || data.paymentDay > 31)) return res.status(400).json({ message: "paymentDay must be 0-31 (0=월말)" });
    if (data.totalInstallments != null && data.totalInstallments > 0) {
      const si = data.startInstallment ?? 1;
      if (si < 1 || si > data.totalInstallments) return res.status(400).json({ message: "startInstallment must be between 1 and totalInstallments" });
    }
    const row = await storage.createRecurringExpense(data);
    res.json(row);
  });

  app.patch("/api/recurring-expenses/:id", async (req: Request, res: Response) => {
    const partial = insertRecurringExpenseSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ message: partial.error.message });
    const data = partial.data;
    if (data.frequency && !["weekly", "monthly", "yearly"].includes(data.frequency)) return res.status(400).json({ message: "Invalid frequency" });
    if (data.weekday != null && (data.weekday < 0 || data.weekday > 6)) return res.status(400).json({ message: "weekday must be 0-6" });
    if (data.paymentMonth != null && (data.paymentMonth < 1 || data.paymentMonth > 12)) return res.status(400).json({ message: "paymentMonth must be 1-12" });
    if (data.paymentDay != null && (data.paymentDay < 0 || data.paymentDay > 31)) return res.status(400).json({ message: "paymentDay must be 0-31 (0=월말)" });
    if (data.totalInstallments != null && data.totalInstallments > 0) {
      const si = data.startInstallment ?? 1;
      if (si < 1 || si > data.totalInstallments) return res.status(400).json({ message: "startInstallment must be between 1 and totalInstallments" });
    }
    const updated = await storage.updateRecurringExpense(req.params.id, data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/recurring-expenses/:id", async (req: Request, res: Response) => {
    await storage.deleteRecurringExpense(req.params.id);
    res.json({ ok: true });
  });

  // 자금계획 월별 요약: 현재월 + 앞으로 N개월, 카테고리×월 집계 + 잔고 체인
  app.get("/api/cash-flow/monthly-summary", async (req: Request, res: Response) => {
    try {
      const { deriveCashCategory } = await import("@shared/cash-category");
      const now = new Date();
      const fromStr = (req.query.from as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const months = Math.min(Math.max(parseInt((req.query.months as string) || "4") || 4, 1), 12);
      const [fy, fm] = fromStr.split("-").map(Number);
      const ymList: string[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(fy, fm - 1 + i, 1);
        ymList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      const winStart = `${ymList[0]}-01`;
      const endD = new Date(fy, fm - 1 + months, 1);
      const winEndExcl = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-01`;
      const today = new Date().toISOString().slice(0, 10);

      // 현재 총 잔고 (계좌별 최신 balance 합)
      const balRes = await pool.query(
        `SELECT DISTINCT ON (account_id) account_id, balance
         FROM bank_transactions ORDER BY account_id, tx_date DESC, created_at DESC`
      );
      const currentBalance = balRes.rows.reduce((s: number, r: any) => s + Number(r.balance || 0), 0);

      // 은행거래(확정) — 윈도우
      const bankRes = await pool.query(
        `SELECT tx_date, counterparty, description, credit_amount, debit_amount, matched_sales_invoice_id
         FROM bank_transactions WHERE tx_date >= $1 AND tx_date < $2`,
        [winStart, winEndExcl]
      );
      const allPayments = await storage.getPayments();

      type Bucket = { income: Record<string, number>; expense: Record<string, number> };
      const M: Record<string, Bucket> = {};
      ymList.forEach(ym => (M[ym] = { income: {}, expense: {} }));
      const add = (ym: string, dir: "income" | "expense", cat: string, amt: number) => {
        if (!M[ym]) return;
        M[ym][dir][cat] = (M[ym][dir][cat] || 0) + amt;
      };

      const m0 = ymList[0];
      let m0ConfirmedNet = 0;

      for (const b of bankRes.rows as any[]) {
        const ym = String(b.tx_date).slice(0, 7);
        if (!M[ym]) continue;
        const credit = Number(b.credit_amount || 0);
        const debit = Number(b.debit_amount || 0);
        const cat = deriveCashCategory({
          type: credit > 0 ? "income" : "expense",
          companyName: b.counterparty,
          description: b.description,
          salesInvoiceId: b.matched_sales_invoice_id,
        });
        if (credit > 0) add(ym, "income", cat, credit);
        if (debit > 0) add(ym, "expense", cat, debit);
        if (ym === m0 && String(b.tx_date) <= today) m0ConfirmedNet += credit - debit;
      }

      for (const p of allPayments) {
        if (p.status === "completed") continue; // 확정은 은행거래로 집계됨(중복 방지)
        const d = p.plannedDate || p.actualDate;
        if (!d) continue;
        const ym = String(d).slice(0, 7);
        if (!M[ym]) continue;
        const amt = (p.actualAmount ?? p.amount ?? 0);
        if (amt === 0) continue;
        const cat = deriveCashCategory(p as any);
        add(ym, p.type === "income" ? "income" : "expense", cat, amt);
      }

      let opening = currentBalance - m0ConfirmedNet;
      const out = ymList.map(ym => {
        const inc = M[ym].income, exp = M[ym].expense;
        const incomeTotal = Object.values(inc).reduce((s, v) => s + v, 0);
        const expenseTotal = Object.values(exp).reduce((s, v) => s + v, 0);
        const net = incomeTotal - expenseTotal;
        const closing = opening + net;
        const row = { ym, opening, income: inc, expense: exp, incomeTotal, expenseTotal, net, closing };
        opening = closing;
        return row;
      });
      res.json({ currentBalance, months: out });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/recurring-expenses/generate", async (req: Request, res: Response) => {
    const { year, month } = req.query as { year: string; month: string };
    if (!year || !month) return res.status(400).json({ message: "year and month required" });
    const y = parseInt(year);
    const m = parseInt(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return res.status(400).json({ message: "invalid year/month" });
    const allRecurring = await storage.getRecurringExpenses();
    const active = allRecurring.filter(r => r.isActive === "true");

    const existingPayments = await storage.getPaymentsByMonth(y, m);
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;
    const lastDay = new Date(y, m, 0).getDate();

    const calcMonthsFrom = (startStr: string, ty: number, tm: number): number => {
      const [sy, sm] = startStr.split("-").map(Number);
      return (ty - sy) * 12 + (tm - sm);
    };

    let created = 0;
    for (const r of active) {
      const freq = r.frequency || "monthly";

      if (r.startDate) {
        const [sy, sm] = r.startDate.split("-").map(Number);
        if (y < sy || (y === sy && m < sm)) continue;
      }
      if (r.endDate) {
        const [ey, em] = r.endDate.split("-").map(Number);
        if (y > ey || (y === ey && m > em)) continue;
      }

      const hasTotalInstallments = r.totalInstallments != null && r.totalInstallments > 0;
      const startInst = r.startInstallment ?? 1;
      const totalInst = r.totalInstallments ?? 0;

      let currentInstallment = 0;
      if (hasTotalInstallments && r.startDate && freq === "monthly") {
        const monthsElapsed = calcMonthsFrom(r.startDate, y, m);
        currentInstallment = startInst + monthsElapsed;
        if (currentInstallment > totalInst) continue;
      }

      const resolveDay = (pd: number) => pd === 0 ? lastDay : Math.min(pd, lastDay);

      const buildPaymentData = (plannedDate: string, instIdx?: number, instTotal?: number) => ({
        type: "expense" as const,
        companyName: r.companyName,
        description: r.description,
        amount: r.amount,
        plannedDate,
        status: "planned" as const,
        category: r.category,
        recurringExpenseId: r.id,
        ...(instTotal && instIdx ? { splitIndex: instIdx, splitTotal: instTotal } : {}),
      });

      if (freq === "yearly") {
        const pm = r.paymentMonth ?? 1;
        if (pm !== m) continue;
        const day = resolveDay(r.paymentDay);
        const plannedDate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const alreadyExists = existingPayments.some(p =>
          p.recurringExpenseId === r.id && p.plannedDate === plannedDate
        ) || existingPayments.some(p =>
          p.category === r.category && p.description === r.description &&
          p.companyName === r.companyName && p.plannedDate === plannedDate
        );
        if (alreadyExists) continue;

        let yInstIdx: number | undefined;
        let yInstTotal: number | undefined;
        if (hasTotalInstallments && r.startDate) {
          const [sy, sm] = r.startDate.split("-").map(Number);
          const firstEligibleYear = sm <= pm ? sy : sy + 1;
          yInstIdx = startInst + (y - firstEligibleYear);
          yInstTotal = totalInst;
          if (yInstIdx < startInst || yInstIdx > totalInst) continue;
        }
        await storage.createPayment(buildPaymentData(plannedDate, yInstIdx, yInstTotal));
        created++;
      } else if (freq === "weekly") {
        const targetWeekday = (r.weekday != null && r.weekday >= 0 && r.weekday <= 6) ? r.weekday : 1;
        const dates: string[] = [];
        for (let d = 1; d <= lastDay; d++) {
          const dt = new Date(y, m - 1, d);
          if (dt.getDay() === targetWeekday) {
            dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
          }
        }
        for (const plannedDate of dates) {
          const alreadyExists = existingPayments.some(p =>
            p.recurringExpenseId === r.id && p.plannedDate === plannedDate
          ) || existingPayments.some(p =>
            p.category === r.category && p.description === r.description &&
            p.companyName === r.companyName && p.plannedDate === plannedDate
          );
          if (alreadyExists) continue;
          await storage.createPayment(buildPaymentData(plannedDate));
          created++;
        }
      } else {
        const day = resolveDay(r.paymentDay);
        const plannedDate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const alreadyExists = existingPayments.some(p =>
          p.recurringExpenseId === r.id && p.plannedDate?.startsWith(monthStr)
        ) || existingPayments.some(p =>
          p.category === r.category && p.description === r.description &&
          p.companyName === r.companyName && p.plannedDate?.startsWith(monthStr)
        );
        if (alreadyExists) continue;

        const instIdx = hasTotalInstallments ? currentInstallment : undefined;
        const instTotal = hasTotalInstallments ? totalInst : undefined;
        await storage.createPayment(buildPaymentData(plannedDate, instIdx, instTotal));
        created++;
      }
    }

    res.json({ created, total: active.length });
  });

  app.get("/api/bank-statements", async (req: Request, res: Response) => {
    try {
      const year = req.query.year as string;
      if (!year) return res.status(400).json({ message: "year required" });
      const { listFilesByPath } = await import("./onedrive");
      const files = await listFilesByPath(`4.경영지원/database/${year}`);
      const excelFiles = files.filter((f: any) =>
        /\.(xls|xlsx)$/i.test(f.name)
      );
      res.json(excelFiles);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-statements/import", async (req: Request, res: Response) => {
    try {
      const { fileId, fileName, year, month } = req.body;
      if (!fileId || !year || !month) return res.status(400).json({ message: "fileId, year, month required" });
      const { downloadFile } = await import("./onedrive");
      const { parseBankStatement } = await import("./excel-parser");
      const buffer = await downloadFile(fileId);
      const rows = parseBankStatement(buffer, parseInt(year), parseInt(month));

      if (rows.length === 0) {
        return res.json({ created: 0, total: 0, skipped: 0, fileName });
      }

      const existingPayments = await storage.getPaymentsByMonth(parseInt(year), parseInt(month));
      const existingKeys = new Set(
        existingPayments
          .filter(p => p.category === "은행거래")
          .map(p => `${p.plannedDate}|${p.amount}|${p.type}|${p.companyName || ""}|${p.description || ""}`)
      );

      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const key = `${row.date}|${row.amount}|${row.type}|${row.companyName || ""}|${row.description || ""}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        await storage.createPayment({
          type: row.type,
          category: "은행거래",
          companyName: row.companyName || null,
          description: row.description || null,
          amount: row.amount,
          plannedDate: row.date,
          actualDate: row.date,
          actualAmount: row.amount,
          status: "completed",
        });
        existingKeys.add(key);
        created++;
      }

      res.json({ created, total: rows.length, skipped, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowed.includes(ext)) {
        return cb(new Error("PDF 또는 이미지 파일만 업로드 가능합니다."));
      }
      cb(null, true);
    },
  });

  const generalUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".xlsx", ".xls", ".doc", ".docx", ".pptx", ".ppt", ".hwp", ".txt", ".csv", ".zip"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowed.includes(ext)) {
        return cb(new Error("지원하지 않는 파일 형식입니다."));
      }
      cb(null, true);
    },
  });

  const CUSTOMER_INFO_BASE = "4.경영지원/database/고객사";
  const VENDOR_INFO_BASE = "4.경영지원/database/구매처";

  app.post("/api/customers/:id/documents", docUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객을 찾을 수 없습니다" });
      const docType = req.body.type;
      if (!docType || !["사업자등록증", "통장사본"].includes(docType)) {
        return res.status(400).json({ message: "type은 사업자등록증 또는 통장사본이어야 합니다" });
      }
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${docType}${ext}`;
      const folderPath = getCustomerFolderPath(customer.companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, fileName, req.file.buffer);
      res.json({ ok: true, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function getCustomerFolderPath(companyName: string) {
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, "_");
    return `${CUSTOMER_INFO_BASE}/${safeName}`;
  }

  app.get("/api/customers/:id/documents", async (req: Request, res: Response) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객을 찾을 수 없습니다" });
      const folderPath = getCustomerFolderPath(customer.companyName);
      const { listFilesByPath } = await import("./onedrive");
      try {
        const files = await listFilesByPath(folderPath);
        res.json(files);
      } catch (e: any) {
        if (e.statusCode === 404) return res.json([]);
        throw e;
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/customers/:id/documents/:fileId/preview", async (req: Request, res: Response) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객을 찾을 수 없습니다" });
      const folderPath = getCustomerFolderPath(customer.companyName);
      const { listFilesByPath, downloadFile } = await import("./onedrive");
      try {
        const files = await listFilesByPath(folderPath);
        if (!files.some((f: any) => f.id === req.params.fileId)) {
          return res.status(403).json({ message: "이 고객의 문서가 아닙니다" });
        }
      } catch (e: any) {
        return res.status(404).json({ message: "폴더를 찾을 수 없습니다" });
      }
      const buffer = await downloadFile(req.params.fileId);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/customers/:id/sync-info", async (req: Request, res: Response) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "고객을 찾을 수 없습니다" });
      const contacts = await storage.getCompaniesByCustomerId(req.params.id);
      const info = {
        companyName: customer.companyName,
        businessNumber: customer.businessNumber,
        representative: customer.representative,
        address: customer.address,
        businessType: customer.businessType,
        businessCategory: customer.businessCategory,
        phone: customer.phone,
        fax: customer.fax,
        mgmtDepartment: customer.mgmtDepartment,
        mgmtContactName: customer.mgmtContactName,
        mgmtPhone: customer.mgmtPhone,
        mgmtEmail: customer.mgmtEmail,
        contacts: contacts.map(c => ({
          contactName: c.contactName,
          department: c.department,
          position: c.position,
          email: c.email,
          phone: c.phone,
        })),
        updatedAt: new Date().toISOString(),
      };
      const folderPath = getCustomerFolderPath(customer.companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, "company_info.json", Buffer.from(JSON.stringify(info, null, 2), "utf-8"));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function getCompanyFolderPath(companyName: string) {
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, "_");
    return `${CUSTOMER_INFO_BASE}/${safeName}`;
  }

  function getVendorFolderPath(companyName: string) {
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, "_");
    return `${VENDOR_INFO_BASE}/${safeName}`;
  }

  app.post("/api/companies/:id/documents", docUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "거래처를 찾을 수 없습니다" });
      const companyName = company.companyName;
      if (!companyName) return res.status(400).json({ message: "거래처명이 없습니다" });
      const docType = req.body.type;
      if (!docType || !["사업자등록증", "통장사본"].includes(docType)) {
        return res.status(400).json({ message: "type은 사업자등록증 또는 통장사본이어야 합니다" });
      }
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${docType}${ext}`;
      const folderPath = getCompanyFolderPath(companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, fileName, req.file.buffer);
      res.json({ ok: true, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/:id/documents", async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "거래처를 찾을 수 없습니다" });
      const companyName = company.companyName;
      if (!companyName) return res.json([]);
      const folderPath = getCompanyFolderPath(companyName);
      const { listFilesByPath } = await import("./onedrive");
      try {
        const files = await listFilesByPath(folderPath);
        res.json(files);
      } catch (e: any) {
        if (e.statusCode === 404) return res.json([]);
        throw e;
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/companies/:id/documents/:fileId/preview", async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "거래처를 찾을 수 없습니다" });
      if (!company.companyName) return res.status(400).json({ message: "거래처명이 없습니다" });
      const folderPath = getCompanyFolderPath(company.companyName);
      const { listFilesByPath, downloadFile } = await import("./onedrive");
      try {
        const files = await listFilesByPath(folderPath);
        if (!files.some((f: any) => f.id === req.params.fileId)) {
          return res.status(403).json({ message: "이 거래처의 문서가 아닙니다" });
        }
      } catch (e: any) {
        return res.status(404).json({ message: "폴더를 찾을 수 없습니다" });
      }
      const buffer = await downloadFile(req.params.fileId);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/companies/:id/sync-info", async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "거래처를 찾을 수 없습니다" });
      const companyName = company.companyName;
      if (!companyName) return res.status(400).json({ message: "거래처명이 없습니다" });
      let customerInfo: any = null;
      if (company.customerId) {
        const customer = await storage.getCustomer(company.customerId);
        if (customer) {
          customerInfo = {
            companyName: customer.companyName,
            businessNumber: customer.businessNumber,
            representative: customer.representative,
            address: customer.address,
            phone: customer.phone,
          };
        }
      }
      const info = {
        companyName,
        contactName: company.contactName,
        department: company.department,
        position: company.position,
        email: company.email,
        phone: company.phone,
        fax: company.fax,
        customer: customerInfo,
        updatedAt: new Date().toISOString(),
      };
      const folderPath = getCompanyFolderPath(companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, "company_info.json", Buffer.from(JSON.stringify(info, null, 2), "utf-8"));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Vendor documents ---
  app.get("/api/vendors/:id/documents", async (req: Request, res: Response) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: "구매처를 찾을 수 없습니다" });
      const folderPath = getVendorFolderPath(vendor.companyName);
      const { listFilesByPath } = await import("./onedrive");
      try {
        const files = await listFilesByPath(folderPath);
        res.json(files);
      } catch (e: any) {
        if (e.statusCode === 404) return res.json([]);
        throw e;
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors/:id/documents", docUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: "구매처를 찾을 수 없습니다" });
      const docType = req.body.type;
      if (!docType || !["사업자등록증", "통장사본"].includes(docType)) {
        return res.status(400).json({ message: "type은 사업자등록증 또는 통장사본이어야 합니다" });
      }
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${docType}${ext}`;
      const folderPath = getVendorFolderPath(vendor.companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, fileName, req.file.buffer);
      res.json({ ok: true, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vendors/:id/sync-info", async (req: Request, res: Response) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: "구매처를 찾을 수 없습니다" });
      const lines = [
        `상호명: ${vendor.companyName || ""}`,
        `사업자등록번호: ${vendor.businessNumber || ""}`,
        `대표자: ${vendor.representative || ""}`,
        `주소: ${vendor.address || ""}`,
        `전화번호: ${vendor.phone || ""}`,
        `팩스: ${vendor.fax || ""}`,
        `거래은행: ${vendor.bankName || ""}`,
        `계좌번호: ${vendor.bankAccount || ""}`,
        `담당자: ${vendor.contactName || ""}`,
        `담당자이메일: ${vendor.contactEmail || ""}`,
        `담당자전화: ${vendor.contactPhone || ""}`,
        `메모: ${vendor.memo || ""}`,
        ``,
        `업데이트: ${new Date().toISOString()}`,
      ];
      const folderPath = getVendorFolderPath(vendor.companyName);
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, "업체정보.txt", Buffer.from(lines.join("\n"), "utf-8"));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Purchase order document upload ---
  app.post("/api/purchase-orders/:id/documents", generalUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "발주를 찾을 수 없습니다" });
      if (!order.onedriveFolderId) return res.status(400).json({ message: "OneDrive 폴더가 연결되지 않은 발주입니다" });
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });
      const { uploadFileToFolder } = await import("./onedrive");
      await uploadFileToFolder(order.onedriveFolderId, req.file.originalname, req.file.buffer);
      res.json({ ok: true, fileName: req.file.originalname });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Inquiry document upload (contracts etc.) ---
  app.get("/api/inquiries/:id/documents", async (req: Request, res: Response) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      if (!inquiry.onedriveFolderId) return res.json([]);
      const { listFolderFiles } = await import("./onedrive");
      const allFiles = await listFolderFiles(inquiry.onedriveFolderId);
      const contractFiles = allFiles.filter((f: any) => f.name.startsWith("계약서"));
      res.json(contractFiles);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/inquiries/:id/documents", generalUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      if (!inquiry.onedriveFolderId) return res.status(400).json({ message: "OneDrive 폴더가 연결되지 않은 인콰이어리입니다" });
      if (!req.file) return res.status(400).json({ message: "파일을 선택해주세요" });
      const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
      const fileName = baseName.startsWith("계약서") ? req.file.originalname : `계약서_${req.file.originalname}`;
      const { uploadFileToFolder } = await import("./onedrive");
      await uploadFileToFolder(inquiry.onedriveFolderId, fileName, req.file.buffer);
      res.json({ ok: true, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const memoSaveFn = async (msg: { messageId: number; text: string; fromName: string; chatId: string }) => {
    const existing = await storage.getTelegramMemoByMessageId(msg.messageId, msg.chatId);
    if (!existing) {
      await storage.createTelegramMemo({
        messageId: msg.messageId,
        text: msg.text,
        fromName: msg.fromName,
        chatId: msg.chatId,
        isRead: false,
      });
    }
  };

  app.post("/api/telegram/memos/poll-now", async (_req, res) => {
    try {
      const { fetchNewMessages, isConfigured } = await import("./telegram");
      if (!isConfigured()) return res.status(400).json({ message: "Telegram not configured" });
      await fetchNewMessages(memoSaveFn);
      const count = await storage.getUnreadMemoCount();
      res.json({ success: true, unreadCount: count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  if (process.env.NODE_ENV !== "development") {
    import("./telegram").then(({ startPolling, isConfigured }) => {
      if (isConfigured()) {
        startPolling(memoSaveFn);
        console.log("[Telegram] Memo polling started (30s interval, production)");
      }
    }).catch(() => {});
  } else {
    console.log("[Telegram] Memo polling disabled in development (use POST /api/telegram/memos/poll-now)");
  }

  app.get("/api/calendar/events", async (req, res) => {
    try {
      const start = req.query.start as string;
      const end = req.query.end as string;
      if (!start || !end) return res.status(400).json({ message: "start and end required" });

      const unified: Array<{
        id: string;
        title: string;
        date: string;
        endDate?: string | null;
        startTime?: string | null;
        endTime?: string | null;
        category: string;
        color: string;
        completed?: boolean;
        sourceType: string;
        sourceId?: string;
        description?: string | null;
        assigneeName?: string | null;
        taskType?: string | null;
      }> = [];

      const [customEvents, allInquiryTasks, allProjectTasks, allPOTasks, allFinanceTasks] = await Promise.all([
        storage.getCalendarEvents(start, end),
        pool.query(`SELECT t.*, i.inquiry_number, i.customer_name, s.name as staff_name FROM inquiry_tasks t JOIN inquiries i ON t.inquiry_id = i.id LEFT JOIN staff s ON t.staff_id = s.id WHERE t.due_date IS NOT NULL AND t.due_date >= $1 AND t.due_date <= $2`, [start, end]),
        pool.query(`SELECT t.*, p.project_number, p.customer_name, s.name as staff_name FROM project_tasks t JOIN projects p ON t.project_id = p.id LEFT JOIN staff s ON t.staff_id = s.id WHERE t.due_date IS NOT NULL AND t.due_date >= $1 AND t.due_date <= $2`, [start, end]),
        pool.query(`SELECT t.*, po.order_number, po.vendor FROM purchase_order_tasks t JOIN purchase_orders po ON t.purchase_order_id = po.id WHERE t.due_date IS NOT NULL AND t.due_date >= $1 AND t.due_date <= $2`, [start, end]),
        pool.query(`SELECT * FROM finance_tasks WHERE due_date IS NOT NULL AND due_date >= $1 AND due_date <= $2`, [start, end]),
      ]);

      for (const e of customEvents) {
        unified.push({
          id: `custom-${e.id}`,
          title: e.title,
          date: e.date,
          endDate: e.endDate,
          startTime: e.startTime,
          endTime: e.endTime,
          category: "custom",
          color: e.color || "purple",
          completed: e.completed ?? false,
          sourceType: "calendarEvent",
          sourceId: e.id,
          description: e.description,
        });
      }

      for (const r of allInquiryTasks.rows) {
        unified.push({
          id: `itask-${r.id}`,
          title: `[${r.inquiry_number}] ${r.content}`,
          date: r.due_date,
          startTime: r.due_time,
          category: "task",
          color: "blue",
          completed: r.completed,
          sourceType: "inquiryTask",
          sourceId: r.inquiry_id,
          description: r.customer_name,
          assigneeName: r.staff_name || null,
          taskType: r.task_type || "todo",
        });
      }

      for (const r of allProjectTasks.rows) {
        unified.push({
          id: `ptask-${r.id}`,
          title: `[${r.project_number}] ${r.content}`,
          date: r.due_date,
          startTime: r.due_time,
          category: "task",
          color: "blue",
          completed: r.completed,
          sourceType: "projectTask",
          sourceId: r.project_id,
          description: r.customer_name,
          assigneeName: r.staff_name || null,
          taskType: r.task_type || "todo",
        });
      }

      for (const r of allPOTasks.rows) {
        unified.push({
          id: `potask-${r.id}`,
          title: `[${r.order_number}] ${r.content}`,
          date: r.due_date,
          startTime: r.due_time,
          category: "task",
          color: "blue",
          completed: r.completed,
          sourceType: "poTask",
          sourceId: r.purchase_order_id,
          description: r.vendor,
          taskType: r.task_type || "schedule",
        });
      }

      for (const r of allFinanceTasks.rows) {
        unified.push({
          id: `ftask-${r.id}`,
          title: r.content,
          date: r.due_date,
          startTime: r.due_time,
          category: "task",
          color: "blue",
          completed: r.completed,
          sourceType: "financeTask",
          sourceId: r.id,
          description: r.category,
          taskType: r.task_type || "schedule",
        });
      }

      const poRows = await pool.query(
        `SELECT id, order_number, vendor, expected_delivery_date FROM purchase_orders WHERE expected_delivery_date IS NOT NULL AND expected_delivery_date >= $1 AND expected_delivery_date <= $2`,
        [start, end]
      );
      for (const r of poRows.rows) {
        unified.push({
          id: `delivery-${r.id}`,
          title: `[입고] ${r.order_number} - ${r.vendor}`,
          date: r.expected_delivery_date,
          category: "delivery",
          color: "orange",
          sourceType: "purchaseOrder",
          sourceId: r.id,
        });
      }

      const projRows = await pool.query(
        `SELECT id, project_number, customer_name, delivery_date, completion_date FROM projects WHERE (delivery_date IS NOT NULL AND delivery_date >= $1 AND delivery_date <= $2) OR (completion_date IS NOT NULL AND completion_date >= $3 AND completion_date <= $4)`,
        [start, end, start, end]
      );
      for (const r of projRows.rows) {
        if (r.delivery_date && r.delivery_date >= start && r.delivery_date <= end) {
          unified.push({
            id: `projdel-${r.id}`,
            title: `[납품] ${r.project_number} - ${r.customer_name}`,
            date: r.delivery_date,
            category: "deadline",
            color: "red",
            sourceType: "project",
            sourceId: r.id,
          });
        }
        if (r.completion_date && r.completion_date >= start && r.completion_date <= end) {
          unified.push({
            id: `projcomp-${r.id}`,
            title: `[완료] ${r.project_number} - ${r.customer_name}`,
            date: r.completion_date,
            category: "deadline",
            color: "red",
            sourceType: "project",
            sourceId: r.id,
          });
        }
      }

      const payRows = await pool.query(
        `SELECT id, type, company_name, description, amount, planned_date, status FROM payments WHERE planned_date IS NOT NULL AND planned_date >= $1 AND planned_date <= $2 AND status = 'planned'`,
        [start, end]
      );
      for (const r of payRows.rows) {
        const label = r.type === "income" ? "수납" : "지급";
        const amtStr = r.amount ? ` ${(r.amount / 10000).toFixed(0)}만원` : "";
        unified.push({
          id: `pay-${r.id}`,
          title: `[${label}] ${r.company_name || r.description || "미지정"}${amtStr}`,
          date: r.planned_date,
          category: "payment",
          color: "green",
          sourceType: "payment",
          sourceId: r.id,
          description: r.description,
        });
      }

      unified.sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        if (dc !== 0) return dc;
        const ta = a.startTime || "";
        const tb = b.startTime || "";
        return ta.localeCompare(tb);
      });

      res.json(unified);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/calendar/tasks/:compositeId/complete", async (req, res) => {
    try {
      const { compositeId } = req.params;
      const { completed } = req.body;
      if (typeof completed !== "boolean") return res.status(400).json({ message: "completed (boolean) required" });

      let table: string;
      let realId: string;

      if (compositeId.startsWith("itask-")) {
        table = "inquiry_tasks";
        realId = compositeId.replace("itask-", "");
      } else if (compositeId.startsWith("ptask-")) {
        table = "project_tasks";
        realId = compositeId.replace("ptask-", "");
      } else if (compositeId.startsWith("potask-")) {
        table = "purchase_order_tasks";
        realId = compositeId.replace("potask-", "");
      } else if (compositeId.startsWith("ftask-")) {
        table = "finance_tasks";
        realId = compositeId.replace("ftask-", "");
      } else if (compositeId.startsWith("custom-")) {
        table = "calendar_events";
        realId = compositeId.replace("custom-", "");
      } else {
        table = "calendar_events";
        realId = compositeId;
      }

      const updateResult = await pool.query(`UPDATE ${table} SET completed = $1 WHERE id = $2`, [completed, realId]);
      if (updateResult.rowCount === 0) return res.status(404).json({ message: "Task not found" });

      if (completed && (table === "inquiry_tasks" || table === "project_tasks")) {
        try {
          const taskRow = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [realId]);
          const task = taskRow.rows[0];
          if (task?.calendar_event_id) {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(task.calendar_event_id);
            await pool.query(`UPDATE ${table} SET calendar_event_id = NULL WHERE id = $1`, [realId]);
          }
        } catch (syncErr: any) {
          console.log(`Google 동기화 실패 (완료 처리는 계속): ${syncErr.message}`);
        }
      }

      res.json({ success: true, completed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/calendar/events", async (req, res) => {
    try {
      const { insertCalendarEventSchema } = await import("@shared/schema");
      const data = insertCalendarEventSchema.parse({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      const event = await storage.createCalendarEvent(data);
      res.status(201).json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/calendar/events/:id", async (req, res) => {
    try {
      const existing = await storage.getCalendarEvent(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const event = await storage.updateCalendarEvent(req.params.id, req.body);
      res.json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/calendar/events/:id", async (req, res) => {
    try {
      const existing = await storage.getCalendarEvent(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      await storage.deleteCalendarEvent(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/google/oauth/status", requireAuth, async (_req, res) => {
    const { hasGoogleOAuthCredentials, isGoogleOAuthConfigured } = await import("./google-auth");
    res.json({
      hasCredentials: hasGoogleOAuthCredentials(),
      configured: isGoogleOAuthConfigured(),
    });
  });

  app.get("/api/google/oauth/authorize", requireAuth, async (req, res) => {
    try {
      const { hasGoogleOAuthCredentials, getGoogleAuthUrl, resolveGoogleRedirectUri } = await import("./google-auth");
      if (!hasGoogleOAuthCredentials()) {
        return res.status(400).json({ message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required" });
      }
      const redirectUri = resolveGoogleRedirectUri(req);
      res.redirect(getGoogleAuthUrl(redirectUri));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/google/oauth/callback", async (req, res) => {
    try {
      const code = req.query.code as string | undefined;
      if (!code) {
        return res.status(400).send("Missing authorization code");
      }
      const { exchangeGoogleAuthCode, resolveGoogleRedirectUri } = await import("./google-auth");
      const redirectUri = resolveGoogleRedirectUri(req);
      const tokens = await exchangeGoogleAuthCode(code, redirectUri);
      if (!tokens.refresh_token) {
        return res.status(400).send(
          "No refresh token returned. Revoke app access in Google Account settings and try again with prompt=consent.",
        );
      }
      res.type("html").send(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>Google OAuth</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px;">
<h2>Google OAuth 설정 완료</h2>
<p>아래 <code>GOOGLE_REFRESH_TOKEN</code> 값을 Railway Variables에 추가하세요.</p>
<pre style="background:#f4f4f4;padding:12px;overflow:auto;word-break:break-all;">${tokens.refresh_token}</pre>
<p>Redirect URI: <code>${redirectUri}</code></p>
</body></html>`);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/google-calendar/personal-events", async (req, res) => {
    try {
      const start = req.query.start as string;
      const end = req.query.end as string;
      if (!start || !end) return res.status(400).json({ message: "start and end required" });
      const { fetchPersonalCalendarEvents } = await import("./google-calendar");
      const events = await fetchPersonalCalendarEvents(start, end);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/monthly-balances", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string);
      const month = parseInt(req.query.month as string);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "valid year and month (1-12) required" });
      }
      const balance = await storage.getMonthlyBalance(year, month);
      res.json(balance ?? null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/monthly-balances", async (req, res) => {
    try {
      const year = parseInt(req.body.year);
      const month = parseInt(req.body.month);
      const openingBalance = parseInt(req.body.openingBalance);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || isNaN(openingBalance)) {
        return res.status(400).json({ message: "valid year, month (1-12), and openingBalance required" });
      }
      const balance = await storage.upsertMonthlyBalance(year, month, openingBalance);
      res.json(balance);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bank-accounts/balances", async (req, res) => {
    try {
      const balances = await storage.getAccountLatestBalances();
      const total = balances.reduce((s, r) => s + r.balance, 0);
      res.json({ balances, total });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bank-accounts", async (req, res) => {
    try {
      const accounts = await storage.getBankAccounts();
      res.json(accounts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-accounts", async (req, res) => {
    try {
      const { bankName, accountNumber, accountAlias, isActive } = req.body;
      if (!accountAlias) return res.status(400).json({ message: "accountAlias is required" });
      const account = await storage.createBankAccount({ bankName: bankName || "KB국민은행", accountNumber, accountAlias, isActive: isActive !== false });
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/bank-accounts/:id", async (req, res) => {
    try {
      const account = await storage.updateBankAccount(req.params.id, req.body);
      if (!account) return res.status(404).json({ message: "Account not found" });
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bank-accounts/:id", async (req, res) => {
    try {
      await storage.deleteAllBankTransactionsByAccount(req.params.id);
      await storage.deleteBankAccount(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bank-transactions", async (req, res) => {
    try {
      const { accountId, startDate, endDate, txType, limit, offset } = req.query;
      const transactions = await storage.getBankTransactions({
        accountId: accountId as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        txType: txType === "credit" || txType === "debit" ? txType : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(transactions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/bank-transactions/:id", async (req, res) => {
    try {
      const tx = await storage.updateBankTransaction(req.params.id, req.body);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bank-transactions/:id", async (req, res) => {
    try {
      await storage.deleteBankTransaction(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bank-transactions/:id/candidates", async (req, res) => {
    try {
      const allTx = await storage.getBankTransactions({});
      const tx = allTx.find((t: any) => t.id === req.params.id);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });

      const isCredit = !!(tx.creditAmount && tx.creditAmount > 0);
      const amount = tx.creditAmount || tx.debitAmount || 0;
      const txDateMs = tx.txDate ? new Date(tx.txDate).getTime() : 0;
      const dayMs = 86400000;

      const payments = await storage.getPayments();
      const projects = await storage.getProjects();
      const projectMap = new Map(projects.map((p: any) => [p.id, p]));

      const candidates = payments
        .filter((p: any) => {
          if (p.status === "completed") return false;
          if (p.type !== (isCredit ? "income" : "expense")) return false;
          const pAmt = p.amount || 0;
          if (amount > 0 && pAmt > 0) {
            if (Math.abs(pAmt - amount) / Math.max(amount, pAmt) > 0.2) return false;
          }
          if (p.plannedDate && txDateMs > 0) {
            if (Math.abs(new Date(p.plannedDate).getTime() - txDateMs) > 30 * dayMs) return false;
          }
          return true;
        })
        .map((p: any) => {
          const proj = p.projectId ? projectMap.get(p.projectId) : null;
          return { ...p, projectNumber: proj?.projectNumber || null, projectCustomerName: proj?.customerName || null };
        })
        .sort((a: any, b: any) => {
          if (a.plannedDate && b.plannedDate && txDateMs > 0) {
            return Math.abs(new Date(a.plannedDate).getTime() - txDateMs) -
                   Math.abs(new Date(b.plannedDate).getTime() - txDateMs);
          }
          return 0;
        });

      res.json(candidates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-transactions/:id/match", async (req, res) => {
    try {
      const txId = req.params.id;
      const { paymentId, noMatch } = req.body;
      const allTx = await storage.getBankTransactions({});
      const tx = allTx.find((t: any) => t.id === txId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });

      if (noMatch) {
        await storage.updateBankTransaction(txId, { matchStatus: "ignored", matchedPaymentId: null });
      } else {
        if (!paymentId) return res.status(400).json({ message: "paymentId required" });
        const payment = await storage.getPayment(paymentId);
        if (!payment) return res.status(404).json({ message: "결제 항목을 찾을 수 없습니다" });
        const matchAmount = tx.creditAmount || tx.debitAmount || 0;
        await storage.updateBankTransaction(txId, { matchStatus: "manual", matchedPaymentId: paymentId });
        await storage.updatePayment(paymentId, {
          status: "completed",
          actualDate: tx.txDate || undefined,
          actualAmount: matchAmount || undefined,
          amount: matchAmount || payment.amount || 0,
        });
        // 부분매칭: 은행거래액이 결제예정액보다 작으면 잔액을 원래 기한으로 새 예정 건 분리 (잔액 소실 방지)
        const remainder = (payment.amount || 0) - matchAmount;
        if (matchAmount > 0 && remainder > 0) {
          await storage.createPayment({
            type: payment.type,
            projectId: payment.projectId ?? undefined,
            salesInvoiceId: payment.salesInvoiceId ?? undefined,
            purchaseInvoiceId: payment.purchaseInvoiceId ?? undefined,
            companyName: payment.companyName ?? undefined,
            description: payment.description ? `${payment.description} 잔여` : "잔여",
            amount: remainder,
            plannedDate: payment.plannedDate ?? undefined,
            status: "planned",
          });
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bank-transactions/:id/match", async (req, res) => {
    try {
      const txId = req.params.id;
      const allTx = await storage.getBankTransactions({});
      const tx = allTx.find((t: any) => t.id === txId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });

      const prevPaymentId = tx.matchedPaymentId;
      await storage.updateBankTransaction(txId, {
        matchStatus: "unmatched",
        matchedPaymentId: null,
        matchedSalesInvoiceId: null,
        matchedPurchaseInvoiceId: null,
      });
      if (prevPaymentId) {
        await storage.updatePayment(prevPaymentId, {
          status: "planned",
          actualDate: null,
          actualAmount: null,
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const bankUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  // Auto-match helper: match unmatched credit transactions to sales invoices by company name
  // 업체명 정규화: 주식회사/(주)/(유) 등 제거, 공백 제거, 소문자
  function normalizeCompanyName(s: string): string {
    return s.replace(/주식회사|유한회사|\(주\)|\(유\)|\s/g, "").toLowerCase();
  }

  async function performAutoMatch(accountId?: string): Promise<number> {
    const txQuery = accountId
      ? `SELECT id, counterparty, credit_amount FROM bank_transactions
         WHERE match_status IN ('unmatched') AND credit_amount > 0 AND counterparty IS NOT NULL AND counterparty != ''
         AND matched_sales_invoice_id IS NULL AND account_id = $1`
      : `SELECT id, counterparty, credit_amount FROM bank_transactions
         WHERE match_status IN ('unmatched') AND credit_amount > 0 AND counterparty IS NOT NULL AND counterparty != ''
         AND matched_sales_invoice_id IS NULL`;
    const txResult = accountId
      ? await pool.query(txQuery, [accountId])
      : await pool.query(txQuery);

    if (txResult.rows.length === 0) return 0;

    // 미수금 계산서 (공급금액 + 세액 포함 total_amount 기준)
    // 매출계산서 status 도메인은 'pending'(미수)/'paid'(완료) → 완납 아닌 건을 후보로
    const invoiceResult = await pool.query(
      `SELECT id, company_name, total_amount FROM sales_invoices
       WHERE (status IS NULL OR status != 'paid') AND company_name IS NOT NULL`
    );
    if (invoiceResult.rows.length === 0) return 0;

    let matched = 0;
    for (const tx of txResult.rows) {
      const cpNorm = normalizeCompanyName((tx.counterparty as string).trim());
      const txAmount = Number(tx.credit_amount);

      // 업체명 매칭 후보 추출 (정규화된 이름 포함 여부)
      const nameCandidates = invoiceResult.rows.filter((inv: any) => {
        const cnNorm = normalizeCompanyName((inv.company_name as string).trim());
        return cnNorm && (cpNorm.includes(cnNorm) || cnNorm.includes(cpNorm));
      });
      if (nameCandidates.length === 0) continue;

      // 금액 20% 이내인 후보로 좁힘
      const amountCandidates = nameCandidates.filter((inv: any) => {
        const invAmount = Number(inv.total_amount);
        if (!invAmount) return false;
        return Math.abs(txAmount - invAmount) / Math.max(txAmount, invAmount) <= 0.2;
      });

      // 후보가 정확히 1건일 때만 자동 매칭
      if (amountCandidates.length !== 1) continue;

      await pool.query(
        `UPDATE bank_transactions SET matched_sales_invoice_id = $1, match_status = 'auto' WHERE id = $2`,
        [amountCandidates[0].id, tx.id]
      );
      matched++;
    }
    return matched;
  }

  // Auto-match helper: match unmatched debit transactions to purchase invoices by vendor name
  // 개인사업자 → 대표자명으로 매칭, 법인 → 업체명으로 매칭
  async function performAutoMatchDebit(accountId?: string): Promise<{ matched: number; candidates: any[] }> {
    const txQuery = accountId
      ? `SELECT id, counterparty, debit_amount, tx_date FROM bank_transactions
         WHERE match_status = 'unmatched' AND debit_amount > 0 AND counterparty IS NOT NULL AND counterparty != ''
         AND matched_payment_id IS NULL AND account_id = $1`
      : `SELECT id, counterparty, debit_amount, tx_date FROM bank_transactions
         WHERE match_status = 'unmatched' AND debit_amount > 0 AND counterparty IS NOT NULL AND counterparty != ''
         AND matched_payment_id IS NULL`;
    const txResult = accountId ? await pool.query(txQuery, [accountId]) : await pool.query(txQuery);
    if (txResult.rows.length === 0) return { matched: 0, candidates: [] };

    // 공급업체 목록 (개인사업자→대표자명, 법인→업체명)
    const vendorResult = await pool.query(
      `SELECT id, company_name, representative, business_type FROM vendors`
    );

    const normalize = (s: string) => (s || "").replace(/\s|\(주\)|주식회사|유한회사|\(유\)/g, "").toLowerCase();

    let matched = 0;
    const candidates: any[] = [];

    for (const tx of txResult.rows) {
      const cp = normalize(tx.counterparty as string);

      // 거래처명으로 업체 찾기
      const vendor = vendorResult.rows.find((v: any) => {
        const matchName = (v.business_type === "개인" && v.representative)
          ? normalize(v.representative)
          : normalize(v.company_name);
        // 업체명도 보조로 확인
        const companyNorm = normalize(v.company_name);
        return cp.includes(matchName) || matchName.includes(cp) ||
               cp.includes(companyNorm) || companyNorm.includes(cp);
      });

      if (!vendor) continue;

      // 해당 업체의 결제계획 없는 계산서 찾기 (금액 일치)
      const invResult = await pool.query(
        `SELECT pi.id, pi.total_amount, pi.issue_date
         FROM purchase_invoices pi
         LEFT JOIN payments p ON p.purchase_invoice_id = pi.id
         WHERE pi.vendor_id = $1 AND pi.status != 'completed'
         GROUP BY pi.id
         HAVING COUNT(p.id) = 0
         AND pi.total_amount = $2`,
        [vendor.id, tx.debit_amount]
      );

      candidates.push({
        txId: tx.id,
        txDate: tx.tx_date,
        txAmount: tx.debit_amount,
        counterparty: tx.counterparty,
        vendorId: vendor.id,
        vendorName: vendor.company_name,
        businessType: vendor.business_type,
        matchedInvoices: invResult.rows,
      });

      // 정확히 1건 일치하면 자동 연결
      if (invResult.rows.length === 1) {
        const inv = invResult.rows[0];
        // payment 레코드 생성 후 연결
        const payRes = await pool.query(
          `INSERT INTO payments (type, purchase_invoice_id, company_name, amount, actual_amount, planned_date, actual_date, status)
           VALUES ('expense', $1, $2, $3, $3, $4, $4, 'completed') RETURNING id`,
          [inv.id, vendor.company_name, tx.debit_amount, tx.tx_date]
        );
        await pool.query(
          `UPDATE bank_transactions SET matched_payment_id = $1, match_status = 'auto' WHERE id = $2`,
          [payRes.rows[0].id, tx.id]
        );
        matched++;
      }
    }
    return { matched, candidates };
  }

  app.post("/api/bank-transactions/auto-match", async (req, res) => {
    try {
      const { accountId } = req.body;
      const matched = await performAutoMatch(accountId || undefined);
      res.json({ matched });
    } catch (err: any) {
      console.error("[auto-match]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // 출금 자동매칭 (매입계산서 ↔ 은행거래)
  app.post("/api/bank-transactions/auto-match-debit", async (req, res) => {
    try {
      const { accountId } = req.body;
      const result = await performAutoMatchDebit(accountId || undefined);
      res.json(result);
    } catch (err: any) {
      console.error("[auto-match-debit]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // 미연결 입출금을 이름+금액 단일후보로 자동연결 (이름 있는 것만, 같은금액 여러 후보는 제외)
  app.post("/api/bank-transactions/auto-link-by-amount", async (_req, res) => {
    try {
      const norm = (s: string | null | undefined) =>
        (s || "").replace(/\s|\(주\)|주식회사|유한회사|\(유\)|㈜/g, "").toLowerCase();
      const sMatched = new Set((await pool.query(`SELECT DISTINCT matched_sales_invoice_id m FROM bank_transactions WHERE matched_sales_invoice_id IS NOT NULL`)).rows.map((r: any) => r.m));
      const pMatched = new Set((await pool.query(`SELECT DISTINCT matched_purchase_invoice_id m FROM bank_transactions WHERE matched_purchase_invoice_id IS NOT NULL`)).rows.map((r: any) => r.m));
      const sInv = await storage.getSalesInvoices();
      const pInv = await storage.getPurchaseInvoices();
      const dep = (await pool.query(
        `SELECT id, counterparty, credit_amount, debit_amount FROM bank_transactions
         WHERE matched_sales_invoice_id IS NULL AND matched_purchase_invoice_id IS NULL
           AND counterparty IS NOT NULL AND counterparty <> ''`
      )).rows;
      let creditLinked = 0, debitLinked = 0;
      for (const t of dep as any[]) {
        const cn = norm(t.counterparty);
        if (!cn) continue;
        const credit = Number(t.credit_amount || 0), debit = Number(t.debit_amount || 0);
        if (credit > 0) {
          const cand = sInv.filter(i => norm(i.companyName) === cn && (i.totalAmount || 0) === credit && !sMatched.has(i.id));
          if (cand.length === 1) {
            await pool.query(`UPDATE bank_transactions SET matched_sales_invoice_id=$1, match_status='manual' WHERE id=$2`, [cand[0].id, t.id]);
            sMatched.add(cand[0].id); creditLinked++;
          }
        } else if (debit > 0) {
          const cand = pInv.filter(i => norm(i.companyName) === cn && (i.totalAmount || 0) === debit && !pMatched.has(i.id));
          if (cand.length === 1) {
            await pool.query(`UPDATE bank_transactions SET matched_purchase_invoice_id=$1, match_status='manual' WHERE id=$2`, [cand[0].id, t.id]);
            pMatched.add(cand[0].id); debitLinked++;
          }
        }
      }
      res.json({ creditLinked, debitLinked });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 출금 수동 연결 (계산서 여러 건 중 사용자가 선택한 1건)
  app.post("/api/bank-transactions/manual-match-debit", async (req, res) => {
    try {
      const { txId, invoiceId, vendorName, amount, txDate } = req.body;
      if (!txId || !invoiceId) return res.status(400).json({ message: "txId, invoiceId 필수" });
      // 이미 매칭된 거래면 중복 payment 생성 방지
      const existingTx = await pool.query(
        `SELECT matched_payment_id FROM bank_transactions WHERE id = $1`,
        [txId]
      );
      if (existingTx.rows.length === 0) return res.status(404).json({ message: "거래를 찾을 수 없습니다" });
      if (existingTx.rows[0].matched_payment_id) {
        return res.status(409).json({ message: "이미 매칭된 거래입니다", paymentId: existingTx.rows[0].matched_payment_id });
      }
      const payRes = await pool.query(
        `INSERT INTO payments (type, purchase_invoice_id, company_name, amount, actual_amount, planned_date, actual_date, status)
         VALUES ('expense', $1, $2, $3, $3, $4, $4, 'completed') RETURNING id`,
        [invoiceId, vendorName, amount, txDate]
      );
      await pool.query(
        `UPDATE bank_transactions SET matched_payment_id = $1, match_status = 'manual' WHERE id = $2`,
        [payRes.rows[0].id, txId]
      );
      res.json({ ok: true, paymentId: payRes.rows[0].id });
    } catch (err: any) {
      console.error("[manual-match-debit]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // 출금 매칭 후보 조회 (금액 불일치 포함 — 사용자가 수동 선택)
  app.get("/api/bank-transactions/debit-candidates", async (req, res) => {
    try {
      const result = await performAutoMatchDebit(undefined);
      res.json(result.candidates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-transactions/dedup", async (req, res) => {
    try {
      const { accountId } = req.body as { accountId?: string };

      // 같은 계좌+날짜+출금+입금 그룹에서 중복 찾기
      const dupQuery = accountId
        ? `SELECT account_id, tx_date, debit_amount, credit_amount, array_agg(id ORDER BY
            CASE WHEN description IN ('인터넷출금이체','타행이체','자동이체','ATM출금','계좌이체','카드대금','현금인출','자동납부','지로') THEN 1 ELSE 0 END,
            id
          ) AS ids
          FROM bank_transactions
          WHERE account_id = $1
          GROUP BY account_id, tx_date, debit_amount, credit_amount, counterparty
          HAVING COUNT(*) > 1`
        : `SELECT account_id, tx_date, debit_amount, credit_amount, array_agg(id ORDER BY
            CASE WHEN description IN ('인터넷출금이체','타행이체','자동이체','ATM출금','계좌이체','카드대금','현금인출','자동납부','지로') THEN 1 ELSE 0 END,
            id
          ) AS ids
          FROM bank_transactions
          GROUP BY account_id, tx_date, debit_amount, credit_amount, counterparty
          HAVING COUNT(*) > 1`;

      const dupResult = accountId
        ? await pool.query(dupQuery, [accountId])
        : await pool.query(dupQuery);

      let deletedCount = 0;
      for (const row of dupResult.rows) {
        const ids: string[] = row.ids;
        const keepId = ids[0];
        const deleteIds = ids.slice(1);

        // 삭제될 행의 연결 정보가 있으면 남기는 행에 병합
        for (const delId of deleteIds) {
          const delRow = await pool.query(
            `SELECT matched_sales_invoice_id, matched_payment_id, match_status FROM bank_transactions WHERE id = $1`,
            [delId]
          );
          if (delRow.rows.length > 0) {
            const d = delRow.rows[0];
            if (d.matched_sales_invoice_id || d.matched_payment_id) {
              await pool.query(
                `UPDATE bank_transactions SET
                  matched_sales_invoice_id = COALESCE(matched_sales_invoice_id, $1),
                  matched_payment_id = COALESCE(matched_payment_id, $2),
                  match_status = CASE WHEN match_status IN ('unmatched','ignored') THEN $3 ELSE match_status END
                WHERE id = $4`,
                [d.matched_sales_invoice_id, d.matched_payment_id, d.match_status, keepId]
              );
            }
          }
          await pool.query(`DELETE FROM bank_transactions WHERE id = $1`, [delId]);
          deletedCount++;
        }
      }

      res.json({ deleted: deletedCount, groups: dupResult.rows.length });
    } catch (err: any) {
      console.error("[bank dedup]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-transactions/import", bankUpload.single("file"), async (req, res) => {
    try {
      const accountId = req.body.accountId as string;
      if (!accountId) return res.status(400).json({ message: "accountId is required" });
      if (!req.file) return res.status(400).json({ message: "파일이 필요합니다" });

      const parsed = parseKBBankStatementFromBuffer(req.file.buffer);
      if (parsed.length === 0) return res.status(400).json({ message: "파싱된 거래내역이 없습니다. 파일 형식을 확인해주세요." });

      // Deduplicate rows within the same file
      const seenHashes = new Set<string>();
      const uniqueParsed = parsed.filter(r => {
        if (seenHashes.has(r.importHash)) return false;
        seenHashes.add(r.importHash);
        return true;
      });

      const hashes = uniqueParsed.map(r => r.importHash);
      const existing = await storage.getBankTransactionsByHash(accountId, hashes);
      const existingHashes = new Set(existing.map(e => e.importHash));

      const importBatch = new Date().toISOString().slice(0, 19).replace("T", " ");
      const toInsert = uniqueParsed
        .filter(r => !existingHashes.has(r.importHash))
        .map(r => ({
          accountId,
          txDate: r.txDate,
          txTime: r.txTime,
          description: r.description,
          counterparty: r.counterparty,
          debitAmount: r.debitAmount,
          creditAmount: r.creditAmount,
          balance: r.balance,
          importHash: r.importHash,
          importBatch,
          matchStatus: "unmatched",
        }));

      const inserted = await storage.createBankTransactions(toInsert);
      const autoMatched = await performAutoMatch(accountId);
      res.json({ total: parsed.length, inserted: inserted.length, skipped: parsed.length - inserted.length, autoMatched });
    } catch (err: any) {
      console.error("[bank import]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-transactions/import-auto", bankUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 필요합니다" });

      // 1. Parse account info from file header
      const accountInfo = parseKBBankAccountInfo(req.file.buffer);

      // 2. Find matching existing account by account number or create new one
      const accounts = await storage.getBankAccounts();
      let account = accounts.find(a =>
        accountInfo.accountNumber &&
        a.accountNumber &&
        a.accountNumber.replace(/-/g, "") === accountInfo.accountNumber.replace(/-/g, "")
      );
      let isNew = false;
      if (!account) {
        account = await storage.createBankAccount({
          bankName: accountInfo.bankName,
          accountNumber: accountInfo.accountNumber,
          accountAlias: accountInfo.accountAlias,
          isActive: true,
        });
        isNew = true;
      }

      // 3. Parse and import transactions
      const parsed = parseKBBankStatementFromBuffer(req.file.buffer);
      if (parsed.length === 0) {
        return res.json({ accountId: account.id, accountAlias: account.accountAlias, isNew, total: 0, inserted: 0, skipped: 0, autoMatched: 0 });
      }

      const seenHashes = new Set<string>();
      const uniqueParsed = parsed.filter(r => {
        if (seenHashes.has(r.importHash)) return false;
        seenHashes.add(r.importHash);
        return true;
      });

      const hashes = uniqueParsed.map(r => r.importHash);
      const existing = await storage.getBankTransactionsByHash(account.id, hashes);
      const existingHashes = new Set(existing.map(e => e.importHash));

      const importBatch = new Date().toISOString().slice(0, 19).replace("T", " ");
      const toInsert = uniqueParsed
        .filter(r => !existingHashes.has(r.importHash))
        .map(r => ({
          accountId: account!.id,
          txDate: r.txDate,
          txTime: r.txTime,
          description: r.description,
          counterparty: r.counterparty,
          debitAmount: r.debitAmount,
          creditAmount: r.creditAmount,
          balance: r.balance,
          importHash: r.importHash,
          importBatch,
          matchStatus: "unmatched",
        }));

      const inserted = await storage.createBankTransactions(toInsert);
      const autoMatched = await performAutoMatch(account.id);
      res.json({
        accountId: account.id,
        accountAlias: account.accountAlias,
        isNew,
        total: parsed.length,
        inserted: inserted.length,
        skipped: uniqueParsed.length - inserted.length,
        autoMatched,
      });
    } catch (err: any) {
      console.error("[bank import-auto]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/cleanup-corrupt-payments", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM payments WHERE actual_date < '1901-01-01' RETURNING id`
      );
      res.json({ deleted: result.rowCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== 수금관리 (미수금) API =====

  // 고객사별 수금현황 요약
  app.get("/api/receivables/by-customer", async (req, res) => {
    try {
      const { year } = req.query;
      const yearNum = year ? parseInt(year as string) : undefined;

      const invoices = await storage.getSalesInvoices();
      const customers = await storage.getCustomers();
      const customerMap = new Map(customers.map((c: any) => [c.id, c]));

      // 은행내역 입금 집계 (계산서별)
      const txResult = await pool.query(
        `SELECT matched_sales_invoice_id, SUM(credit_amount) as collected
         FROM bank_transactions
         WHERE matched_sales_invoice_id IS NOT NULL
         GROUP BY matched_sales_invoice_id`
      );
      const collectedByInvoice = new Map<string, number>();
      for (const row of txResult.rows) {
        collectedByInvoice.set(row.matched_sales_invoice_id, Number(row.collected || 0));
      }

      let filtered = invoices;
      if (yearNum) {
        filtered = invoices.filter((inv: any) => {
          const d = inv.writeDate || inv.issueDate || inv.plannedIssueDate;
          if (!d) return inv.year === yearNum;
          return new Date(d).getFullYear() === yearNum;
        });
      }

      // 고객사별 집계
      const byCustomer = new Map<string, {
        customerId: string | null;
        companyName: string;
        invoiceCount: number;
        totalBilled: number;
        totalCollected: number;
        outstanding: number;
        invoices: any[];
      }>();

      for (const inv of filtered as any[]) {
        const key = inv.customerId ?? `__no_customer__${inv.companyName ?? ""}`;
        const cust = inv.customerId ? customerMap.get(inv.customerId) : null;
        const companyName = cust?.companyName ?? inv.companyName ?? "미지정";
        if (!byCustomer.has(key)) {
          byCustomer.set(key, { customerId: inv.customerId ?? null, companyName, invoiceCount: 0, totalBilled: 0, totalCollected: 0, outstanding: 0, invoices: [] });
        }
        const entry = byCustomer.get(key)!;
        const billed = inv.totalAmount ?? 0;
        const collected = inv.status === "paid"
          ? (collectedByInvoice.get(inv.id) ?? billed)
          : (collectedByInvoice.get(inv.id) ?? 0);
        entry.invoiceCount++;
        entry.totalBilled += billed;
        entry.totalCollected += collected;
        entry.outstanding += billed - collected;
        entry.invoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          plannedIssueDate: inv.plannedIssueDate,
          totalAmount: billed,
          collectedAmount: collected,
          outstanding: billed - collected,
          status: inv.status,
        });
      }

      const result = Array.from(byCustomer.values())
        .sort((a, b) => b.outstanding - a.outstanding);

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/receivables", async (req, res) => {
    try {
      const { year } = req.query;
      const yearNum = year ? parseInt(year as string) : undefined;

      const invoices = await storage.getSalesInvoices();
      const projects = await storage.getProjects();
      const projectMap = new Map(projects.map((p: any) => [p.id, p]));

      // 결제(income) 집계: 완료 입금액 합산 + 미완료 결제계획의 가장 이른 예정일
      const allPayments = await storage.getPayments();
      const completedByInvoice = new Map<string, number>();
      const plannedByInvoice = new Map<string, string>();
      for (const p of allPayments) {
        if (p.type !== "income" || !p.salesInvoiceId) continue;
        if (p.status === "completed") {
          completedByInvoice.set(p.salesInvoiceId, (completedByInvoice.get(p.salesInvoiceId) || 0) + (p.actualAmount || p.amount || 0));
        } else if (p.plannedDate) {
          const cur = plannedByInvoice.get(p.salesInvoiceId);
          if (!cur || p.plannedDate < cur) plannedByInvoice.set(p.salesInvoiceId, p.plannedDate);
        }
      }

      const allTx = await pool.query(
        `SELECT matched_sales_invoice_id, SUM(credit_amount) as collected, COUNT(*) as tx_count, array_agg(id) as tx_ids
         FROM bank_transactions
         WHERE matched_sales_invoice_id IS NOT NULL
         GROUP BY matched_sales_invoice_id`
      );
      const txByInvoice = new Map<string, { collected: number; txCount: number; txIds: string[] }>();
      for (const row of allTx.rows) {
        txByInvoice.set(row.matched_sales_invoice_id, {
          collected: Number(row.collected || 0),
          txCount: Number(row.tx_count || 0),
          txIds: row.tx_ids || [],
        });
      }

      let filtered = invoices;
      if (yearNum) {
        filtered = invoices.filter((inv: any) => {
          const d = inv.writeDate || inv.issueDate;
          if (!d) return inv.year === yearNum;
          return new Date(d).getFullYear() === yearNum;
        });
      }

      const enriched = filtered.map((inv: any) => {
        const proj = inv.projectId ? projectMap.get(inv.projectId) : null;
        const txInfo = txByInvoice.get(inv.id);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          companyName: inv.companyName,
          customerId: inv.customerId,
          projectId: inv.projectId,
          projectNumber: proj?.projectNumber ?? null,
          writeDate: inv.writeDate,
          issueDate: inv.issueDate,
          totalAmount: inv.totalAmount ?? 0,
          supplyAmount: inv.supplyAmount,
          taxAmount: inv.taxAmount,
          status: inv.status,
          collectedAmount: invoiceCollected(inv.totalAmount ?? 0, txInfo?.collected ?? 0, completedByInvoice.get(inv.id) ?? 0, inv.status === 'paid'),
          linkedTxCount: txInfo?.txCount ?? 0,
          linkedTxIds: txInfo?.txIds ?? [],
          nextPaymentDate: plannedByInvoice.get(inv.id) ?? null,
        };
      });

      const totalBilled = enriched.reduce((s: number, i: any) => s + (i.totalAmount ?? 0), 0);
      const totalCollected = enriched.reduce((s: number, i: any) => s + i.collectedAmount, 0);

      res.json({
        invoices: enriched,
        summary: {
          totalBilled,
          totalCollected,
          totalOutstanding: totalBilled - totalCollected,
          invoiceCount: enriched.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 매입채무(지급관리) — /api/receivables 미러
  app.get("/api/payables", async (req, res) => {
    try {
      const { year } = req.query;
      const yearNum = year ? parseInt(year as string) : undefined;

      const invoices = await storage.getPurchaseInvoices();
      const projects = await storage.getProjects();
      const projectMap = new Map(projects.map((p: any) => [p.id, p]));

      const allTx = await pool.query(
        `SELECT matched_purchase_invoice_id, SUM(debit_amount) as paid, COUNT(*) as tx_count, array_agg(id) as tx_ids
         FROM bank_transactions
         WHERE matched_purchase_invoice_id IS NOT NULL
         GROUP BY matched_purchase_invoice_id`
      );
      const txByInvoice = new Map<string, { paid: number; txCount: number; txIds: string[] }>();
      for (const row of allTx.rows) {
        txByInvoice.set(row.matched_purchase_invoice_id, {
          paid: Number(row.paid || 0),
          txCount: Number(row.tx_count || 0),
          txIds: row.tx_ids || [],
        });
      }

      let filtered = invoices;
      if (yearNum) {
        filtered = invoices.filter((inv: any) => {
          const d = inv.writeDate || inv.issueDate;
          if (!d) return inv.year === yearNum;
          return new Date(d).getFullYear() === yearNum;
        });
      }

      const enriched = filtered.map((inv: any) => {
        const proj = inv.projectId ? projectMap.get(inv.projectId) : null;
        const txInfo = txByInvoice.get(inv.id);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          companyName: inv.companyName,
          vendorId: inv.vendorId,
          projectId: inv.projectId,
          projectNumber: proj?.projectNumber ?? null,
          writeDate: inv.writeDate,
          issueDate: inv.issueDate,
          totalAmount: inv.totalAmount ?? 0,
          supplyAmount: inv.supplyAmount,
          taxAmount: inv.taxAmount,
          status: inv.status,
          paidAmount: inv.status === 'completed'
            ? (txInfo?.txCount ? (txInfo.paid ?? 0) : (inv.totalAmount ?? 0))
            : (txInfo?.paid ?? 0),
          linkedTxCount: txInfo?.txCount ?? 0,
          linkedTxIds: txInfo?.txIds ?? [],
        };
      });

      const totalBilled = enriched.reduce((s: number, i: any) => s + (i.totalAmount ?? 0), 0);
      const totalPaid = enriched.reduce((s: number, i: any) => s + i.paidAmount, 0);

      res.json({
        invoices: enriched,
        summary: {
          totalBilled,
          totalPaid,
          totalOutstanding: totalBilled - totalPaid,
          invoiceCount: enriched.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payables/complete-invoices", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }

      const invResult = await pool.query(
        `UPDATE purchase_invoices SET status = 'completed'
         WHERE id = ANY($1::varchar[]) AND status != 'completed'
         RETURNING id`,
        [ids]
      );
      const updatedInvoiceIds = invResult.rows.map((r: any) => r.id);

      let updatedPayments = 0;
      if (updatedInvoiceIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'completed',
            actual_date = COALESCE(actual_date, planned_date),
            actual_amount = COALESCE(actual_amount, amount)
           WHERE type = 'expense'
             AND status != 'completed'
             AND purchase_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [updatedInvoiceIds]
        );
        updatedPayments = pmtResult.rowCount ?? 0;
      }

      res.json({ updatedInvoices: invResult.rowCount ?? 0, updatedPayments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payables/uncomplete-invoices", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }
      const invResult = await pool.query(
        `UPDATE purchase_invoices SET status = 'pending'
         WHERE id = ANY($1::varchar[]) AND status = 'completed'
         RETURNING id`,
        [ids]
      );
      const revertedIds = invResult.rows.map((r: any) => r.id);
      let updatedPayments = 0;
      if (revertedIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'planned', actual_date = NULL, actual_amount = NULL
           WHERE type = 'expense' AND status = 'completed'
             AND purchase_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [revertedIds]
        );
        updatedPayments = pmtResult.rowCount ?? 0;
      }
      res.json({ updatedInvoices: invResult.rowCount ?? 0, updatedPayments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/bulk-uncomplete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }
      const result = await pool.query(
        `UPDATE payments SET status = 'planned', actual_date = NULL, actual_amount = NULL
         WHERE id = ANY($1::varchar[]) AND status = 'completed'
         RETURNING id`,
        [ids]
      );
      res.json({ updated: result.rowCount ?? 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/receivables/uncomplete-invoices", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }
      const invResult = await pool.query(
        `UPDATE sales_invoices SET status = 'pending'
         WHERE id = ANY($1::varchar[]) AND status = 'paid'
         RETURNING id`,
        [ids]
      );
      const revertedIds = invResult.rows.map((r: any) => r.id);
      let updatedPayments = 0;
      if (revertedIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'planned', actual_date = NULL, actual_amount = NULL
           WHERE type = 'income' AND status = 'completed'
             AND sales_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [revertedIds]
        );
        updatedPayments = pmtResult.rowCount ?? 0;
      }
      res.json({ updatedInvoices: invResult.rowCount ?? 0, updatedPayments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/receivables/complete-invoices", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids 배열 필수" });
      }
      if (!ids.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "ids 배열의 모든 항목은 문자열이어야 합니다" });
      }

      const invResult = await pool.query(
        `UPDATE sales_invoices SET status = 'paid'
         WHERE id = ANY($1::varchar[]) AND status != 'paid'
         RETURNING id`,
        [ids]
      );
      const updatedInvoiceIds = invResult.rows.map((r: any) => r.id);

      let updatedPayments = 0;
      if (updatedInvoiceIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'completed',
            actual_date = COALESCE(actual_date, planned_date),
            actual_amount = COALESCE(actual_amount, amount)
           WHERE type = 'income'
             AND status != 'completed'
             AND sales_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [updatedInvoiceIds]
        );
        updatedPayments = pmtResult.rowCount ?? 0;
      }

      res.json({ updatedInvoices: invResult.rowCount ?? 0, updatedPayments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/receivables/bulk-complete", async (req, res) => {
    try {
      const { beforeYear } = req.body;
      if (!beforeYear || isNaN(Number(beforeYear))) {
        return res.status(400).json({ message: "beforeYear is required" });
      }
      const cutoffDate = `${Number(beforeYear)}-01-01`;

      const invResult = await pool.query(
        `UPDATE sales_invoices SET status = 'paid'
         WHERE (write_date < $1 OR (write_date IS NULL AND issue_date < $1))
           AND status != 'paid'
         RETURNING id`,
        [cutoffDate]
      );

      const invoiceIds = invResult.rows.map((r: any) => r.id);

      let updatedPayments = 0;
      if (invoiceIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'completed'
           WHERE type = 'income'
             AND status != 'completed'
             AND sales_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [invoiceIds]
        );
        updatedPayments = pmtResult.rowCount ?? 0;
      }

      res.json({
        updatedInvoices: invResult.rowCount ?? 0,
        updatedPayments,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 매입계산서 일괄 지급완료 처리 (연도/월 기준)
  app.post("/api/purchase-invoices/bulk-complete", async (req, res) => {
    try {
      const { toYear, toMonth } = req.body;
      // toYear: 이 연도까지, toMonth: 이 월까지 (없으면 연도 전체)
      if (!toYear || isNaN(Number(toYear))) {
        return res.status(400).json({ message: "toYear 필수" });
      }
      const year = Number(toYear);
      const month = toMonth ? Number(toMonth) : 12;
      // YYYY-MM-DD 마지막 날 계산
      const lastDay = new Date(year, month, 0).getDate();
      const cutoffDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // 1. 미리보기 모드
      if (req.body.preview) {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM purchase_invoices
           WHERE (issue_date <= $1 OR (issue_date IS NULL AND write_date <= $1))
             AND status != 'completed'`,
          [cutoffDate]
        );
        const pmtResult = await pool.query(
          `SELECT COUNT(*) as count FROM payments
           WHERE type = 'expense' AND status != 'completed'
             AND purchase_invoice_id IN (
               SELECT id FROM purchase_invoices
               WHERE (issue_date <= $1 OR (issue_date IS NULL AND write_date <= $1))
                 AND status != 'completed'
             )`,
          [cutoffDate]
        );
        return res.json({
          preview: true,
          invoiceCount: parseInt(result.rows[0].count),
          paymentCount: parseInt(pmtResult.rows[0].count),
          cutoffDate,
        });
      }

      // 2. 계산서 완료 처리
      const invResult = await pool.query(
        `UPDATE purchase_invoices SET status = 'completed'
         WHERE (issue_date <= $1 OR (issue_date IS NULL AND write_date <= $1))
           AND status != 'completed'
         RETURNING id, total_amount, issue_date, write_date, vendor_id, company_name`,
        [cutoffDate]
      );
      const updatedInvoices = invResult.rows;
      const invoiceIds = updatedInvoices.map((r: any) => r.id);

      // 3. 기존 연결된 payment 완료 처리
      let updatedPayments = 0;
      if (invoiceIds.length > 0) {
        const pmtResult = await pool.query(
          `UPDATE payments SET status = 'completed',
             actual_amount = COALESCE(actual_amount, amount),
             actual_date = COALESCE(actual_date, planned_date, $2)
           WHERE type = 'expense' AND status != 'completed'
             AND purchase_invoice_id = ANY($1::varchar[])
           RETURNING id`,
          [invoiceIds, cutoffDate]
        );
        updatedPayments = pmtResult.rowCount ?? 0;

        // 4. payment 없는 계산서는 완료 payment 신규 생성
        const linkedResult = await pool.query(
          `SELECT DISTINCT purchase_invoice_id FROM payments
           WHERE purchase_invoice_id = ANY($1::varchar[])`,
          [invoiceIds]
        );
        const linkedIds = new Set(linkedResult.rows.map((r: any) => r.purchase_invoice_id));
        const noPaymentInvoices = updatedInvoices.filter((inv: any) => !linkedIds.has(inv.id));

        for (const inv of noPaymentInvoices) {
          await pool.query(
            `INSERT INTO payments (id, type, purchase_invoice_id, company_name, description, amount, status, actual_amount, actual_date, planned_date)
             VALUES (gen_random_uuid(), 'expense', $1, $2, '매입계산서 (이전 완료)', $3, 'completed', $3, $4, $4)`,
            [inv.id, inv.company_name, inv.total_amount, inv.issue_date || inv.write_date || cutoffDate]
          );
          updatedPayments++;
        }
      }

      res.json({
        updatedInvoices: updatedInvoices.length,
        updatedPayments,
        cutoffDate,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/bank-transactions/:id/link-invoice", async (req, res) => {
    try {
      const txId = req.params.id;
      const { invoiceId } = req.body;
      if (!invoiceId) return res.status(400).json({ message: "invoiceId is required" });

      const invoice = await storage.getSalesInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const allTx = await storage.getBankTransactions({});
      const targetTx = allTx.find((t: any) => t.id === txId);
      if (!targetTx) return res.status(404).json({ message: "Transaction not found" });
      if (!targetTx.creditAmount || targetTx.creditAmount <= 0) {
        return res.status(400).json({ message: "입금 거래만 계산서에 연결할 수 있습니다" });
      }

      const tx = await storage.updateBankTransaction(txId, {
        matchedSalesInvoiceId: invoiceId,
        matchStatus: "manual",
      });
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bank-transactions/:id/link-invoice", async (req, res) => {
    try {
      const txId = req.params.id;
      const tx = await storage.updateBankTransaction(txId, {
        matchedSalesInvoiceId: null,
        matchStatus: "unmatched",
      });
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 은행 출금거래 ↔ 매입계산서 직접 연결 (매출의 link-invoice 미러)
  app.post("/api/bank-transactions/:id/link-purchase-invoice", async (req, res) => {
    try {
      const txId = req.params.id;
      const { invoiceId } = req.body;
      if (!invoiceId) return res.status(400).json({ message: "invoiceId is required" });

      const invoice = await storage.getPurchaseInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const allTx = await storage.getBankTransactions({});
      const targetTx = allTx.find((t: any) => t.id === txId);
      if (!targetTx) return res.status(404).json({ message: "Transaction not found" });
      if (!targetTx.debitAmount || targetTx.debitAmount <= 0) {
        return res.status(400).json({ message: "출금 거래만 매입계산서에 연결할 수 있습니다" });
      }

      const tx = await storage.updateBankTransaction(txId, {
        matchedPurchaseInvoiceId: invoiceId,
        matchStatus: "manual",
      });
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bank-transactions/:id/link-purchase-invoice", async (req, res) => {
    try {
      const txId = req.params.id;
      const tx = await storage.updateBankTransaction(txId, {
        matchedPurchaseInvoiceId: null,
        matchStatus: "unmatched",
      });
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // 수동 백업 트리거 (관리자용)
  app.post("/api/backup/run", async (_req, res) => {
    try {
      const { runBackup } = await import("./backup");
      const summary = await runBackup();
      const total = summary.reduce((s, t) => s + t.rows, 0);
      res.json({ message: "백업 완료", totalRows: total, tables: summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
