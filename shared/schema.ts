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
  isFavorite: boolean("is_favorite").default(false),
});

export const salesInvoices = pgTable("sales_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
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
});

export const purchaseInvoices = pgTable("purchase_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id"),
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
