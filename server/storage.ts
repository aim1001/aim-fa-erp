import {
  type Inquiry, type InsertInquiry,
  type InquiryFile, type InsertInquiryFile,
  inquiries, inquiryFiles,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, gte, lte, desc } from "drizzle-orm";

export interface IStorage {
  getInquiries(filters?: {
    year?: number;
    search?: string;
    status?: string;
    minProbability?: number;
    maxProbability?: number;
  }): Promise<Inquiry[]>;
  getInquiry(id: string): Promise<Inquiry | undefined>;
  getInquiryByFolderId(folderId: string): Promise<Inquiry | undefined>;
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  updateInquiry(id: string, inquiry: Partial<InsertInquiry>): Promise<Inquiry | undefined>;
  deleteInquiry(id: string): Promise<void>;

  getInquiryFiles(inquiryId: string): Promise<InquiryFile[]>;
  createInquiryFile(file: InsertInquiryFile): Promise<InquiryFile>;
  deleteInquiryFilesByInquiryId(inquiryId: string): Promise<void>;

  getYears(): Promise<number[]>;
  getDashboardStats(year?: number): Promise<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getInquiries(filters?: {
    year?: number;
    search?: string;
    status?: string;
    minProbability?: number;
    maxProbability?: number;
  }): Promise<Inquiry[]> {
    const conditions = [];

    if (filters?.year) {
      conditions.push(eq(inquiries.year, filters.year));
    }
    if (filters?.search) {
      conditions.push(ilike(inquiries.customerName, `%${filters.search}%`));
    }
    if (filters?.status) {
      conditions.push(eq(inquiries.status, filters.status));
    }
    if (filters?.minProbability !== undefined) {
      conditions.push(gte(inquiries.probability, filters.minProbability));
    }
    if (filters?.maxProbability !== undefined) {
      conditions.push(lte(inquiries.probability, filters.maxProbability));
    }

    if (conditions.length > 0) {
      return db.select().from(inquiries).where(and(...conditions)).orderBy(desc(inquiries.year), inquiries.inquiryNumber);
    }

    return db.select().from(inquiries).orderBy(desc(inquiries.year), inquiries.inquiryNumber);
  }

  async getInquiry(id: string): Promise<Inquiry | undefined> {
    const result = await db.select().from(inquiries).where(eq(inquiries.id, id));
    return result[0];
  }

  async getInquiryByFolderId(folderId: string): Promise<Inquiry | undefined> {
    const result = await db.select().from(inquiries).where(eq(inquiries.onedriveFolderId, folderId));
    return result[0];
  }

  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const result = await db.insert(inquiries).values(inquiry).returning();
    return result[0];
  }

  async updateInquiry(id: string, inquiry: Partial<InsertInquiry>): Promise<Inquiry | undefined> {
    const result = await db.update(inquiries).set(inquiry).where(eq(inquiries.id, id)).returning();
    return result[0];
  }

  async deleteInquiry(id: string): Promise<void> {
    await db.delete(inquiryFiles).where(eq(inquiryFiles.inquiryId, id));
    await db.delete(inquiries).where(eq(inquiries.id, id));
  }

  async getInquiryFiles(inquiryId: string): Promise<InquiryFile[]> {
    return db.select().from(inquiryFiles).where(eq(inquiryFiles.inquiryId, inquiryId));
  }

  async createInquiryFile(file: InsertInquiryFile): Promise<InquiryFile> {
    const result = await db.insert(inquiryFiles).values(file).returning();
    return result[0];
  }

  async deleteInquiryFilesByInquiryId(inquiryId: string): Promise<void> {
    await db.delete(inquiryFiles).where(eq(inquiryFiles.inquiryId, inquiryId));
  }

  async getYears(): Promise<number[]> {
    const result = await db
      .selectDistinct({ year: inquiries.year })
      .from(inquiries)
      .orderBy(desc(inquiries.year));
    return result.map(r => r.year);
  }

  async getDashboardStats(year?: number): Promise<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
  }> {
    const all = await this.getInquiries(year ? { year } : undefined);

    const probRanges = [
      { range: "0-20%", min: 0, max: 20 },
      { range: "21-40%", min: 21, max: 40 },
      { range: "41-60%", min: 41, max: 60 },
      { range: "61-80%", min: 61, max: 80 },
      { range: "81-100%", min: 81, max: 100 },
    ];

    const byProbability = probRanges.map(r => ({
      range: r.range,
      count: all.filter(i => (i.probability || 0) >= r.min && (i.probability || 0) <= r.max).length,
    }));

    const statusMap = new Map<string, number>();
    all.forEach(i => {
      const s = i.status || "active";
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    });
    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    const yearMap = new Map<number, number>();
    all.forEach(i => {
      yearMap.set(i.year, (yearMap.get(i.year) || 0) + 1);
    });
    const byYear = Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);

    return { total: all.length, byProbability, byStatus, byYear };
  }
}

export const storage = new DatabaseStorage();
