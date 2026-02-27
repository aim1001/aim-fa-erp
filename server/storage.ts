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
  type OnedriveToken,
  type ItemMaster, type InsertItemMaster,
  type ItemInventory, type InsertItemInventory,
  type ItemDocument, type InsertItemDocument,
  type PurchaseItem, type InsertPurchaseItem,
  type InquiryMemo, type InsertInquiryMemo,
  type Quotation, type InsertQuotation,
  type QuotationItem, type InsertQuotationItem,
  type ContractTemplate, type InsertContractTemplate,
  type CompanySettings, type InsertCompanySettings,
  type Staff, type InsertStaff,
  inquiries, inquiryFiles, companies, customers, productImages,
  vendors, salesInvoices, purchaseInvoices, payments, projects,
  onedriveTokens, itemMaster, itemInventory, itemDocument, purchaseItems,
  inquiryMemos, quotations, quotationItems, contractTemplates, companySettings, staff,
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
  getTemporaryCompanies(): Promise<Company[]>;
  getTemporaryCompanyCount(): Promise<number>;
  getCompaniesByCustomerId(customerId: string): Promise<Company[]>;
  searchCompanies(query: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  linkCompanyToCustomer(companyId: string, customerId: string): Promise<Company | undefined>;
  getCustomerInquiryCounts(): Promise<Map<string, number>>;
  getCustomerContactCounts(): Promise<Map<string, number>>;
  getCustomerLastTransactionDates(): Promise<Map<string, string>>;
  getVendorLastTransactionDates(): Promise<Map<string, string>>;
  getInquiriesByCustomerId(customerId: string): Promise<Inquiry[]>;
  getInquiriesByCompanyId(companyId: string): Promise<Inquiry[]>;
  getUnlinkedInquiriesByCustomerName(customerName: string): Promise<Inquiry[]>;

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

  getOnedriveToken(): Promise<OnedriveToken | undefined>;
  saveOnedriveToken(data: { accessToken: string; refreshToken: string; expiresAt: Date; accountName?: string; accountEmail?: string }): Promise<OnedriveToken>;
  deleteOnedriveToken(): Promise<void>;

  getPurchaseItems(filters?: { search?: string; category1?: string }): Promise<PurchaseItem[]>;
  getPurchaseItem(id: string): Promise<PurchaseItem | undefined>;
  createPurchaseItem(item: InsertPurchaseItem): Promise<PurchaseItem>;
  updatePurchaseItem(id: string, item: Partial<InsertPurchaseItem>): Promise<PurchaseItem | undefined>;
  deletePurchaseItem(id: string): Promise<void>;
  getPurchaseItemByCode(itemCode: string): Promise<PurchaseItem | undefined>;
  upsertPurchaseItem(item: InsertPurchaseItem): Promise<PurchaseItem>;
  getPurchaseItemCategories(): Promise<string[]>;

  getItems(): Promise<ItemMaster[]>;
  getItemByCode(itemCode: string): Promise<ItemMaster | undefined>;
  upsertItem(item: InsertItemMaster): Promise<ItemMaster>;
  updateItemById(id: string, fields: Partial<InsertItemMaster>): Promise<ItemMaster>;
  deleteItem(id: string): Promise<void>;
  getItemInventory(itemCode: string): Promise<ItemInventory[]>;
  upsertItemInventory(inv: InsertItemInventory): Promise<ItemInventory>;
  getAllItemInventory(): Promise<ItemInventory[]>;
  getItemDocuments(itemCode: string): Promise<ItemDocument[]>;
  addItemDocument(doc: InsertItemDocument): Promise<ItemDocument>;
  deleteItemDocument(id: string): Promise<void>;
  deleteItemDocumentsByItemCode(itemCode: string): Promise<void>;
  getItemsWithDetails(): Promise<Array<ItemMaster & { inventory: ItemInventory[]; documents: ItemDocument[] }>>;

  getQuotationsByInquiry(inquiryId: string): Promise<Quotation[]>;
  getQuotationWithItems(id: string): Promise<{ quotation: Quotation; items: QuotationItem[] } | undefined>;
  createQuotation(data: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: string, data: Partial<InsertQuotation>): Promise<Quotation | undefined>;
  deleteQuotation(id: string): Promise<void>;
  createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem>;
  updateQuotationItem(id: string, data: Partial<InsertQuotationItem>): Promise<QuotationItem | undefined>;
  deleteQuotationItem(id: string): Promise<void>;

  getContractTemplates(): Promise<ContractTemplate[]>;
  getContractTemplate(id: string): Promise<ContractTemplate | undefined>;
  createContractTemplate(data: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined>;
  deleteContractTemplate(id: string): Promise<void>;

  getCompanySettings(): Promise<CompanySettings | undefined>;
  saveCompanySettings(data: InsertCompanySettings): Promise<CompanySettings>;

  getStaffList(): Promise<Staff[]>;
  getStaff(id: string): Promise<Staff | undefined>;
  createStaff(data: InsertStaff): Promise<Staff>;
  updateStaff(id: string, data: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: string): Promise<void>;
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

  async getTemporaryCompanies(): Promise<Company[]> {
    return db.select().from(companies).where(eq(companies.isTemporary, true)).orderBy(companies.companyName);
  }

  async getTemporaryCompanyCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(companies).where(eq(companies.isTemporary, true));
    return Number(result[0]?.count || 0);
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

  async getCustomerContactCounts(): Promise<Map<string, number>> {
    const rows = await db.select({
      customerId: companies.customerId,
      count: sql<number>`count(*)::int`,
    })
      .from(companies)
      .where(sql`${companies.customerId} is not null`)
      .groupBy(companies.customerId);
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

  async getUnlinkedInquiriesByCustomerName(customerName: string): Promise<Inquiry[]> {
    const normalized = customerName.replace(/\s+/g, '').toLowerCase();
    const all = await db.select().from(inquiries).where(
      sql`${inquiries.customerId} IS NULL AND ${inquiries.customerName} IS NOT NULL`
    );
    return all.filter(inq => inq.customerName && inq.customerName.replace(/\s+/g, '').toLowerCase() === normalized);
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

  async getOnedriveToken(): Promise<OnedriveToken | undefined> {
    const rows = await db.select().from(onedriveTokens).limit(1);
    return rows[0];
  }

  async saveOnedriveToken(data: { accessToken: string; refreshToken: string; expiresAt: Date; accountName?: string; accountEmail?: string }): Promise<OnedriveToken> {
    await db.delete(onedriveTokens);
    const [row] = await db.insert(onedriveTokens).values({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      accountName: data.accountName || null,
      accountEmail: data.accountEmail || null,
    }).returning();
    return row;
  }

  async deleteOnedriveToken(): Promise<void> {
    await db.delete(onedriveTokens);
  }

  async getItems(): Promise<ItemMaster[]> {
    return db.select().from(itemMaster).orderBy(itemMaster.category1, itemMaster.itemCode);
  }

  async getItemByCode(code: string): Promise<ItemMaster | undefined> {
    const [row] = await db.select().from(itemMaster).where(eq(itemMaster.itemCode, code));
    return row;
  }

  async upsertItem(item: InsertItemMaster): Promise<ItemMaster> {
    const existing = await this.getItemByCode(item.itemCode);
    if (existing) {
      const [row] = await db.update(itemMaster).set(item).where(eq(itemMaster.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(itemMaster).values(item).returning();
    return row;
  }

  async updateItemById(id: string, fields: Partial<InsertItemMaster>): Promise<ItemMaster> {
    const [row] = await db.update(itemMaster).set(fields).where(eq(itemMaster.id, id)).returning();
    if (!row) throw new Error(`Item not found: ${id}`);
    return row;
  }

  async deleteItem(id: string): Promise<void> {
    const item = await db.select().from(itemMaster).where(eq(itemMaster.id, id));
    if (item[0]) {
      await db.delete(itemInventory).where(eq(itemInventory.itemCode, item[0].itemCode));
      await db.delete(itemDocument).where(eq(itemDocument.itemCode, item[0].itemCode));
    }
    await db.delete(itemMaster).where(eq(itemMaster.id, id));
  }

  async getItemInventory(code: string): Promise<ItemInventory[]> {
    return db.select().from(itemInventory).where(eq(itemInventory.itemCode, code));
  }

  async upsertItemInventory(inv: InsertItemInventory): Promise<ItemInventory> {
    const [existing] = await db.select().from(itemInventory).where(
      and(eq(itemInventory.itemCode, inv.itemCode), eq(itemInventory.stockType, inv.stockType))
    );
    if (existing) {
      const [row] = await db.update(itemInventory)
        .set({ qty: inv.qty, updatedAt: new Date() })
        .where(eq(itemInventory.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(itemInventory).values(inv).returning();
    return row;
  }

  async getAllItemInventory(): Promise<ItemInventory[]> {
    return db.select().from(itemInventory);
  }

  async getItemDocuments(code: string): Promise<ItemDocument[]> {
    return db.select().from(itemDocument).where(eq(itemDocument.itemCode, code));
  }

  async addItemDocument(doc: InsertItemDocument): Promise<ItemDocument> {
    const [row] = await db.insert(itemDocument).values(doc).returning();
    return row;
  }

  async deleteItemDocument(id: string): Promise<void> {
    await db.delete(itemDocument).where(eq(itemDocument.id, id));
  }

  async deleteItemDocumentsByItemCode(code: string): Promise<void> {
    await db.delete(itemDocument).where(eq(itemDocument.itemCode, code));
  }

  async getPurchaseItems(filters?: { search?: string; category1?: string }): Promise<PurchaseItem[]> {
    const conditions: any[] = [];
    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push(or(
        ilike(purchaseItems.itemName, q),
        ilike(purchaseItems.itemCode, q),
        ilike(purchaseItems.spec, q),
        ilike(purchaseItems.defaultVendor, q),
        ilike(purchaseItems.brand, q),
        ilike(purchaseItems.remark, q),
      ));
    }
    if (filters?.category1) {
      conditions.push(eq(purchaseItems.category1, filters.category1));
    }
    if (conditions.length > 0) {
      return db.select().from(purchaseItems).where(and(...conditions));
    }
    return db.select().from(purchaseItems);
  }

  async getPurchaseItem(id: string): Promise<PurchaseItem | undefined> {
    const [item] = await db.select().from(purchaseItems).where(eq(purchaseItems.id, id));
    return item;
  }

  async createPurchaseItem(item: InsertPurchaseItem): Promise<PurchaseItem> {
    const [created] = await db.insert(purchaseItems).values(item).returning();
    return created;
  }

  async updatePurchaseItem(id: string, item: Partial<InsertPurchaseItem>): Promise<PurchaseItem | undefined> {
    const [updated] = await db.update(purchaseItems).set(item).where(eq(purchaseItems.id, id)).returning();
    return updated;
  }

  async deletePurchaseItem(id: string): Promise<void> {
    await db.delete(purchaseItems).where(eq(purchaseItems.id, id));
  }

  async getPurchaseItemByCode(itemCode: string): Promise<PurchaseItem | undefined> {
    const [item] = await db.select().from(purchaseItems).where(eq(purchaseItems.itemCode, itemCode));
    return item;
  }

  async upsertPurchaseItem(item: InsertPurchaseItem): Promise<PurchaseItem> {
    const existing = await this.getPurchaseItemByCode(item.itemCode);
    if (existing) {
      const [updated] = await db.update(purchaseItems).set(item).where(eq(purchaseItems.id, existing.id)).returning();
      return updated;
    }
    return this.createPurchaseItem(item);
  }

  async getPurchaseItemCategories(): Promise<string[]> {
    const rows = await db.selectDistinct({ category1: purchaseItems.category1 }).from(purchaseItems);
    return rows.map(r => r.category1).sort();
  }

  async getItemsWithDetails(): Promise<Array<ItemMaster & { inventory: ItemInventory[]; documents: ItemDocument[] }>> {
    const items = await this.getItems();
    const allInventory = await this.getAllItemInventory();
    const allDocs = await db.select().from(itemDocument);

    const invMap = new Map<string, ItemInventory[]>();
    for (const inv of allInventory) {
      const arr = invMap.get(inv.itemCode) || [];
      arr.push(inv);
      invMap.set(inv.itemCode, arr);
    }

    const docMap = new Map<string, ItemDocument[]>();
    for (const doc of allDocs) {
      const arr = docMap.get(doc.itemCode) || [];
      arr.push(doc);
      docMap.set(doc.itemCode, arr);
    }

    return items.map(item => ({
      ...item,
      inventory: invMap.get(item.itemCode) || [],
      documents: docMap.get(item.itemCode) || [],
    }));
  }
  async getInquiryMemos(inquiryId: string): Promise<InquiryMemo[]> {
    return db.select().from(inquiryMemos).where(eq(inquiryMemos.inquiryId, inquiryId)).orderBy(desc(inquiryMemos.createdAt));
  }

  async createInquiryMemo(data: InsertInquiryMemo): Promise<InquiryMemo> {
    const [memo] = await db.insert(inquiryMemos).values(data).returning();
    return memo;
  }

  async updateInquiryMemo(id: string, content: string): Promise<InquiryMemo | undefined> {
    const [memo] = await db.update(inquiryMemos).set({ content }).where(eq(inquiryMemos.id, id)).returning();
    return memo;
  }

  async deleteInquiryMemo(id: string): Promise<void> {
    await db.delete(inquiryMemos).where(eq(inquiryMemos.id, id));
  }

  async getQuotationsByInquiry(inquiryId: string): Promise<Quotation[]> {
    return db.select().from(quotations).where(eq(quotations.inquiryId, inquiryId)).orderBy(desc(quotations.createdAt));
  }

  async getQuotationWithItems(id: string): Promise<{ quotation: Quotation; items: QuotationItem[] } | undefined> {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    if (!quotation) return undefined;
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)).orderBy(quotationItems.sortOrder);
    return { quotation, items };
  }

  async createQuotation(data: InsertQuotation): Promise<Quotation> {
    const [q] = await db.insert(quotations).values(data).returning();
    return q;
  }

  async updateQuotation(id: string, data: Partial<InsertQuotation>): Promise<Quotation | undefined> {
    const [q] = await db.update(quotations).set(data).where(eq(quotations.id, id)).returning();
    return q;
  }

  async deleteQuotation(id: string): Promise<void> {
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, id));
    await db.delete(quotations).where(eq(quotations.id, id));
  }

  async createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem> {
    const [item] = await db.insert(quotationItems).values(data).returning();
    return item;
  }

  async updateQuotationItem(id: string, data: Partial<InsertQuotationItem>): Promise<QuotationItem | undefined> {
    const [item] = await db.update(quotationItems).set(data).where(eq(quotationItems.id, id)).returning();
    return item;
  }

  async deleteQuotationItem(id: string): Promise<void> {
    await db.delete(quotationItems).where(eq(quotationItems.id, id));
  }

  async getContractTemplates(): Promise<ContractTemplate[]> {
    return db.select().from(contractTemplates).orderBy(desc(contractTemplates.createdAt));
  }

  async getContractTemplate(id: string): Promise<ContractTemplate | undefined> {
    const [t] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
    return t;
  }

  async createContractTemplate(data: InsertContractTemplate): Promise<ContractTemplate> {
    const [t] = await db.insert(contractTemplates).values(data).returning();
    return t;
  }

  async updateContractTemplate(id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined> {
    const [t] = await db.update(contractTemplates).set(data).where(eq(contractTemplates.id, id)).returning();
    return t;
  }

  async deleteContractTemplate(id: string): Promise<void> {
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> {
    const rows = await db.select().from(companySettings).limit(1);
    return rows[0];
  }

  async saveCompanySettings(data: InsertCompanySettings): Promise<CompanySettings> {
    const existing = await this.getCompanySettings();
    if (existing) {
      const [updated] = await db.update(companySettings).set(data).where(eq(companySettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(companySettings).values(data).returning();
    return created;
  }

  async getStaffList(): Promise<Staff[]> {
    return db.select().from(staff).orderBy(staff.department, staff.name);
  }

  async getStaff(id: string): Promise<Staff | undefined> {
    const [row] = await db.select().from(staff).where(eq(staff.id, id));
    return row;
  }

  async createStaff(data: InsertStaff): Promise<Staff> {
    const [created] = await db.insert(staff).values(data).returning();
    return created;
  }

  async updateStaff(id: string, data: Partial<InsertStaff>): Promise<Staff | undefined> {
    const [updated] = await db.update(staff).set(data).where(eq(staff.id, id)).returning();
    return updated;
  }

  async deleteStaff(id: string): Promise<void> {
    await db.delete(staff).where(eq(staff.id, id));
  }
}

export const storage = new DatabaseStorage();
