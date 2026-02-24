import {
  type Inquiry, type InsertInquiry,
  type InquiryFile, type InsertInquiryFile,
  type Company, type InsertCompany,
  type Customer, type InsertCustomer,
  type ProductImage, type InsertProductImage,
  type Vendor, type InsertVendor,
  type SalesInvoice, type InsertSalesInvoice,
  type PurchaseInvoice, type InsertPurchaseInvoice,
  type Payment, type InsertPayment,
  type Project, type InsertProject,
  inquiries, inquiryFiles, companies, customers, productImages,
  vendors, salesInvoices, purchaseInvoices, payments, projects,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, ilike, gte, lte, desc, sql } from "drizzle-orm";

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

  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByName(name: string): Promise<Customer | undefined>;
  getCustomerByBusinessNumber(bizNum: string): Promise<Customer | undefined>;
  searchCustomers(query: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  upsertCustomerByBusinessNumber(customer: InsertCustomer): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;

  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyByName(name: string): Promise<Company | undefined>;
  getTemporaryCompaniesByName(name: string): Promise<Company[]>;
  getCompaniesByCustomerId(customerId: string): Promise<Company[]>;
  searchCompanies(query: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  linkCompanyToCustomer(companyId: string, customerId: string): Promise<Company | undefined>;
  getCustomerInquiryCounts(): Promise<Map<string, number>>;
  getCustomerLastTransactionDates(): Promise<Map<string, string>>;
  getVendorLastTransactionDates(): Promise<Map<string, string>>;
  getInquiriesByCustomerId(customerId: string): Promise<Inquiry[]>;
  getInquiriesByCompanyId(companyId: string): Promise<Inquiry[]>;

  getProductImages(inquiryId: string): Promise<ProductImage[]>;
  createProductImage(image: InsertProductImage): Promise<ProductImage>;
  deleteProductImage(id: string): Promise<void>;
  countProductImages(inquiryId: string): Promise<number>;

  getVendors(): Promise<Vendor[]>;
  getVendor(id: string): Promise<Vendor | undefined>;
  searchVendors(query: string): Promise<Vendor[]>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: string, vendor: Partial<InsertVendor>): Promise<Vendor | undefined>;
  deleteVendor(id: string): Promise<void>;

  getSalesInvoices(): Promise<SalesInvoice[]>;
  getSalesInvoice(id: string): Promise<SalesInvoice | undefined>;
  createSalesInvoice(invoice: InsertSalesInvoice): Promise<SalesInvoice>;
  updateSalesInvoice(id: string, invoice: Partial<InsertSalesInvoice>): Promise<SalesInvoice | undefined>;
  deleteSalesInvoice(id: string): Promise<void>;
  getSalesInvoicesByYear(year: number): Promise<SalesInvoice[]>;

  getPurchaseInvoices(): Promise<PurchaseInvoice[]>;
  getPurchaseInvoice(id: string): Promise<PurchaseInvoice | undefined>;
  createPurchaseInvoice(invoice: InsertPurchaseInvoice): Promise<PurchaseInvoice>;
  updatePurchaseInvoice(id: string, invoice: Partial<InsertPurchaseInvoice>): Promise<PurchaseInvoice | undefined>;
  deletePurchaseInvoice(id: string): Promise<void>;
  getPurchaseInvoicesByYear(year: number): Promise<PurchaseInvoice[]>;

  getPayments(): Promise<Payment[]>;
  getPaymentsByMonth(year: number, month: number): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByInvoice(type: string, invoiceId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
  deletePayment(id: string): Promise<void>;
  deletePaymentsByInvoice(type: string, invoiceId: string): Promise<void>;
  deletePlannedPaymentsByProject(projectId: string): Promise<number>;

  getNextInquiryNumber(year: number): Promise<string>;
  getYears(): Promise<number[]>;
  getDashboardStats(years?: number[]): Promise<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
  }>;

  getProjects(year?: number): Promise<Project[]>;
  getProjectByFolderName(folderName: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
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

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(customers.companyName);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const result = await db.select().from(customers).where(eq(customers.id, id));
    return result[0];
  }

  async getCustomerByName(name: string): Promise<Customer | undefined> {
    const result = await db.select().from(customers).where(eq(customers.companyName, name));
    return result[0];
  }

  async getCustomerByBusinessNumber(bizNum: string): Promise<Customer | undefined> {
    const result = await db.select().from(customers).where(eq(customers.businessNumber, bizNum));
    return result[0];
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    return db.select().from(customers).where(ilike(customers.companyName, `%${query}%`));
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const result = await db.insert(customers).values(customer).returning();
    return result[0];
  }

  async updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const result = await db.update(customers).set(customer).where(eq(customers.id, id)).returning();
    return result[0];
  }

  async upsertCustomerByBusinessNumber(customer: InsertCustomer): Promise<Customer> {
    if (customer.businessNumber) {
      const existing = await this.getCustomerByBusinessNumber(customer.businessNumber);
      if (existing) {
        const result = await db.update(customers).set(customer).where(eq(customers.id, existing.id)).returning();
        return result[0];
      }
    }
    const result = await db.insert(customers).values(customer).returning();
    return result[0];
  }

  async deleteCustomer(id: string): Promise<void> {
    const relatedContacts = await db.select().from(companies).where(eq(companies.customerId, id));
    if (relatedContacts.length > 0) {
      await db.update(companies).set({ customerId: null }).where(eq(companies.customerId, id));
    }
    await db.update(inquiries).set({ customerId: null }).where(eq(inquiries.customerId, id));
    await db.delete(customers).where(eq(customers.id, id));
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

  async getTemporaryCompaniesByName(name: string): Promise<Company[]> {
    return db.select().from(companies).where(
      and(
        ilike(companies.companyName, name.trim()),
        eq(companies.isTemporary, true)
      )
    );
  }

  async getCompaniesByCustomerId(customerId: string): Promise<Company[]> {
    return db.select().from(companies).where(eq(companies.customerId, customerId)).orderBy(companies.contactName);
  }

  async searchCompanies(query: string): Promise<Company[]> {
    return db.select().from(companies).where(ilike(companies.companyName, `%${query}%`));
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

  async linkCompanyToCustomer(companyId: string, customerId: string): Promise<Company | undefined> {
    const result = await db.update(companies)
      .set({ customerId, isTemporary: false })
      .where(eq(companies.id, companyId))
      .returning();
    return result[0];
  }

  async getCustomerInquiryCounts(): Promise<Map<string, number>> {
    const rows = await db.select({
      customerId: inquiries.customerId,
      count: sql<number>`count(*)::int`,
    })
      .from(inquiries)
      .where(sql`${inquiries.customerId} is not null`)
      .groupBy(inquiries.customerId);
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.customerId) map.set(row.customerId, row.count);
    }
    return map;
  }

  async getCustomerLastTransactionDates(): Promise<Map<string, string>> {
    const rows = await db.select({
      customerId: salesInvoices.customerId,
      lastDate: sql<string>`max(${salesInvoices.issueDate})`,
    })
      .from(salesInvoices)
      .where(sql`${salesInvoices.customerId} is not null`)
      .groupBy(salesInvoices.customerId);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.customerId && row.lastDate) map.set(row.customerId, row.lastDate);
    }
    return map;
  }

  async getVendorLastTransactionDates(): Promise<Map<string, string>> {
    const rows = await db.select({
      vendorId: purchaseInvoices.vendorId,
      lastDate: sql<string>`max(${purchaseInvoices.issueDate})`,
    })
      .from(purchaseInvoices)
      .where(sql`${purchaseInvoices.vendorId} is not null`)
      .groupBy(purchaseInvoices.vendorId);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.vendorId && row.lastDate) map.set(row.vendorId, row.lastDate);
    }
    return map;
  }

  async getInquiriesByCustomerId(customerId: string): Promise<Inquiry[]> {
    return db.select().from(inquiries).where(eq(inquiries.customerId, customerId)).orderBy(desc(inquiries.year));
  }

  async getInquiriesByCompanyId(companyId: string): Promise<Inquiry[]> {
    return db.select().from(inquiries).where(eq(inquiries.companyId, companyId)).orderBy(desc(inquiries.year));
  }

  async getProductImages(inquiryId: string): Promise<ProductImage[]> {
    return db.select().from(productImages)
      .where(eq(productImages.inquiryId, inquiryId))
      .orderBy(productImages.sortOrder);
  }

  async createProductImage(image: InsertProductImage): Promise<ProductImage> {
    const result = await db.insert(productImages).values(image).returning();
    return result[0];
  }

  async deleteProductImage(id: string): Promise<void> {
    await db.delete(productImages).where(eq(productImages.id, id));
  }

  async countProductImages(inquiryId: string): Promise<number> {
    const result = await db.select().from(productImages)
      .where(eq(productImages.inquiryId, inquiryId));
    return result.length;
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

  async getDashboardStats(years?: number[]): Promise<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
  }> {
    let all: Inquiry[];
    if (years && years.length > 0) {
      const results = await Promise.all(years.map(y => this.getInquiries({ year: y })));
      all = results.flat();
    } else {
      all = await this.getInquiries();
    }

    const stages = [
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

  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(vendors.companyName);
  }

  async getVendor(id: string): Promise<Vendor | undefined> {
    const result = await db.select().from(vendors).where(eq(vendors.id, id));
    return result[0];
  }

  async searchVendors(query: string): Promise<Vendor[]> {
    return db.select().from(vendors).where(ilike(vendors.companyName, `%${query}%`));
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const result = await db.insert(vendors).values(vendor).returning();
    return result[0];
  }

  async updateVendor(id: string, vendor: Partial<InsertVendor>): Promise<Vendor | undefined> {
    const result = await db.update(vendors).set(vendor).where(eq(vendors.id, id)).returning();
    return result[0];
  }

  async deleteVendor(id: string): Promise<void> {
    await db.update(purchaseInvoices).set({ vendorId: null }).where(eq(purchaseInvoices.vendorId, id));
    await db.delete(vendors).where(eq(vendors.id, id));
  }

  async getSalesInvoices(): Promise<SalesInvoice[]> {
    return db.select().from(salesInvoices).orderBy(desc(salesInvoices.issueDate));
  }

  async getSalesInvoice(id: string): Promise<SalesInvoice | undefined> {
    const result = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
    return result[0];
  }

  async createSalesInvoice(invoice: InsertSalesInvoice): Promise<SalesInvoice> {
    const result = await db.insert(salesInvoices).values(invoice).returning();
    return result[0];
  }

  async updateSalesInvoice(id: string, invoice: Partial<InsertSalesInvoice>): Promise<SalesInvoice | undefined> {
    const result = await db.update(salesInvoices).set(invoice).where(eq(salesInvoices.id, id)).returning();
    return result[0];
  }

  async deleteSalesInvoice(id: string): Promise<void> {
    await db.delete(salesInvoices).where(eq(salesInvoices.id, id));
  }

  async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    return db.select().from(purchaseInvoices).orderBy(desc(purchaseInvoices.issueDate));
  }

  async getPurchaseInvoice(id: string): Promise<PurchaseInvoice | undefined> {
    const result = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, id));
    return result[0];
  }

  async createPurchaseInvoice(invoice: InsertPurchaseInvoice): Promise<PurchaseInvoice> {
    const result = await db.insert(purchaseInvoices).values(invoice).returning();
    return result[0];
  }

  async updatePurchaseInvoice(id: string, invoice: Partial<InsertPurchaseInvoice>): Promise<PurchaseInvoice | undefined> {
    const result = await db.update(purchaseInvoices).set(invoice).where(eq(purchaseInvoices.id, id)).returning();
    return result[0];
  }

  async deletePurchaseInvoice(id: string): Promise<void> {
    await db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, id));
  }

  async getSalesInvoicesByYear(year: number): Promise<SalesInvoice[]> {
    return db.select().from(salesInvoices).where(eq(salesInvoices.year, year));
  }

  async getPurchaseInvoicesByYear(year: number): Promise<PurchaseInvoice[]> {
    return db.select().from(purchaseInvoices).where(eq(purchaseInvoices.year, year));
  }

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(payments.plannedDate);
  }

  async getPaymentsByMonth(year: number, month: number): Promise<Payment[]> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    return db.select().from(payments)
      .where(or(
        and(
          gte(payments.plannedDate, startDate),
          lte(payments.plannedDate, endDate)
        ),
        and(
          gte(payments.actualDate, startDate),
          lte(payments.actualDate, endDate)
        )
      ))
      .orderBy(payments.plannedDate);
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.id, id));
    return result[0];
  }

  async getPaymentsByInvoice(type: string, invoiceId: string): Promise<Payment[]> {
    if (type === "income") {
      return db.select().from(payments).where(eq(payments.salesInvoiceId, invoiceId)).orderBy(payments.splitIndex);
    } else {
      return db.select().from(payments).where(eq(payments.purchaseInvoiceId, invoiceId)).orderBy(payments.splitIndex);
    }
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values(payment).returning();
    return result[0];
  }

  async updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const result = await db.update(payments).set(payment).where(eq(payments.id, id)).returning();
    return result[0];
  }

  async deletePayment(id: string): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  async deletePaymentsByInvoice(type: string, invoiceId: string): Promise<void> {
    if (type === "income") {
      await db.delete(payments).where(eq(payments.salesInvoiceId, invoiceId));
    } else {
      await db.delete(payments).where(eq(payments.purchaseInvoiceId, invoiceId));
    }
  }

  async deletePlannedPaymentsByProject(projectId: string): Promise<number> {
    const result = await db.delete(payments).where(
      and(eq(payments.projectId, projectId), eq(payments.type, "income"), eq(payments.status, "planned"))
    ).returning();
    return result.length;
  }

  async getProjects(year?: number): Promise<Project[]> {
    const conditions = [];
    if (year) conditions.push(eq(projects.year, year));
    const rows = await db.select().from(projects).where(conditions.length ? and(...conditions) : undefined);
    return rows.sort((a, b) => naturalSort(a.projectNumber || "", b.projectNumber || ""));
  }

  async getProjectByFolderName(folderName: string): Promise<Project | undefined> {
    const [row] = await db.select().from(projects).where(eq(projects.folderName, folderName));
    return row;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [row] = await db.insert(projects).values(project).returning();
    return row;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [row] = await db.update(projects).set(project).where(eq(projects.id, id)).returning();
    return row;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }
}

export const storage = new DatabaseStorage();
