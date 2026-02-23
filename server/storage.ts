import {
  type Inquiry, type InsertInquiry,
  type InquiryFile, type InsertInquiryFile,
  type Company, type InsertCompany,
  inquiries, inquiryFiles, companies,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, gte, lte, desc } from "drizzle-orm";

function naturalSort(a: string, b: string): number {
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];
  a.replace(/(\d+)|(\D+)/g, (_, d, s) => { ax.push(d ? parseInt(d) : s); return ''; });
  b.replace(/(\d+)|(\D+)/g, (_, d, s) => { bx.push(d ? parseInt(d) : s); return ''; });
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const ai = ax[i] ?? '';
    const bi = bx[i] ?? '';
    if (typeof ai === 'number' && typeof bi === 'number') {
      if (ai !== bi) return ai - bi;
    } else {
      const cmp = String(ai).localeCompare(String(bi));
      if (cmp !== 0) return cmp;
    }
  }
  return a.localeCompare(b);
}

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

  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyByName(name: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;

  getNextInquiryNumber(year: number): Promise<string>;
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

    let results;
    if (conditions.length > 0) {
      results = await db.select().from(inquiries).where(and(...conditions)).orderBy(desc(inquiries.year));
    } else {
      results = await db.select().from(inquiries).orderBy(desc(inquiries.year));
    }

    results.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return naturalSort(a.inquiryNumber, b.inquiryNumber);
    });

    return results;
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

  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(companies.companyName);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async getCompanyByName(name: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.companyName, name));
    return result[0];
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(company).returning();
    return result[0];
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies).set(company).where(eq(companies.id, id)).returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  async getNextInquiryNumber(year: number): Promise<string> {
    const prefix = String(year).slice(-2);
    const yearInquiries = await db.select({ inquiryNumber: inquiries.inquiryNumber })
      .from(inquiries)
      .where(eq(inquiries.year, year));

    let maxSeq = 0;
    for (const row of yearInquiries) {
      const match = row.inquiryNumber.match(/^\d+-(\d+)$/);
      if (match) {
        const seq = parseInt(match[1]);
        if (seq > maxSeq) maxSeq = seq;
      }
    }

    return `${prefix}-${maxSeq + 1}`;
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

    const stages = [
      { stage: 0, label: "미설정" },
      { stage: 1, label: "1.문의" },
      { stage: 2, label: "2.미팅" },
      { stage: 3, label: "3.사양협의" },
      { stage: 4, label: "4.비딩" },
      { stage: 5, label: "5.발주전" },
    ];

    const byProbability = stages.map(s => ({
      range: s.label,
      count: all.filter(i => (i.probability || 0) === s.stage).length,
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
