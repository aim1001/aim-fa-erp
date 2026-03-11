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
import { parseExcelCustomerInfo, parseCustomerListFromOneDrive, parseSalesTaxInvoices, parsePurchaseTaxInvoices, getAvailableInvoiceYears, parseListPriceFromOneDrive, writeListPriceToOneDrive, parsePurchaseListFromOneDrive, writePurchaseListToOneDrive } from "./excel-parser";
import { insertItemMasterSchema, insertItemInventorySchema, insertPurchaseItemSchema, insertProjectItemSchema } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
    if (req.path === "/login" || req.path === "/logout" || req.path === "/auth/status" || req.path === "/onedrive/callback") {
      return next();
    }
    return requireAuth(req, res, next);
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
      if (inquiry.customerId) {
        const cust = await storage.getCustomer(inquiry.customerId);
        const contacts = await storage.getCompaniesByCustomerId(inquiry.customerId);
        customerComplete = !!(cust && (cust.businessNumber || contacts.length > 0));
      }
      res.json({ ...inquiry, customerComplete });
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
      const unissuedInvoices = allSalesInvoices.filter(i => !i.issueDate && i.plannedIssueDate);
      const overdueInvoices = unissuedInvoices.filter(i => i.plannedIssueDate && i.plannedIssueDate < now.toISOString().split('T')[0]);

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
          uncollectedCount: overduePayments.length,
          uncollectedAmount: overduePayments.reduce((s, p) => s + (p.amount || 0), 0),
          salesInvoiceCount: allSalesInvoices.length,
          purchaseInvoiceCount: allPurchaseInvoices.length,
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
      const customer = await storage.createCustomer(data);
      res.status(201).json(customer);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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

      await storage.deleteCustomer(sourceId);

      res.json({
        message: `${source.companyName} → ${target.companyName} 병합 완료`,
        movedInquiries: sourceInquiries.length,
        movedCompanies: sourceCompanies.length,
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
            await storage.updateInquiry(inq.id, { ...snapshotUpdate, customerName: customer.companyName });
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
      const { content, dueDate, dueTime, taskType } = req.body;
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
          const { createTaskEvent } = await import("./google-calendar");
          calendarEventId = await createTaskEvent(title, normalizedDueDate, normalizedDueTime);
        } catch (calErr: any) {
          console.log(`Google Calendar 등록 실패 (할일 생성은 계속): ${calErr.message}`);
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
        createdAt: new Date().toISOString().slice(0, 10),
      });
      import("./telegram").then(t => t.notifyTask("추가", task, "영업")).catch(() => {});
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
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "수정할 내용이 없습니다" });

      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });

      if (allowed.completed === true) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
        }
      } else if (allowed.dueDate !== undefined || allowed.dueTime !== undefined) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google Calendar 기존 이벤트 삭제 실패: ${calErr.message}`);
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
            const newEventId = await createTaskEvent(title, newDueDate, newDueTime);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google Calendar 재등록 실패: ${calErr.message}`);
          }
        }
      }

      const task = await storage.updateTask(req.params.id, allowed);
      if (!task) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (allowed.completed === true) {
        import("./telegram").then(t => t.notifyTask("완료", task, "영업")).catch(() => {});
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
          console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
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
      const { content, dueDate, dueTime, taskType } = req.body;
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
          const { createTaskEvent } = await import("./google-calendar");
          calendarEventId = await createTaskEvent(title, normalizedDueDate, normalizedDueTime);
        } catch (calErr: any) {
          console.log(`Google Calendar 등록 실패 (프로젝트 할일 생성은 계속): ${calErr.message}`);
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
        createdAt: new Date().toISOString().slice(0, 10),
      });
      import("./telegram").then(t => t.notifyTask("추가", task, "프로젝트")).catch(() => {});
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
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "수정할 내용이 없습니다" });

      const existing = await storage.getProjectTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });

      if (allowed.completed === true) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
        }
      } else if (allowed.dueDate !== undefined || allowed.dueTime !== undefined) {
        if (existing.calendarEventId) {
          try {
            const { deleteCalendarEvent } = await import("./google-calendar");
            await deleteCalendarEvent(existing.calendarEventId);
          } catch (calErr: any) {
            console.log(`Google Calendar 기존 이벤트 삭제 실패: ${calErr.message}`);
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
            const newEventId = await createTaskEvent(title, newDueDate, newDueTime);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google Calendar 재등록 실패: ${calErr.message}`);
          }
        }
      }

      const task = await storage.updateProjectTask(req.params.id, allowed);
      if (!task) return res.status(404).json({ message: "할일을 찾을 수 없습니다" });
      if (allowed.completed === true) {
        import("./telegram").then(t => t.notifyTask("완료", task, "프로젝트")).catch(() => {});
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
          console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
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
          const eventId = await createTaskEvent(title, task.dueDate, task.dueTime);
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
          const eventId = await createTaskEvent(title, task.dueDate, task.dueTime);
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
          const eventId = await createTaskEvent(title, task.dueDate, task.dueTime);
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
          const eventId = await createTaskEvent(title, task.dueDate, task.dueTime);
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

      const { createTaskEvent, deleteCalendarEvent } = await import("./google-calendar");
      if (existing.calendarEventId) {
        try { await deleteCalendarEvent(existing.calendarEventId); } catch {}
      }

      const inquiry = await storage.getInquiry(existing.inquiryId);
      const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
      const title = `${prefix} ${inquiry?.inquiryNumber || ""}_${inquiry?.customerName || ""}: ${existing.content}`;
      const eventId = await createTaskEvent(title, existing.dueDate, existing.dueTime);
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

      const { createTaskEvent, deleteCalendarEvent } = await import("./google-calendar");
      if (existing.calendarEventId) {
        try { await deleteCalendarEvent(existing.calendarEventId); } catch {}
      }

      const project = await storage.getProject(existing.projectId);
      const prefix = existing.taskType === "schedule" ? "[일정]" : "[할일]";
      const title = `${prefix} P:${project?.projectNumber || ""}_${project?.customerName || ""}: ${existing.content}`;
      const eventId = await createTaskEvent(title, existing.dueDate, existing.dueTime);
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
      const { content, dueDate, dueTime, purchaseOrderId, taskType } = req.body;
      const resolvedTaskType = taskType === "todo" ? "todo" : "schedule";
      if (!content) return res.status(400).json({ message: "내용은 필수입니다" });
      const normalizedDueDate = dueDate || null;
      const normalizedDueTime = dueTime || null;
      const prefix = resolvedTaskType === "todo" ? "[할일]" : "[일정]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const title = `${prefix} ${content}`;
          const { createTaskEvent } = await import("./google-calendar");
          calendarEventId = await createTaskEvent(title, normalizedDueDate, normalizedDueTime);
        } catch (calErr: any) {
          console.log(`Google Calendar 등록 실패 (구매발주 할일 생성은 계속): ${calErr.message}`);
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
        createdAt: new Date().toISOString(),
      });
      import("./telegram").then(t => t.notifyTask("추가", task, "구매발주")).catch(() => {});
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
          } catch (calErr: any) {
            console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
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
            const newEventId = await createTaskEvent(title, newDueDate, newDueTime);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google Calendar 재등록 실패: ${calErr.message}`);
          }
        }
      }

      const updated = await storage.updatePurchaseOrderTask(req.params.id, allowed);
      if (allowed.completed === true) {
        import("./telegram").then(t => t.notifyTask("완료", updated, "구매발주")).catch(() => {});
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
          console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
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
      const { content, dueDate, dueTime, category, taskType } = req.body;
      const resolvedTaskType = taskType === "todo" ? "todo" : "schedule";
      if (!content) return res.status(400).json({ message: "내용은 필수입니다" });
      const normalizedDueDate = dueDate || null;
      const normalizedDueTime = dueTime || null;
      const prefix = resolvedTaskType === "todo" ? "[할일]" : "[일정]";

      let calendarEventId: string | null = null;
      if (normalizedDueDate) {
        try {
          const title = `${prefix} ${content}`;
          const { createTaskEvent } = await import("./google-calendar");
          calendarEventId = await createTaskEvent(title, normalizedDueDate, normalizedDueTime);
        } catch (calErr: any) {
          console.log(`Google Calendar 등록 실패 (경영지원 할일 생성은 계속): ${calErr.message}`);
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
          } catch (calErr: any) {
            console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
          }
          allowed.calendarEventId = null;
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
            const newEventId = await createTaskEvent(title, newDueDate, newDueTime);
            allowed.calendarEventId = newEventId;
          } catch (calErr: any) {
            console.log(`Google Calendar 재등록 실패: ${calErr.message}`);
          }
        }
      }

      const updated = await storage.updateFinanceTask(req.params.id, allowed);
      if (allowed.completed === true) {
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
          console.log(`Google Calendar 삭제 실패: ${calErr.message}`);
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
      const q = await storage.updateQuotation(req.params.id, req.body);
      if (!q) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      res.json(q);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/quotations/:id", async (req, res) => {
    try {
      await storage.deleteQuotation(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  async function syncQuotationTotalsToInquiry(quotationId: string) {
    const result = await storage.getQuotationWithItems(quotationId);
    if (!result) return null;
    const regularItems = result.items.filter(i => !i.isAdjustment);
    const totalSales = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
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

  app.patch("/api/quotation-items/:id", async (req, res) => {
    try {
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
      const pdfFilename = `견적서_${safeNumber}.pdf`;

      if (inquiry.onedriveFolderId) {
        try {
          const { uploadFileToFolder } = await import("./onedrive");
          await uploadFileToFolder(inquiry.onedriveFolderId, pdfFilename, pdfBuf);
        } catch (e: any) {
          console.log(`OneDrive 저장 실패 (이메일은 계속 진행): ${e.message}`);
        }
      }

      const companyName = companyInfo?.companyName || "에이아이엠";
      const emailSubject = subject || `[견적서] ${result.quotation.quoteNumber} - ${companyName}`;
      const emailBody = body || `
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

  app.get("/api/quotations/:id/download/pdf", async (req, res) => {
    try {
      const result = await storage.getQuotationWithItems(req.params.id);
      if (!result) return res.status(404).json({ message: "견적서를 찾을 수 없습니다" });
      const inquiry = await storage.getInquiry(result.quotation.inquiryId);
      if (!inquiry) return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      const { generateQuotationPDF } = await import("./quotation-export");
      const buf = await generateQuotationPDF(req.params.id, inquiry);
      const safeNumber = result.quotation.quoteNumber.replace(/[/\\:*?"<>|]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      const disposition = req.query.inline === "1" ? "inline" : "attachment";
      res.setHeader("Content-Disposition", `${disposition}; filename="quotation_${safeNumber}.pdf"`);
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
            await storage.updateInquiry(inq.id, {
              customerId: customer.id,
              snapshotCompanyName: company.companyName,
              snapshotAddress: company.address || null,
              snapshotContactName: company.contactName || null,
              snapshotEmail: company.email || null,
              snapshotPhone: company.phone || null,
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
      const result = list.map(v => ({
        ...v,
        lastTransactionDate: lastTxDates.get(v.id) || null,
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

      for (const inv of allInvoices) {
        if (!inv.businessNumber) continue;
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
      res.json({ vendorsCreated, vendorsUpdated, invoicesLinked, totalInvoices: allInvoices.length, uniqueBusinessNumbers: uniqueBizNums.size });
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
      await storage.deleteSalesInvoice(req.params.id);
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
          const key = `${e.issueDate}|${e.businessNumber}|${e.supplyAmount}`;
          exactKeyMap.set(key, e);
        }
      }

      const pendingInvoices = allInvoices.filter(e => !e.issueDate && e.projectId && (!e.year || e.year === year));

      const customers = await storage.getCustomers();
      const customerByBizNum = new Map<string, string>();
      const customerById = new Map<string, typeof customers[0]>();
      for (const c of customers) {
        if (c.businessNumber) {
          customerByBizNum.set(c.businessNumber.replace(/-/g, ""), c.id);
        }
        customerById.set(c.id, c);
      }

      const matchedIds = new Set<string>();
      const processedKeys = new Set<string>();
      let imported = 0;
      let matched = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }

        const exactKey = `${row.issueDate}|${row.businessNumber}|${row.supplyAmount}`;
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

        const customerId = rowBizClean ? customerByBizNum.get(rowBizClean) || null : null;

        await storage.createSalesInvoice({
          customerId,
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

      res.json({ imported, matched, updated, skipped, total: rows.length });
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
        const exactKey = `${e.issueDate}|${e.businessNumber}|${e.supplyAmount}`;
        exactKeyMap.set(exactKey, e);

        const partialKey = `${e.issueDate}|${e.businessNumber}`;
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
      for (const row of rows) {
        if (!row.supplyAmount && row.supplyAmount !== 0) { skipped++; continue; }
        const exactKey = `${row.issueDate}|${row.businessNumber}|${row.supplyAmount}`;

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

        const partialKey = `${row.issueDate}|${row.businessNumber}`;
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

      res.json({ imported, updated, skipped, vendorsCreated, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Payment routes
  app.get("/api/payments", async (req, res) => {
    try {
      const { year, month } = req.query;
      let list: any[];
      if (year && month) {
        list = await storage.getPaymentsByMonth(parseInt(year as string), parseInt(month as string));
      } else {
        list = await storage.getPayments();
      }

      const salesInvoices = await storage.getSalesInvoices();
      const purchaseInvoices = await storage.getPurchaseInvoices();
      const salesMap = new Map(salesInvoices.map(i => [i.id, i]));
      const purchaseMap = new Map(purchaseInvoices.map(i => [i.id, i]));

      const projects = await storage.getProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));

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
          invoiceIssueDate = inv.issueDate || null;
          invoiceNumber = inv.invoiceNumber || null;
          invoiceTotalAmount = inv.totalAmount || 0;
          invoiceItem = inv.item || null;
          invoicePaidAmount = paidBySalesInvoice.get(p.salesInvoiceId) || 0;
          invoiceRemainingAmount = Math.max((invoiceTotalAmount || 0) - invoicePaidAmount, 0);
        } else if (p.purchaseInvoiceId && purchaseMap.has(p.purchaseInvoiceId)) {
          const inv = purchaseMap.get(p.purchaseInvoiceId)!;
          invoiceIssueDate = inv.issueDate || null;
          invoiceNumber = inv.invoiceNumber || null;
          invoiceTotalAmount = inv.totalAmount || 0;
          invoiceItem = inv.item || null;
          invoicePaidAmount = paidByPurchaseInvoice.get(p.purchaseInvoiceId) || 0;
          invoiceRemainingAmount = Math.max((invoiceTotalAmount || 0) - invoicePaidAmount, 0);
        }
        const proj = p.projectId ? projectMap.get(p.projectId) : null;
        return {
          ...p,
          invoiceIssueDate, invoiceNumber, invoiceTotalAmount, invoiceItem, invoicePaidAmount, invoiceRemainingAmount,
          projectNumber: proj?.projectNumber || null,
          projectCustomerName: proj?.customerName || null,
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
          type: "income",
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

        if (!plannedDate && invoice.issueDate && paymentMethod !== "specific_date") {
          const issueDate = new Date(invoice.issueDate);
          if (paymentMethod === "end_of_next_month") {
            const nextMonth = new Date(issueDate.getFullYear(), issueDate.getMonth() + 2, 0);
            plannedDate = nextMonth.toISOString().split("T")[0];
          } else if (paymentMethod === "end_of_month") {
            const endOfMonth = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 0);
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

      const enriched = list.map(p => {
        const sales = salesInvoices.filter(i => i.projectId === p.id);
        const purchases = purchaseInvoices.filter(i => i.projectId === p.id);
        const projectPayments = allPayments.filter(pay => pay.projectId === p.id);

        const salesTotal = sales.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
        const salesSupplyTotal = sales.reduce((sum, i) => sum + (i.supplyAmount || 0), 0);
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

      res.json({ ...project, salesInvoices, purchaseInvoices, payments, customer: customer || null });
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

      for (const project of allProjects) {
        if (project.customerId) {
          alreadyLinked++;
          continue;
        }
        if (!project.customerName) {
          unmatched.push(project.projectNumber || project.id);
          continue;
        }
        const normalizedName = project.customerName.trim().toLowerCase().replace(/\s+/g, "");
        const match = allCustomers.find(c =>
          c.companyName.trim().toLowerCase().replace(/\s+/g, "") === normalizedName
        );
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
      await storage.deleteProject(req.params.id);
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
        totalAmount: inquiry.lastQuoteSales || null,
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
              companyName: project.customerName || "",
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
            companyName: project.customerName || "",
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
            companyName: project.customerName || "",
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
      const { companyName, businessNumber, representative, address, phone, fax, email, logoUrl, signatureUrl, logoData, signatureData, bankInfo, autoCc, emailTemplate, quotationNotesTemplate, poDefaultStaffId, poDefaultPaymentTerms, poDefaultWarrantyTerms, poAutoCc, poEmailTemplate, poCalendarId } = req.body;
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
        logoUrl: logoUrl === undefined ? undefined : (logoUrl || null),
        signatureUrl: signatureUrl === undefined ? undefined : (signatureUrl || null),
        logoData: logoData === undefined ? undefined : (logoData || null),
        signatureData: signatureData === undefined ? undefined : (signatureData || null),
        bankInfo: bankInfo || null,
        autoCc: autoCc || null,
        emailTemplate: emailTemplate || null,
        quotationNotesTemplate: quotationNotesTemplate === undefined ? undefined : (quotationNotesTemplate || null),
        poDefaultStaffId: poDefaultStaffId === undefined ? undefined : (poDefaultStaffId || null),
        poDefaultPaymentTerms: poDefaultPaymentTerms === undefined ? undefined : (poDefaultPaymentTerms || null),
        poDefaultWarrantyTerms: poDefaultWarrantyTerms === undefined ? undefined : (poDefaultWarrantyTerms || null),
        poAutoCc: poAutoCc === undefined ? undefined : (poAutoCc || null),
        poEmailTemplate: poEmailTemplate === undefined ? undefined : (poEmailTemplate || null),
        poCalendarId: poCalendarId === undefined ? undefined : (poCalendarId || null),
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

      if (paymentDate) {
        payment = await storage.createPayment({
          type: "expense",
          companyName: order.vendor || "",
          description: order.description || "",
          amount: order.totalAmount || 0,
          plannedDate: paymentDate,
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
      const emailBody = body || `
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
      for (const order of existingOrders) {
        if (order.folderName && !allFolderNames.has(order.folderName)) {
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
        const cellA = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (cellA) {
          const val = String(cellA.v || "").replace(/\s+/g, "");
          if (val.includes("합계") || val.toLowerCase().includes("total")) {
            const cellG = sheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
            if (cellG && cellG.v != null) {
              amount = typeof cellG.v === "number" ? Math.round(cellG.v) : Math.round(Number(String(cellG.v).replace(/[^0-9.-]/g, ""))) || null;
            }
            break;
          }
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

  const VENDOR_INFO_BASE = "4.경영지원/database/거래처 정보";

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
      const safeName = customer.companyName.replace(/[<>:"/\\|?*]/g, "_");
      const folderPath = `${VENDOR_INFO_BASE}/${safeName}`;
      const { uploadFileToFolderByPath } = await import("./onedrive");
      await uploadFileToFolderByPath(folderPath, fileName, req.file.buffer);
      res.json({ ok: true, fileName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function getCustomerFolderPath(companyName: string) {
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, "_");
    return `${VENDOR_INFO_BASE}/${safeName}`;
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

  return httpServer;
}
