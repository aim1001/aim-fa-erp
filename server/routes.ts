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
} from "./onedrive";
import { parseExcelCustomerInfo, parseCustomerListFromOneDrive, parseSalesTaxInvoices, parsePurchaseTaxInvoices, getAvailableInvoiceYears } from "./excel-parser";

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
    if (req.path === "/login" || req.path === "/logout" || req.path === "/auth/status") {
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
      res.json(inquiries);
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
      const data = insertInquirySchema.parse(req.body);
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
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const targetYear = req.body.year ? parseInt(req.body.year) : undefined;
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

      res.json({
        message: `${synced}개 인콰이어리 동기화 완료`,
        synced,
        skipped,
        total,
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
      const lastTxDates = await storage.getCustomerLastTransactionDates();
      const result = list.map(c => ({
        ...c,
        inquiryCount: inquiryCounts.get(c.id) || 0,
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

  app.get("/api/customers/:id/contacts", async (req, res) => {
    try {
      const contacts = await storage.getCompaniesByCustomerId(req.params.id);
      res.json(contacts);
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
      const updated = await storage.updateInquiry(inquiry.id, {
        customerId: customer.id,
        customerName: customer.companyName,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
  });

  app.post("/api/inquiries/:id/save-customer-info", async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) {
        return res.status(404).json({ message: "인콰이어리를 찾을 수 없습니다" });
      }

      const { companyName, address, contactName, email, phone } = saveCustomerInfoSchema.parse(req.body);

      let customer = await storage.getCustomerByName(companyName);
      if (!customer) {
        customer = await storage.createCustomer({
          companyName,
          address: address || null,
        });
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
      if (Object.keys(body).length === 1 && "projectId" in body) {
        const invoice = await storage.updateSalesInvoice(req.params.id, { projectId: body.projectId });
        if (!invoice) return res.status(404).json({ message: "매출계산서를 찾을 수 없습니다" });
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
        return { ...p, invoiceIssueDate, invoiceNumber, invoiceTotalAmount, invoiceItem, invoicePaidAmount, invoiceRemainingAmount };
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
      const updated = await storage.updatePayment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "not found" });
      res.json(updated);
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
      const folders = await listFoldersByPath("2.공사");
      const years = folders
        .map(f => parseInt(f.name))
        .filter(y => !isNaN(y))
        .sort((a, b) => b - a);
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

      let created = 0, updated = 0, skipped = 0;

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

      res.json({ message: `동기화 완료: ${created}건 생성, ${updated}건 갱신`, created, updated, skipped, total: folders.length });
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

      const deleted = await storage.deletePlannedPaymentsByProject(project.id);

      const baseDate = req.body.baseDate || new Date().toISOString().split("T")[0];
      const deliveryDate = project.deliveryDate || baseDate;
      let created = 0;
      const stages: { name: string; ratio: number | null; timingType: string | null; timingDays: number | null; afterDelivery?: string | null }[] = [
        { name: "계약금", ratio: project.depositRatio, timingType: project.depositTimingType, timingDays: project.depositTimingDays },
        { name: "중도금", ratio: project.midRatio, timingType: project.midTimingType, timingDays: project.midTimingDays, afterDelivery: project.midAfterDelivery },
        { name: "잔금", ratio: project.finalRatio, timingType: project.finalTimingType, timingDays: project.finalTimingDays, afterDelivery: project.finalAfterDelivery },
      ];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (!stage.ratio || stage.ratio <= 0) continue;
        const amount = Math.round((project.totalAmount * stage.ratio) / 100);
        const refDate = stage.afterDelivery === "true" ? deliveryDate : baseDate;
        const plannedDate = calcPaymentDate(refDate, stage.timingType, stage.timingDays);

        await storage.createPayment({
          type: "income",
          projectId: project.id,
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

      res.json({ message: `수금 계획 ${created}건 생성 완료`, created });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/generate-invoice-plan", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      const project = projects.find(p => p.id === req.params.id);
      if (!project) return res.status(404).json({ message: "프로젝트를 찾을 수 없습니다" });
      if (!project.totalAmount) return res.status(400).json({ message: "프로젝트 총 금액을 먼저 설정하세요" });

      const plan = project.invoicePlan || "split";
      const baseDate = req.body.baseDate || new Date().toISOString().split("T")[0];
      let created = 0;

      if (plan === "bulk") {
        const supplyAmount = Math.round(project.totalAmount / 1.1);
        const taxAmount = project.totalAmount - supplyAmount;
        await storage.createSalesInvoice({
          projectId: project.id,
          companyName: project.customerName || "",
          issueDate: baseDate,
          writeDate: baseDate,
          item: project.description || "",
          supplyAmount,
          taxAmount,
          totalAmount: project.totalAmount,
          memo: `${project.projectNumber} 일괄`,
        });
        created = 1;
      } else {
        const stages: { name: string; ratio: number | null }[] = [
          { name: "계약금", ratio: project.depositRatio },
          { name: "중도금", ratio: project.midRatio },
          { name: "잔금", ratio: project.finalRatio },
        ];
        for (const stage of stages) {
          if (!stage.ratio || stage.ratio <= 0) continue;
          const total = Math.round((project.totalAmount * stage.ratio) / 100);
          const supplyAmount = Math.round(total / 1.1);
          const taxAmount = total - supplyAmount;
          await storage.createSalesInvoice({
            projectId: project.id,
            companyName: project.customerName || "",
            issueDate: baseDate,
            writeDate: baseDate,
            item: `${project.description || ""} (${stage.name})`,
            supplyAmount,
            taxAmount,
            totalAmount: total,
            memo: `${project.projectNumber} ${stage.name}`,
          });
          created++;
        }
      }

      res.json({ message: `계산서 ${created}건 생성 완료`, created });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
