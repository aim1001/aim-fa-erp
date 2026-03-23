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
  type ItemComponent, type InsertItemComponent,
  type InquiryMemo, type InsertInquiryMemo,
  type InquiryTask, type InsertInquiryTask,
  type ProjectTask, type InsertProjectTask,
  type Quotation, type InsertQuotation,
  type QuotationItem, type InsertQuotationItem,
  type ContractTemplate, type InsertContractTemplate,
  type CompanySettings, type InsertCompanySettings,
  type Staff, type InsertStaff,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type VendorContact, type InsertVendorContact,
  type RecurringExpense, type InsertRecurringExpense,
  type PurchaseOrderTask, type InsertPurchaseOrderTask,
  type FinanceTask, type InsertFinanceTask,
  type ProjectItem, type InsertProjectItem,
  type TelegramMemo, type InsertTelegramMemo,
  type CalendarEvent, type InsertCalendarEvent,
  type MonthlyBalance, type InsertMonthlyBalance,
  inquiries, inquiryFiles, companies, customers, productImages,
  vendors, salesInvoices, purchaseInvoices, payments, projects,
  onedriveTokens, itemMaster, itemInventory, itemDocument, purchaseItems,
  inquiryMemos, inquiryTasks, projectTasks, quotations, quotationItems, contractTemplates, companySettings, staff,
  purchaseOrders, purchaseOrderItems, vendorContacts, recurringExpenses,
  purchaseOrderTasks, financeTasks, projectItems, telegramMemos, itemComponents,
  calendarEvents, monthlyBalances,
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
  getNextOrderNumber(year: number): Promise<string>;
  getYears(): Promise<number[]>;
  getDashboardStats(years?: number[]): Promise<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
  }>;

  getProjects(year?: number): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
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

  getItemComponents(itemMasterId: string): Promise<ItemComponent[]>;
  createItemComponent(data: InsertItemComponent): Promise<ItemComponent>;
  updateItemComponent(id: string, data: Partial<InsertItemComponent>): Promise<ItemComponent | undefined>;
  deleteItemComponent(id: string): Promise<void>;
  getLinkedProductsByPurchaseItemId(purchaseItemId: string): Promise<Array<{ itemMasterId: string; itemName: string; itemCode: string }>>;
  getPurchaseItemBomLinks(): Promise<Array<{ purchaseItemId: string; itemMasterId: string; itemName: string; itemCode: string }>>;

  getQuotationsByInquiry(inquiryId: string): Promise<Quotation[]>;
  getQuotationWithItems(id: string): Promise<{ quotation: Quotation; items: QuotationItem[] } | undefined>;
  createQuotation(data: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: string, data: Partial<InsertQuotation>): Promise<Quotation | undefined>;
  deleteQuotation(id: string): Promise<void>;
  copyQuotation(id: string, newQuoteNumber: string): Promise<Quotation>;
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

  getTasksByInquiry(inquiryId: string): Promise<InquiryTask[]>;
  getTask(id: string): Promise<InquiryTask | undefined>;
  getAllPendingTasks(): Promise<(InquiryTask & { inquiryNumber: string; customerName: string })[]>;
  createTask(data: InsertInquiryTask): Promise<InquiryTask>;
  updateTask(id: string, data: Partial<InsertInquiryTask>): Promise<InquiryTask | undefined>;
  deleteTask(id: string): Promise<void>;

  getTasksByProject(projectId: string): Promise<ProjectTask[]>;
  getProjectTask(id: string): Promise<ProjectTask | undefined>;
  getAllPendingProjectTasks(): Promise<(ProjectTask & { projectNumber: string; customerName: string })[]>;
  createProjectTask(data: InsertProjectTask): Promise<ProjectTask>;
  updateProjectTask(id: string, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: string): Promise<void>;

  getPurchaseOrderTask(id: string): Promise<PurchaseOrderTask | undefined>;
  getAllPendingPurchaseOrderTasks(): Promise<(PurchaseOrderTask & { orderNumber: string; vendor: string })[]>;
  createPurchaseOrderTask(data: InsertPurchaseOrderTask): Promise<PurchaseOrderTask>;
  updatePurchaseOrderTask(id: string, data: Partial<InsertPurchaseOrderTask>): Promise<PurchaseOrderTask | undefined>;
  deletePurchaseOrderTask(id: string): Promise<void>;

  getFinanceTask(id: string): Promise<FinanceTask | undefined>;
  getAllPendingFinanceTasks(): Promise<FinanceTask[]>;
  createFinanceTask(data: InsertFinanceTask): Promise<FinanceTask>;
  updateFinanceTask(id: string, data: Partial<InsertFinanceTask>): Promise<FinanceTask | undefined>;
  deleteFinanceTask(id: string): Promise<void>;

  getProjectItems(projectId: string): Promise<ProjectItem[]>;
  createProjectItem(item: InsertProjectItem): Promise<ProjectItem>;
  updateProjectItem(id: string, item: Partial<InsertProjectItem>): Promise<ProjectItem | undefined>;
  deleteProjectItem(id: string): Promise<void>;
  deleteProjectItemsByProject(projectId: string): Promise<void>;

  getPurchaseOrders(year?: number): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  getPurchaseOrderByFolderName(folderName: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, order: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: string): Promise<void>;

  getPurchaseOrderItems(orderId: string): Promise<PurchaseOrderItem[]>;
  addPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  updatePurchaseOrderItem(id: string, item: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined>;
  deletePurchaseOrderItem(id: string): Promise<void>;

  getVendorContacts(vendorId: string): Promise<VendorContact[]>;
  createVendorContact(data: InsertVendorContact): Promise<VendorContact>;
  updateVendorContact(id: string, data: Partial<InsertVendorContact>): Promise<VendorContact | undefined>;
  deleteVendorContact(id: string): Promise<void>;

  getRecurringExpenses(): Promise<RecurringExpense[]>;
  createRecurringExpense(data: InsertRecurringExpense): Promise<RecurringExpense>;
  updateRecurringExpense(id: string, data: Partial<InsertRecurringExpense>): Promise<RecurringExpense | undefined>;
  deleteRecurringExpense(id: string): Promise<void>;

  getTelegramMemos(): Promise<TelegramMemo[]>;
  createTelegramMemo(data: InsertTelegramMemo): Promise<TelegramMemo>;
  markMemoRead(id: string): Promise<TelegramMemo | undefined>;
  deleteTelegramMemo(id: string): Promise<void>;
  getUnreadMemoCount(): Promise<number>;
  getTelegramMemoByMessageId(messageId: number, chatId?: string): Promise<TelegramMemo | undefined>;

  getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(data: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string): Promise<void>;

  getMonthlyBalance(year: number, month: number): Promise<MonthlyBalance | undefined>;
  upsertMonthlyBalance(year: number, month: number, openingBalance: number): Promise<MonthlyBalance>;
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

  async getNextOrderNumber(year: number): Promise<string> {
    const prefix = `p${String(year).slice(-2)}`;
    const yearOrders = await db.select({ orderNumber: purchaseOrders.orderNumber })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.year, year));

    let maxSeq = 0;
    for (const row of yearOrders) {
      if (!row.orderNumber) continue;
      const match = row.orderNumber.match(/^[Pp]?\d+-(\d+)$/);
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

  async getProject(id: string): Promise<Project | undefined> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    return row;
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
    await db.delete(projectItems).where(eq(projectItems.projectId, id));
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
  async getItemComponents(itemMasterId: string): Promise<ItemComponent[]> {
    return db.select().from(itemComponents).where(eq(itemComponents.itemMasterId, itemMasterId)).orderBy(itemComponents.sortOrder);
  }

  async createItemComponent(data: InsertItemComponent): Promise<ItemComponent> {
    const [comp] = await db.insert(itemComponents).values(data).returning();
    return comp;
  }

  async updateItemComponent(id: string, data: Partial<InsertItemComponent>): Promise<ItemComponent | undefined> {
    const [comp] = await db.update(itemComponents).set(data).where(eq(itemComponents.id, id)).returning();
    return comp;
  }

  async deleteItemComponent(id: string): Promise<void> {
    await db.delete(itemComponents).where(eq(itemComponents.id, id));
  }

  async getLinkedProductsByPurchaseItemId(purchaseItemId: string): Promise<Array<{ itemMasterId: string; itemName: string; itemCode: string }>> {
    const comps = await db.select().from(itemComponents).where(eq(itemComponents.purchaseItemId, purchaseItemId));
    if (comps.length === 0) return [];
    const masterIds = [...new Set(comps.map(c => c.itemMasterId))];
    const masters = await db.select().from(itemMaster).where(
      or(...masterIds.map(mid => eq(itemMaster.id, mid)))
    );
    return masters.map(m => ({ itemMasterId: m.id, itemName: m.itemName, itemCode: m.itemCode }));
  }

  async getPurchaseItemBomLinks(): Promise<Array<{ purchaseItemId: string; itemMasterId: string; itemName: string; itemCode: string }>> {
    const allComps = await db.select().from(itemComponents);
    const linkedComps = allComps.filter(c => c.purchaseItemId);
    if (linkedComps.length === 0) return [];
    const masterIds = [...new Set(linkedComps.map(c => c.itemMasterId))];
    const masters = await db.select().from(itemMaster).where(
      or(...masterIds.map(mid => eq(itemMaster.id, mid)))
    );
    const masterMap = new Map(masters.map(m => [m.id, m]));
    const seen = new Set<string>();
    const results: Array<{ purchaseItemId: string; itemMasterId: string; itemName: string; itemCode: string }> = [];
    for (const c of linkedComps) {
      if (!c.purchaseItemId || !masterMap.has(c.itemMasterId)) continue;
      const key = `${c.purchaseItemId}:${c.itemMasterId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const m = masterMap.get(c.itemMasterId)!;
      results.push({ purchaseItemId: c.purchaseItemId, itemMasterId: m.id, itemName: m.itemName, itemCode: m.itemCode });
    }
    return results;
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
    return db.select().from(quotations).where(eq(quotations.inquiryId, inquiryId)).orderBy(quotations.createdAt);
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

  async copyQuotation(id: string, newQuoteNumber: string): Promise<Quotation> {
    const source = await this.getQuotationWithItems(id);
    if (!source) throw new Error("원본 견적서를 찾을 수 없습니다");
    const today = new Date().toISOString().split("T")[0];
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 30);
    const validUntil = validDate.toISOString().split("T")[0];
    const now = new Date().toISOString();
    const newQ = await this.createQuotation({
      inquiryId: source.quotation.inquiryId,
      quoteNumber: newQuoteNumber,
      quoteDate: today,
      validUntil,
      notes: source.quotation.notes,
      status: "draft",
      adjustmentAmount: source.quotation.adjustmentAmount,
      adjustmentNote: source.quotation.adjustmentNote,
      discountType: source.quotation.discountType,
      discountValue: source.quotation.discountValue,
      discountTruncate: source.quotation.discountTruncate,
      discountTruncUnit: source.quotation.discountTruncUnit,
      deliveryDays: source.quotation.deliveryDays,
      createdAt: now,
    });
    for (const item of source.items) {
      await this.createQuotationItem({
        quotationId: newQ.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        spec: item.spec,
        quantity: item.quantity,
        costPrice: item.costPrice,
        unitPrice: item.unitPrice,
        amount: item.amount,
        category1: item.category1,
        category2: item.category2,
        sortOrder: item.sortOrder,
        isAdjustment: item.isAdjustment,
      });
    }
    return newQ;
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

  async getTasksByInquiry(inquiryId: string): Promise<InquiryTask[]> {
    return db.select().from(inquiryTasks).where(eq(inquiryTasks.inquiryId, inquiryId)).orderBy(desc(inquiryTasks.createdAt));
  }

  async getTask(id: string): Promise<InquiryTask | undefined> {
    const [task] = await db.select().from(inquiryTasks).where(eq(inquiryTasks.id, id));
    return task;
  }

  async getAllPendingTasks(): Promise<(InquiryTask & { inquiryNumber: string; customerName: string })[]> {
    const rows = await db
      .select({
        id: inquiryTasks.id,
        inquiryId: inquiryTasks.inquiryId,
        content: inquiryTasks.content,
        completed: inquiryTasks.completed,
        dueDate: inquiryTasks.dueDate,
        dueTime: inquiryTasks.dueTime,
        calendarEventId: inquiryTasks.calendarEventId,
        taskType: inquiryTasks.taskType,
        createdAt: inquiryTasks.createdAt,
        inquiryNumber: inquiries.inquiryNumber,
        customerName: inquiries.customerName,
      })
      .from(inquiryTasks)
      .innerJoin(inquiries, eq(inquiryTasks.inquiryId, inquiries.id))
      .where(eq(inquiryTasks.completed, false))
      .orderBy(inquiryTasks.dueDate, desc(inquiryTasks.createdAt));
    return rows as any;
  }

  async createTask(data: InsertInquiryTask): Promise<InquiryTask> {
    const [task] = await db.insert(inquiryTasks).values(data).returning();
    return task;
  }

  async updateTask(id: string, data: Partial<InsertInquiryTask>): Promise<InquiryTask | undefined> {
    const [task] = await db.update(inquiryTasks).set(data).where(eq(inquiryTasks.id, id)).returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(inquiryTasks).where(eq(inquiryTasks.id, id));
  }

  async getTasksByProject(projectId: string): Promise<ProjectTask[]> {
    return db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId)).orderBy(desc(projectTasks.createdAt));
  }

  async getProjectTask(id: string): Promise<ProjectTask | undefined> {
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
    return task;
  }

  async getAllPendingProjectTasks(): Promise<(ProjectTask & { projectNumber: string; customerName: string })[]> {
    const rows = await db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        content: projectTasks.content,
        completed: projectTasks.completed,
        dueDate: projectTasks.dueDate,
        dueTime: projectTasks.dueTime,
        calendarEventId: projectTasks.calendarEventId,
        taskType: projectTasks.taskType,
        createdAt: projectTasks.createdAt,
        projectNumber: projects.projectNumber,
        customerName: projects.customerName,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projectTasks.projectId, projects.id))
      .where(eq(projectTasks.completed, false))
      .orderBy(projectTasks.dueDate, desc(projectTasks.createdAt));
    return rows as any;
  }

  async createProjectTask(data: InsertProjectTask): Promise<ProjectTask> {
    const [task] = await db.insert(projectTasks).values(data).returning();
    return task;
  }

  async updateProjectTask(id: string, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined> {
    const [task] = await db.update(projectTasks).set(data).where(eq(projectTasks.id, id)).returning();
    return task;
  }

  async deleteProjectTask(id: string): Promise<void> {
    await db.delete(projectTasks).where(eq(projectTasks.id, id));
  }

  async getPurchaseOrderTask(id: string): Promise<PurchaseOrderTask | undefined> {
    const [task] = await db.select().from(purchaseOrderTasks).where(eq(purchaseOrderTasks.id, id));
    return task;
  }

  async getAllPendingPurchaseOrderTasks(): Promise<(PurchaseOrderTask & { orderNumber: string; vendor: string })[]> {
    const allTasks = await db.select().from(purchaseOrderTasks)
      .where(eq(purchaseOrderTasks.completed, false))
      .orderBy(purchaseOrderTasks.dueDate, desc(purchaseOrderTasks.createdAt));
    const result = [];
    for (const task of allTasks) {
      let orderNumber = "";
      let vendor = "";
      if (task.purchaseOrderId) {
        const [po] = await db.select({ orderNumber: purchaseOrders.orderNumber, vendor: purchaseOrders.vendor })
          .from(purchaseOrders).where(eq(purchaseOrders.id, task.purchaseOrderId));
        if (po) { orderNumber = po.orderNumber || ""; vendor = po.vendor || ""; }
      }
      result.push({ ...task, orderNumber, vendor });
    }
    return result;
  }

  async createPurchaseOrderTask(data: InsertPurchaseOrderTask): Promise<PurchaseOrderTask> {
    const [task] = await db.insert(purchaseOrderTasks).values(data).returning();
    return task;
  }

  async updatePurchaseOrderTask(id: string, data: Partial<InsertPurchaseOrderTask>): Promise<PurchaseOrderTask | undefined> {
    const [task] = await db.update(purchaseOrderTasks).set(data).where(eq(purchaseOrderTasks.id, id)).returning();
    return task;
  }

  async deletePurchaseOrderTask(id: string): Promise<void> {
    await db.delete(purchaseOrderTasks).where(eq(purchaseOrderTasks.id, id));
  }

  async getFinanceTask(id: string): Promise<FinanceTask | undefined> {
    const [task] = await db.select().from(financeTasks).where(eq(financeTasks.id, id));
    return task;
  }

  async getAllPendingFinanceTasks(): Promise<FinanceTask[]> {
    return db.select().from(financeTasks)
      .where(eq(financeTasks.completed, false))
      .orderBy(financeTasks.dueDate, desc(financeTasks.createdAt));
  }

  async createFinanceTask(data: InsertFinanceTask): Promise<FinanceTask> {
    const [task] = await db.insert(financeTasks).values(data).returning();
    return task;
  }

  async updateFinanceTask(id: string, data: Partial<InsertFinanceTask>): Promise<FinanceTask | undefined> {
    const [task] = await db.update(financeTasks).set(data).where(eq(financeTasks.id, id)).returning();
    return task;
  }

  async deleteFinanceTask(id: string): Promise<void> {
    await db.delete(financeTasks).where(eq(financeTasks.id, id));
  }

  async getProjectItems(projectId: string): Promise<ProjectItem[]> {
    return db.select().from(projectItems).where(eq(projectItems.projectId, projectId)).orderBy(projectItems.sortOrder);
  }

  async createProjectItem(item: InsertProjectItem): Promise<ProjectItem> {
    const result = await db.insert(projectItems).values(item).returning();
    return result[0];
  }

  async updateProjectItem(id: string, item: Partial<InsertProjectItem>): Promise<ProjectItem | undefined> {
    const result = await db.update(projectItems).set(item).where(eq(projectItems.id, id)).returning();
    return result[0];
  }

  async deleteProjectItem(id: string): Promise<void> {
    await db.delete(projectItems).where(eq(projectItems.id, id));
  }

  async deleteProjectItemsByProject(projectId: string): Promise<void> {
    await db.delete(projectItems).where(eq(projectItems.projectId, projectId));
  }

  async getPurchaseOrders(year?: number): Promise<PurchaseOrder[]> {
    const conditions = [];
    if (year) conditions.push(eq(purchaseOrders.year, year));
    const rows = await db.select().from(purchaseOrders).where(conditions.length ? and(...conditions) : undefined);
    return rows.sort((a, b) => naturalSort(a.orderNumber || "", b.orderNumber || ""));
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return row;
  }

  async getPurchaseOrderByFolderName(folderName: string): Promise<PurchaseOrder | undefined> {
    const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.folderName, folderName));
    return row;
  }

  async createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [row] = await db.insert(purchaseOrders).values(order).returning();
    return row;
  }

  async updatePurchaseOrder(id: string, order: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    const [row] = await db.update(purchaseOrders).set(order).where(eq(purchaseOrders.id, id)).returning();
    return row;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async getPurchaseOrderItems(orderId: string): Promise<PurchaseOrderItem[]> {
    return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, orderId));
  }

  async addPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    const [row] = await db.insert(purchaseOrderItems).values(item).returning();
    return row;
  }

  async updatePurchaseOrderItem(id: string, item: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined> {
    const [row] = await db.update(purchaseOrderItems).set(item).where(eq(purchaseOrderItems.id, id)).returning();
    return row;
  }

  async deletePurchaseOrderItem(id: string): Promise<void> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
  }

  async getVendorContacts(vendorId: string): Promise<VendorContact[]> {
    return db.select().from(vendorContacts).where(eq(vendorContacts.vendorId, vendorId));
  }

  async createVendorContact(data: InsertVendorContact): Promise<VendorContact> {
    const [row] = await db.insert(vendorContacts).values(data).returning();
    return row;
  }

  async updateVendorContact(id: string, data: Partial<InsertVendorContact>): Promise<VendorContact | undefined> {
    const [row] = await db.update(vendorContacts).set(data).where(eq(vendorContacts.id, id)).returning();
    return row;
  }

  async deleteVendorContact(id: string): Promise<void> {
    await db.delete(vendorContacts).where(eq(vendorContacts.id, id));
  }

  async getRecurringExpenses(): Promise<RecurringExpense[]> {
    return db.select().from(recurringExpenses).orderBy(recurringExpenses.paymentDay);
  }

  async createRecurringExpense(data: InsertRecurringExpense): Promise<RecurringExpense> {
    const [row] = await db.insert(recurringExpenses).values(data).returning();
    return row;
  }

  async updateRecurringExpense(id: string, data: Partial<InsertRecurringExpense>): Promise<RecurringExpense | undefined> {
    const [row] = await db.update(recurringExpenses).set(data).where(eq(recurringExpenses.id, id)).returning();
    return row;
  }

  async deleteRecurringExpense(id: string): Promise<void> {
    await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
  }

  async getTelegramMemos(): Promise<TelegramMemo[]> {
    return db.select().from(telegramMemos).orderBy(desc(telegramMemos.createdAt));
  }

  async createTelegramMemo(data: InsertTelegramMemo): Promise<TelegramMemo> {
    const [row] = await db.insert(telegramMemos).values(data).returning();
    return row;
  }

  async markMemoRead(id: string): Promise<TelegramMemo | undefined> {
    const [row] = await db.update(telegramMemos).set({ isRead: true }).where(eq(telegramMemos.id, id)).returning();
    return row;
  }

  async deleteTelegramMemo(id: string): Promise<void> {
    await db.delete(telegramMemos).where(eq(telegramMemos.id, id));
  }

  async getUnreadMemoCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(telegramMemos).where(eq(telegramMemos.isRead, false));
    return Number(result[0]?.count || 0);
  }

  async getTelegramMemoByMessageId(messageId: number, chatId?: string): Promise<TelegramMemo | undefined> {
    const conditions = [eq(telegramMemos.messageId, messageId)];
    if (chatId) conditions.push(eq(telegramMemos.chatId, chatId));
    const [row] = await db.select().from(telegramMemos).where(and(...conditions));
    return row;
  }

  async getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
    return db.select().from(calendarEvents)
      .where(and(gte(calendarEvents.date, start), lte(calendarEvents.date, end)));
  }

  async getCalendarEvent(id: string): Promise<CalendarEvent | undefined> {
    const [row] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return row;
  }

  async createCalendarEvent(data: InsertCalendarEvent): Promise<CalendarEvent> {
    const [row] = await db.insert(calendarEvents).values(data).returning();
    return row;
  }

  async updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const [row] = await db.update(calendarEvents).set(data).where(eq(calendarEvents.id, id)).returning();
    return row;
  }

  async deleteCalendarEvent(id: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  async getMonthlyBalance(year: number, month: number): Promise<MonthlyBalance | undefined> {
    const [row] = await db.select().from(monthlyBalances)
      .where(and(eq(monthlyBalances.year, year), eq(monthlyBalances.month, month)));
    return row;
  }

  async upsertMonthlyBalance(year: number, month: number, openingBalance: number): Promise<MonthlyBalance> {
    const existing = await this.getMonthlyBalance(year, month);
    if (existing) {
      const [row] = await db.update(monthlyBalances)
        .set({ openingBalance })
        .where(and(eq(monthlyBalances.year, year), eq(monthlyBalances.month, month)))
        .returning();
      return row;
    } else {
      const [row] = await db.insert(monthlyBalances).values({ year, month, openingBalance }).returning();
      return row;
    }
  }
}

export const storage = new DatabaseStorage();
