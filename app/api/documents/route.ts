import {AppError,bucket,database,embed,failure,hasKey,owner} from "@/lib/server";
import {websiteUrl} from "@/lib/website";
import {chunkPages} from "@/lib/rag";
export async function GET(request:Request){try{
  const user=await owner(request);const result=await database().prepare("SELECT id,name,bytes,chunks,words,created_at,source_url FROM documents WHERE owner=? ORDER BY created_at DESC").bind(user).all();
  return Response.json({documents:result.results,connected:hasKey()},{headers:{"Cache-Control":"no-store"}});
}catch(e){return failure(e);}}
export async function POST(request:Request){let key:string|undefined;try{
  const user=await owner(request);
  if(Number(request.headers.get("content-length"))>18*1024*1024)throw new AppError("The upload is too large.",413);
  const form=await request.formData(), file=form.get("file"), raw=form.get("pages");
  if(!(file instanceof File)||!file.size||file.size>15*1024*1024)throw new AppError("Choose a nonempty file under 15 MB.");
  if(!/\.(pdf|txt|md|csv|docx)$/i.test(file.name))throw new AppError("Unsupported file type.");
  if(typeof raw!=="string"||raw.length>2000000)throw new AppError("The extracted text is too large.");
  let pages:any;try{pages=JSON.parse(raw);}catch{throw new AppError("Invalid extracted text.");}
  if(!Array.isArray(pages)||pages.length>300||pages.some(p=>!p||typeof p.text!=="string"||(p.page!==null&&(!Number.isInteger(p.page)||p.page<1||p.page>300))))throw new AppError("Invalid document pages.");
  if(pages.reduce((n:number,p:any)=>n+p.text.length,0)>600000)throw new AppError("Please split documents larger than 600,000 characters.");
  let sourceUrl:string|null=null;const rawUrl=form.get("sourceUrl");
  if(rawUrl!==null){if(typeof rawUrl!=="string")throw new AppError("Invalid source URL.");try{sourceUrl=websiteUrl(rawUrl).href;}catch(e){throw new AppError((e as Error).message);}}
  const title=form.get("title"), name=sourceUrl&&typeof title==="string"?title.slice(0,255):file.name.slice(0,255);
  const passages=chunkPages(pages);if(!passages.length)throw new AppError("No readable text found. Image-only PDFs need OCR first.");
  if(passages.length>500)throw new AppError("Please split this document into smaller files.");
  const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",sourceUrl?new TextEncoder().encode(`website:${sourceUrl}`):bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const db=database();const duplicate=await db.prepare("SELECT id,chunks FROM documents WHERE owner=? AND hash=?").bind(user,hash).first<{id:string;chunks:number}>();
  if(duplicate){
    const previous=await db.prepare("SELECT content,page FROM chunks WHERE document_id=? ORDER BY position").bind(duplicate.id).all<{content:string;page:number|null}>();
    if(previous.results.length===passages.length&&previous.results.every((p,i)=>p.content===passages[i].content&&p.page===passages[i].page))throw new AppError("This file is already in your collection.",409);
  }
  const current=await db.prepare("SELECT COALESCE(SUM(chunks),0) AS total FROM documents WHERE owner=?").bind(user).first<{total:number}>();
  if((current?.total||0)-(duplicate?.chunks||0)+passages.length>3000)throw new AppError("This collection can hold 3,000 passages. Remove files before adding more.");
  const vectors=await embed(passages.map(p=>p.content));const id=duplicate?.id||crypto.randomUUID();
  if(!duplicate&&!sourceUrl){key=`documents/${id}`;await bucket().put(key,bytes,{httpMetadata:{contentType:"application/octet-stream"}});}
  const words=pages.reduce((n:number,p:any)=>n+(p.text.trim()?p.text.trim().split(/\s+/).length:0),0);
  const indexedAt=new Date().toISOString();
  const insert=duplicate?db.prepare("UPDATE documents SET chunks=?,words=?,created_at=?,name=? WHERE id=? AND owner=? AND (SELECT COALESCE(SUM(chunks),0) FROM documents WHERE owner=?) - chunks + ? <= 3000").bind(passages.length,words,indexedAt,name,id,user,user,passages.length):db.prepare("INSERT INTO documents (id,owner,name,hash,bytes,chunks,words,created_at,source_url) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(chunks),0) FROM documents WHERE owner=?) + ? <= 3000").bind(id,user,name,hash,file.size,passages.length,words,indexedAt,sourceUrl,user,passages.length);
  await db.batch([insert,...(duplicate?[db.prepare("DELETE FROM chunks WHERE document_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND created_at=?)").bind(id,id,indexedAt)]:[]),...passages.map((p,i)=>db.prepare("INSERT INTO chunks (document_id,position,page,content,embedding) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id=? AND created_at=?)").bind(id,p.position,p.page,p.content,JSON.stringify(vectors[i]),id,indexedAt))]);
  if(!await db.prepare("SELECT id FROM documents WHERE id=? AND created_at=?").bind(id,indexedAt).first())throw new AppError("Collection capacity reached. Remove a file and try again.",409);
  key=undefined;return Response.json({id,chunks:passages.length},{status:201});
}catch(e){if(key)try{await bucket().delete(key);}catch{}return failure(e);}}
export async function DELETE(request:Request){try{
  const user=await owner(request),id=new URL(request.url).searchParams.get("id");
  if(!id)throw new AppError("Document ID is required.");
  const db=database();const document=await db.prepare("SELECT id FROM documents WHERE id=? AND owner=?").bind(id,user).first();
  if(!document)throw new AppError("Document not found.",404);
  await bucket().delete(`documents/${id}`);
  await db.prepare("DELETE FROM documents WHERE id=? AND owner=?").bind(id,user).run();
  return Response.json({deleted:true});
}catch(e){return failure(e);}}
