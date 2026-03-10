import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  businessNumber: text("business_number"),
  representative: text("representative"),
  address: text("address"),
  businessType: text("business_type"),
  businessCategory: text("business_category"),
  phone: text("phone"),
  fax: text("fax"),
  memo: text("memo"),
  isFavorite: boolean("is_favorite").default(false),
  mgmtDepartment: text("mgmt_department"),
  mgmtContactName: text("mgmt_contact_name"),
  mgmtPhone: text("mgmt_phone"),
  mgmtMobile: text("mgmt_mobile"),
  mgmtFax: text("mgmt_fax"),
  mgmtEmail: text("mgmt_email"),
  notes: text("notes"),
  primaryContact: text("primary_contact"),
  registrationDate: text("registration_date"),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  companyName: text("company_name").notNull(),
  address: text("address"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  fax: text("fax"),
  memo: text("memo"),
  position: text("position"),
  department: text("department"),
  isTemporary: boolean("is_temporary").default(true),
});

export const inquiries = pgTable("inquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryNumber: text("inquiry_number").notNull(),
  customerName: text("customer_name").notNull(),
  productInfo: text("product_info"),
  year: integer("year").notNull(),
  probability: integer("probability").default(0),
  expectedDate: text("expected_date"),
  paymentTerms: text("payment_terms"),
  memo: text("memo"),
  status: text("status").default("none"),
  onedriveFolderId: text("onedrive_folder_id"),
  onedriveFolderName: text("onedrive_folder_name"),
  source: text("source").default("onedrive"),
  productWidth: text("product_width"),
  productDepth: text("product_depth"),
  productHeight: text("product_height"),
  weight: text("weight"),
  material: text("material"),
  productType: text("product_type"),
  industry: text("industry"),
  supplySpeed: text("supply_speed"),
  contractRatio: integer("contract_ratio"),
  contractTimingType: text("contract_timing_type"),
  contractTimingDays: integer("contract_timing_days"),
  midRatio: integer("mid_ratio"),
  midAfterDelivery: text("mid_after_delivery"),
  midTimingType: text("mid_timing_type"),
  midTimingDays: integer("mid_timing_days"),
  finalRatio: integer("final_ratio"),
  finalAfterDelivery: text("final_after_delivery"),
  finalTimingType: text("final_timing_type"),
  finalTimingDays: integer("final_timing_days"),
  deliveryDate: text("delivery_date"),
  customerId: varchar("customer_id"),
  companyId: varchar("company_id"),
  snapshotCompanyName: text("snapshot_company_name"),
  snapshotAddress: text("snapshot_address"),
  snapshotContactName: text("snapshot_contact_name"),
  snapshotEmail: text("snapshot_email"),
  snapshotPhone: text("snapshot_phone"),
  contractClauses: text("contract_clauses"),
  warrantyTerms: text("warranty_terms"),
  isFavorite: boolean("is_favorite").default(false),
  lastQuoteSales: integer("last_quote_sales"),
  lastQuoteCost: integer("last_quote_cost"),
  lastQuoteMargin: integer("last_quote_margin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inquiryFiles = pgTable("inquiry_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  onedriveItemId: text("onedrive_item_id"),
  webUrl: text("web_url"),
  size: integer("size"),
});

export const productImages = pgTable("product_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  imageData: text("image_data").notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  businessNumber: text("business_number"),
  representative: text("representative"),
  address: text("address"),
  phone: text("phone"),
  fax: text("fax"),
  memo: text("memo"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  isFavorite: boolean("is_favorite").default(false),
});

export const vendorContacts = pgTable("vendor_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
});

export const insertVendorContactSchema = createInsertSchema(vendorContacts).omit({ id: true });
export type InsertVendorContact = z.infer<typeof insertVendorContactSchema>;
export type VendorContact = typeof vendorContacts.$inferSelect;

export const salesInvoices = pgTable("sales_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  projectId: varchar("project_id"),
  invoiceNumber: text("invoice_number"),
  issueDate: text("issue_date"),
  writeDate: text("write_date"),
  businessNumber: text("business_number"),
  companyName: text("company_name"),
  representative: text("representative"),
  address: text("address"),
  email1: text("email1"),
  email2: text("email2"),
  year: integer("year"),
  item: text("item"),
  quantity: integer("quantity"),
  unitPrice: integer("unit_price"),
  supplyAmount: integer("supply_amount"),
  taxAmount: integer("tax_amount"),
  totalAmount: integer("total_amount"),
  memo: text("memo"),
  status: text("status").default("pending"),
  invoiceStage: text("invoice_stage"),
  plannedIssueDate: text("planned_issue_date"),
});

export const purchaseInvoices = pgTable("purchase_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id"),
  projectId: varchar("project_id"),
  invoiceNumber: text("invoice_number"),
  issueDate: text("issue_date"),
  writeDate: text("write_date"),
  businessNumber: text("business_number"),
  companyName: text("company_name"),
  representative: text("representative"),
  address: text("address"),
  email1: text("email1"),
  year: integer("year"),
  item: text("item"),
  quantity: integer("quantity"),
  unitPrice: integer("unit_price"),
  supplyAmount: integer("supply_amount"),
  taxAmount: integer("tax_amount"),
  totalAmount: integer("total_amount"),
  memo: text("memo"),
  status: text("status").default("pending"),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  salesInvoiceId: varchar("sales_invoice_id"),
  purchaseInvoiceId: varchar("purchase_invoice_id"),
  projectId: varchar("project_id"),
  companyName: text("company_name"),
  description: text("description"),
  amount: integer("amount"),
  paymentMethod: text("payment_method"),
  plannedDate: text("planned_date"),
  actualDate: text("actual_date"),
  actualAmount: integer("actual_amount"),
  status: text("status").default("planned"),
  splitIndex: integer("split_index").default(1),
  splitTotal: integer("split_total").default(1),
  category: text("category"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
});

export const insertInquiryFileSchema = createInsertSchema(inquiryFiles).omit({
  id: true,
});

export const insertProductImageSchema = createInsertSchema(productImages).omit({
  id: true,
});

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
});

export const insertSalesInvoiceSchema = createInsertSchema(salesInvoices).omit({
  id: true,
});

export const insertPurchaseInvoiceSchema = createInsertSchema(purchaseInvoices).omit({
  id: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;
export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiryFile = z.infer<typeof insertInquiryFileSchema>;
export type InquiryFile = typeof inquiryFiles.$inferSelect;
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type ProductImage = typeof productImages.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertSalesInvoice = z.infer<typeof insertSalesInvoiceSchema>;
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type InsertPurchaseInvoice = z.infer<typeof insertPurchaseInvoiceSchema>;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectNumber: text("project_number"),
  customerName: text("customer_name"),
  customerId: varchar("customer_id"),
  description: text("description"),
  year: integer("year"),
  folderName: text("folder_name"),
  onedriveFolderId: text("onedrive_folder_id"),
  onedriveWebUrl: text("onedrive_web_url"),
  status: text("status").default("active"),
  memo: text("memo"),
  totalAmount: integer("total_amount"),
  depositRatio: integer("deposit_ratio"),
  depositTimingType: text("deposit_timing_type"),
  depositTimingDays: integer("deposit_timing_days"),
  midRatio: integer("mid_ratio"),
  midTimingType: text("mid_timing_type"),
  midTimingDays: integer("mid_timing_days"),
  midAfterDelivery: text("mid_after_delivery"),
  finalRatio: integer("final_ratio"),
  finalTimingType: text("final_timing_type"),
  finalTimingDays: integer("final_timing_days"),
  finalAfterDelivery: text("final_after_delivery"),
  invoicePlan: text("invoice_plan").default("split"),
  deliveryDate: text("delivery_date"),
  registrationDate: text("registration_date"),
  completionDate: text("completion_date"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const itemMaster = pgTable("item_master", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category1: text("category1").notNull(),
  category2: text("category2"),
  itemCode: text("item_code").notNull().unique(),
  itemName: text("item_name").notNull(),
  spec: text("spec"),
  cost: integer("cost"),
  salesPrice: integer("sales_price"),
  active: boolean("active").default(true),
  itemType: text("item_type"),
  thumbUrl: text("thumb_url"),
  mainImageUrl: text("main_image_url"),
  isFavorite: boolean("is_favorite").default(false),
});

export const itemInventory = pgTable("item_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemCode: text("item_code").notNull(),
  stockType: text("stock_type").notNull(),
  qty: integer("qty").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const itemDocument = pgTable("item_document", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemCode: text("item_code").notNull(),
  docType: text("doc_type").notNull(),
  url: text("url"),
  name: text("name"),
});

export const insertItemMasterSchema = createInsertSchema(itemMaster).omit({ id: true });
export const insertItemInventorySchema = createInsertSchema(itemInventory).omit({ id: true });
export const insertItemDocumentSchema = createInsertSchema(itemDocument).omit({ id: true });
export type InsertItemMaster = z.infer<typeof insertItemMasterSchema>;
export type ItemMaster = typeof itemMaster.$inferSelect;
export type InsertItemInventory = z.infer<typeof insertItemInventorySchema>;
export type ItemInventory = typeof itemInventory.$inferSelect;
export type InsertItemDocument = z.infer<typeof insertItemDocumentSchema>;
export type ItemDocument = typeof itemDocument.$inferSelect;

export const purchaseItems = pgTable("purchase_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category1: text("category1").notNull(),
  category2: text("category2"),
  itemName: text("item_name").notNull(),
  brand: text("brand"),
  originCountry: text("origin_country"),
  itemCode: text("item_code").notNull().unique(),
  spec: text("spec"),
  defaultVendor: text("default_vendor"),
  vendorId: varchar("vendor_id"),
  cost: integer("cost"),
  currency: text("currency").default("won"),
  leadTimeDays: integer("lead_time_days"),
  isStockItem: boolean("is_stock_item").default(false),
  itemType: text("item_type"),
  unit: text("unit").default("ea"),
  active: boolean("active").default(true),
  safetyStock: integer("safety_stock"),
  moq: integer("moq"),
  remark: text("remark"),
  isFavorite: boolean("is_favorite").default(false),
});

export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({ id: true });
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number"),
  vendor: text("vendor"),
  vendorId: varchar("vendor_id"),
  description: text("description"),
  supplyAmount: integer("supply_amount"),
  taxAmount: integer("tax_amount"),
  totalAmount: integer("total_amount"),
  expectedDeliveryDate: text("expected_delivery_date"),
  actualDeliveryDate: text("actual_delivery_date"),
  status: text("status").default("일반"),
  receivingCompleted: boolean("receiving_completed").default(false),
  purchaseInvoiceId: varchar("purchase_invoice_id"),
  paymentId: varchar("payment_id"),
  year: integer("year"),
  folderName: text("folder_name"),
  onedriveFolderId: text("onedrive_folder_id"),
  onedriveWebUrl: text("onedrive_web_url"),
  memo: text("memo"),
  staffId: varchar("staff_id"),
  contactPerson: text("contact_person"),
  vendorContactId: varchar("vendor_contact_id"),
  paymentTerms: text("payment_terms"),
  deliveryLocation: text("delivery_location"),
  warrantyTerms: text("warranty_terms"),
  calendarEventId: text("calendar_event_id"),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: varchar("purchase_order_id").notNull(),
  itemCode: text("item_code"),
  itemName: text("item_name").notNull(),
  spec: text("spec"),
  brand: text("brand"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  category1: text("category1"),
  sortOrder: integer("sort_order").default(0),
  isAdjustment: boolean("is_adjustment").default(false),
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

export const onedriveTokens = pgTable("onedrive_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  accountName: text("account_name"),
  accountEmail: text("account_email"),
});

export type OnedriveToken = typeof onedriveTokens.$inferSelect;

export const inquiryMemos = pgTable("inquiry_memos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertInquiryMemoSchema = createInsertSchema(inquiryMemos).omit({ id: true });
export type InsertInquiryMemo = z.infer<typeof insertInquiryMemoSchema>;
export type InquiryMemo = typeof inquiryMemos.$inferSelect;

export const inquiryTasks = pgTable("inquiry_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  content: text("content").notNull(),
  completed: boolean("completed").default(false).notNull(),
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  calendarEventId: text("calendar_event_id"),
  createdAt: text("created_at").notNull(),
});

export const insertInquiryTaskSchema = createInsertSchema(inquiryTasks).omit({ id: true });
export type InsertInquiryTask = z.infer<typeof insertInquiryTaskSchema>;
export type InquiryTask = typeof inquiryTasks.$inferSelect;

export const projectTasks = pgTable("project_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  content: text("content").notNull(),
  completed: boolean("completed").default(false).notNull(),
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  calendarEventId: text("calendar_event_id"),
  createdAt: text("created_at").notNull(),
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true });
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

export const quotations = pgTable("quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  quoteNumber: text("quote_number").notNull(),
  quoteDate: text("quote_date").notNull(),
  validUntil: text("valid_until"),
  notes: text("notes"),
  status: text("status").default("draft"),
  adjustmentAmount: integer("adjustment_amount").default(0),
  adjustmentNote: text("adjustment_note"),
  discountType: text("discount_type").default("percent"),
  discountValue: integer("discount_value").default(0),
  discountTruncate: boolean("discount_truncate").default(true),
  discountTruncUnit: text("discount_trunc_unit").default("1000"),
  deliveryDays: integer("delivery_days"),
  createdAt: text("created_at").notNull(),
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({ id: true });
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export const quotationItems = pgTable("quotation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationId: varchar("quotation_id").notNull(),
  itemCode: text("item_code"),
  itemName: text("item_name").notNull(),
  spec: text("spec"),
  quantity: integer("quantity").notNull().default(1),
  costPrice: integer("cost_price").default(0),
  unitPrice: integer("unit_price").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  category1: text("category1"),
  category2: text("category2"),
  sortOrder: integer("sort_order").default(0),
  isAdjustment: boolean("is_adjustment").default(false),
});

export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true });
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type QuotationItem = typeof quotationItems.$inferSelect;

export const contractTemplates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  content: text("content").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({ id: true, createdAt: true });
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name"),
  businessNumber: text("business_number"),
  representative: text("representative"),
  address: text("address"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  logoUrl: text("logo_url"),
  signatureUrl: text("signature_url"),
  logoData: text("logo_data"),
  signatureData: text("signature_data"),
  bankInfo: text("bank_info"),
  autoCc: text("auto_cc"),
  emailTemplate: text("email_template"),
  quotationNotesTemplate: text("quotation_notes_template"),
  poDefaultStaffId: varchar("po_default_staff_id"),
  poDefaultPaymentTerms: text("po_default_payment_terms"),
  poDefaultWarrantyTerms: text("po_default_warranty_terms"),
  poAutoCc: text("po_auto_cc"),
  poEmailTemplate: text("po_email_template"),
  poCalendarId: text("po_calendar_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({ id: true, createdAt: true });
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  department: text("department").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;

export const recurringExpenses = pgTable("recurring_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  description: text("description"),
  companyName: text("company_name"),
  amount: integer("amount").notNull(),
  paymentDay: integer("payment_day").notNull(),
  isActive: text("is_active").default("true"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpenses).omit({ id: true, createdAt: true });
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
