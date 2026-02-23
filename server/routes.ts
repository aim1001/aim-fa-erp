import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInquirySchema } from "@shared/schema";
import {
  listRootSalesFolder,
  listYearFolders,
  listFolderFiles,
  parseInquiryFolderName,
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
      const inquiry = await storage.updateInquiry(req.params.id, data);
      if (!inquiry) return res.status(404).json({ message: "Not found" });
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

  app.post("/api/sync-onedrive", async (_req, res) => {
    try {
      const yearFolders = await listRootSalesFolder();
      let synced = 0;

      for (const yearFolder of yearFolders) {
        const yearMatch = yearFolder.name.match(/(\d{4})/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1]);

        const inquiryFolders = await listYearFolders(yearFolder.name);

        for (const folder of inquiryFolders) {
          try {
            const existing = await storage.getInquiryByFolderId(folder.id);
            if (existing) continue;

            const parsed = parseInquiryFolderName(folder.name);
            if (!parsed.inquiryNumber || !parsed.customerName) {
              console.warn(`Skipping invalid folder: ${folder.name}`);
              continue;
            }

            const inquiry = await storage.createInquiry({
              inquiryNumber: parsed.inquiryNumber,
              customerName: parsed.customerName,
              productInfo: parsed.productInfo || null,
              year,
              probability: 0,
              expectedDate: null,
              paymentTerms: null,
              memo: null,
              status: "active",
              onedriveFolderId: folder.id,
              onedriveFolderName: folder.name,
              source: "onedrive",
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
          }
        }
      }

      res.json({ message: `${synced}개 인콰이어리 동기화 완료`, synced });
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
