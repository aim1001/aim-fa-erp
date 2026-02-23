import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  status: text("status").default("active"),
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

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
});

export const insertInquiryFileSchema = createInsertSchema(inquiryFiles).omit({
  id: true,
});

export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiryFile = z.infer<typeof insertInquiryFileSchema>;
export type InquiryFile = typeof inquiryFiles.$inferSelect;
