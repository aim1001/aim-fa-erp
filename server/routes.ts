import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { insertInquirySchema, insertCompanySchema, insertCustomerSchema, insertVendorSchema, insertSalesInvoiceSchema, insertPurchaseInvoiceSchema } from "@shared/schema";
import {
  listRootSalesFolder,
  listYearFolders,
  listFolderFiles,
  parseInquiryFolderName,
  readInfoJson,
  writeInfoJson,
  createInquiryFolder,
  listFoldersByPath,
  checkConnectionStatus,
  resetTokenCache,
  getAuthUrl,
  exchangeCodeForTokens,
} from "./onedrive";
import { parseExcelCustomerInfo, parseCustomerListFromOneDrive, parseSalesTaxInvoices, parsePurchaseTaxInvoices, getAvailableInvoiceYears, parseListPriceFromOneDrive, writeListPriceToOneDrive, parsePurchaseListFromOneDrive } from "./excel-parser";
import { insertItemMasterSchema, insertItemInventorySchema, insertPurchaseItemSchema } from "@shared/schema";

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

  app.post("/api/inquiries/bulk-rescan-dates", async (req, res) => {
    try {
      const allInquiries = await storage.getInquiries();
      const withFolder = allInquiries.filter(inq => inq.onedriveFolderId);
      let updated = 0;
      let failed = 0;
      for (const inq of withFolder) {
        try {
          const customerInfoList = await parseExcelCustomerInfo(inq.onedriveFolderId!);
          const firstQuoteDate = customerInfoList
            .map(info => info.quoteDate)
            .find(d => d && d.trim().length > 0);
          if (firstQuoteDate) {
            const normalized = firstQuoteDate.replace(/[.\-\/]/g, '-');
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) {
              await storage.updateInquiry(inq.id, { createdAt: parsed });
              updated++;
            }
          }
        } catch {
          failed++;
        }
      }
      res.json({ total: withFolder.length, updated, failed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/inquiries/:id", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ message: "Not found" });
      res.json(inquiry);
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
      if (data.status && !["active", "won", "lost"].includes(data.status)) {
        data.status = "active";
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
      res.status(201).json(inquiry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/inquiries/:id", async (req, res) => {
    try {
      const updateSchema = insertInquirySchema.partial();
      const data = updateSchema.parse(req.body);
      if (data.probability != null) {
        const p = Number(data.probability);
        if (!Number.isFinite(p) || p < 0 || p > 5) {
          return res.status(400).json({ message: "단계는 0~5 사이 값이어야 합니다" });
        }
        data.probability = Math.round(p);
      }
      if (data.status && !["active", "won", "lost"].includes(data.status)) {
        return res.status(400).json({ message: "유효하지 않은 상태값입니다" });
      }
      if (data.status === "won") {
        data.isFavorite = false;
      }
      const inquiry = await storage.updateInquiry(req.params.id, data);
      if (!inquiry) return res.status(404).json({ message: "Not found" });

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

  app.get("/api/onedrive/status", async (_req, res) => {
    try {
      const status = await checkConnectionStatus();
      res.json(status);
    } catch (err: any) {
      res.json({ connected: false, message: err.message });
    }
  });

  app.get("/api/onedrive/auth", async (_req, res) => {
    try {
      const authUrl = getAuthUrl();
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

      await exchangeCodeForTokens(code);
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

  app.post("/api/onedrive/refresh", async (_req, res) => {
    try {
      resetTokenCache();
      const status = await checkConnectionStatus();
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
            const safeStatus = ["active", "won", "lost"].includes(rawStatus) ? rawStatus : "active";

            const inquiry = await storage.createInquiry({
              inquiryNumber: parsed.inquiryNumber,
              customerName: parsed.customerName,
              productInfo: parsed.productInfo || null,
              year,
              probability: safeProbability,
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

      const sourceInquiries = await storage.getInquiriesByCustomerId(sourceId);
      for (const inq of sourceInquiries) {
        await storage.updateInquiry(inq.id, { customerId: targetId });
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
      const { customerId } = z.object({ customerId: z.string() }).parse(req.body);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "고객사를 찾을 수 없습니다" });
      const contacts = await storage.getCompaniesByCustomer(customerId);
      const firstContact = contacts.length > 0 ? contacts[0] : null;
      const updated = await storage.updateInquiry(inquiry.id, {
        customerId: customer.id,
        customerName: customer.companyName,
        snapshotCompanyName: customer.companyName,
        snapshotAddress: customer.address || null,
        snapshotContactName: firstContact?.contactName || null,
        snapshotEmail: firstContact?.email || null,
        snapshotPhone: firstContact?.phone || null,
      });
      res.json(updated);
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

  app.post("/api/quotations/:id/items", async (req, res) => {
    try {
      const { itemCode, itemName, spec, quantity, unitPrice, costPrice, category1, category2, sortOrder } = req.body;
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
      res.setHeader("Content-Disposition", `attachment; filename="quotation_${safeNumber}.pdf"`);
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

      await storage.updateInquiry(inquiry.id, {
        customerId: customer.id,
        companyId: company.id,
        snapshotCompanyName: company.companyName,
        snapshotAddress: company.address || null,
        snapshotContactName: company.contactName || null,
        snapshotEmail: company.email || null,
        snapshotPhone: company.phone || null,
      });

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

      res.json({ customer, company, inquiryId: inquiry.id });
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
        const paidAmount = pmts.filter(p => p.status === "completed" || p.actualDate).reduce((s: number, p: any) => s + (p.actualAmount || p.amount || 0), 0);
        const plannedAmount = pmts.filter(p => !p.actualDate && p.status !== "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);
        const paymentCount = pmts.length;
        const completedCount = pmts.filter(p => p.status === "completed" || p.actualDate).length;
        const pendingPayments = pmts.filter(p => !p.actualDate && p.status !== "completed").sort((a: any, b: any) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
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
        const paidAmount = pmts.filter(p => p.status === "completed" || p.actualDate).reduce((s: number, p: any) => s + (p.actualAmount || p.amount || 0), 0);
        const plannedAmount = pmts.filter(p => !p.actualDate && p.status !== "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);
        const paymentCount = pmts.length;
        const completedCount = pmts.filter(p => p.status === "completed" || p.actualDate).length;
        const pendingPayments = pmts.filter(p => !p.actualDate && p.status !== "completed").sort((a: any, b: any) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
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
      await storage.deletePurchaseInvoice(req.params.id);
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
      const existingKeys = new Set(
        existing.map(e => `${e.issueDate}|${e.businessNumber}|${e.supplyAmount}`)
      );

      const customers = await storage.getCustomers();
      const customerByBizNum = new Map<string, string>();
      for (const c of customers) {
        if (c.businessNumber) {
          customerByBizNum.set(c.businessNumber.replace(/-/g, ""), c.id);
        }
      }

      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const key = `${row.issueDate}|${row.businessNumber}|${row.supplyAmount}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }

        const bizNumClean = row.businessNumber.replace(/-/g, "");
        const customerId = customerByBizNum.get(bizNumClean) || null;

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
        existingKeys.add(key);
        imported++;
      }

      res.json({ imported, skipped, total: rows.length });
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
      const existingKeys = new Set(
        existing.map(e => `${e.issueDate}|${e.businessNumber}|${e.supplyAmount}`)
      );

      const vendors = await storage.getVendors();
      const vendorByBizNum = new Map<string, string>();
      for (const v of vendors) {
        if (v.businessNumber) {
          vendorByBizNum.set(v.businessNumber.replace(/-/g, ""), v.id);
        }
      }

      let imported = 0;
      let skipped = 0;
      let vendorsCreated = 0;
      for (const row of rows) {
        const key = `${row.issueDate}|${row.businessNumber}|${row.supplyAmount}`;
        if (existingKeys.has(key)) {
          skipped++;
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
        existingKeys.add(key);
        imported++;
      }

      res.json({ imported, skipped, vendorsCreated, total: rows.length });
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
        if ((ap.status === "completed" || ap.actualDate) && ap.salesInvoiceId) {
          paidBySalesInvoice.set(ap.salesInvoiceId, (paidBySalesInvoice.get(ap.salesInvoiceId) || 0) + (ap.actualAmount || ap.amount || 0));
        }
        if ((ap.status === "completed" || ap.actualDate) && ap.purchaseInvoiceId) {
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
        plannedDate: actualDate,
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

        const paidIncome = projectPayments.filter(pay => pay.type === "income" && (pay.status === "completed" || pay.actualDate))
          .reduce((sum, pay) => sum + (pay.actualAmount || pay.amount || 0), 0);
        const paidExpense = projectPayments.filter(pay => pay.type === "expense" && (pay.status === "completed" || pay.actualDate))
          .reduce((sum, pay) => sum + (pay.actualAmount || pay.amount || 0), 0);
        const pendingPayments = projectPayments.filter(pay => pay.status !== "completed" && !pay.actualDate).length;

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

      res.json({ ...project, salesInvoices, purchaseInvoices, payments });
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

        if (existing) {
          await storage.updateProject(existing.id, {
            onedriveFolderId: folder.id,
            onedriveWebUrl: folder.webUrl,
            projectNumber,
            customerName,
            description,
            year,
          });
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
      const result = await storage.updateProject(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Not found" });
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
      const plannedCount = projectPayments.filter(p => p.status === "planned" || (!p.actualDate && p.status !== "completed")).length;

      if (plannedCount > 0 && !req.body.confirmed) {
        return res.status(409).json({ message: `예정 항목 ${plannedCount}건이 삭제됩니다. 계속하시겠습니까?`, needConfirm: true, plannedCount });
      }

      const deleted = await storage.deletePlannedPaymentsByProject(project.id);

      const completedPayments = projectPayments.filter(p => p.status === "completed" || p.actualDate);
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
            if (dup.status !== "completed" && !dup.actualDate) {
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
        if (pay.status === "completed" || pay.actualDate) continue;
        const proj = projects.find(p => p.id === pay.projectId);
        const entry = {
          paymentId: pay.id,
          projectId: pay.projectId || null,
          projectNumber: proj?.projectNumber || "",
          customerName: pay.companyName || proj?.customerName || "",
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

      writeListPriceToOneDrive().catch(err => {
        console.error("[listprice] OneDrive 역동기화 실패:", err.message);
      });

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

  return httpServer;
}
