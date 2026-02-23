import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInquirySchema } from "@shared/schema";
import {
  listRootSalesFolder,
  listYearFolders,
  listFolderFiles,
  parseInquiryFolderName,
  readInfoJson,
  writeInfoJson,
} from "./onedrive";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const stats = await storage.getDashboardStats(year);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/onedrive/years", async (_req, res) => {
    try {
      const yearFolders = await listRootSalesFolder();
      const years = yearFolders
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

  return httpServer;
}
