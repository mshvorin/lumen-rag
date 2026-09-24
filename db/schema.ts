import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const documents=sqliteTable("documents",{
  id:text("id").primaryKey(), owner:text("owner").notNull(), name:text("name").notNull(), hash:text("hash").notNull(),
  bytes:integer("bytes").notNull(), chunks:integer("chunks").notNull(), words:integer("words").notNull(),
  createdAt:text("created_at").notNull(),sourceUrl:text("source_url"),
},t=>[uniqueIndex("documents_owner_hash").on(t.owner,t.hash)]);
export const chunks=sqliteTable("chunks",{
  id:integer("id").primaryKey({autoIncrement:true}), documentId:text("document_id").notNull().references(()=>documents.id,{onDelete:"cascade"}),
  position:integer("position").notNull(),page:integer("page"),content:text("content").notNull(),embedding:text("embedding").notNull(),
},t=>[index("chunks_document_id").on(t.documentId)]);
