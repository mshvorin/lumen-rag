import {env} from "cloudflare:workers";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {DIMENSIONS,EMBEDDING_MODEL} from "./rag";
export class AppError extends Error{constructor(message:string,public status=400){super(message);}}
export function database(){if(!env.DB)throw new AppError("Document storage is temporarily unavailable.",503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError("File storage is temporarily unavailable.",503);return env.BUCKET;}
export function hasKey(){return !!env.OPENAI_API_KEY;}
export async function owner(request:Request){
  const origin=request.headers.get("origin");if(request.method!=="GET"&&origin&&origin!==new URL(request.url).origin)throw new AppError("Request origin is not allowed.",403);
  const user=await getChatGPTUser();if(!user)throw new AppError("Sign in to access your document collection.",401);return user.userId;
}
export function failure(error:unknown){
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});
  console.error("Lumen operation failed",error instanceof Error?error.name:"UnknownError");
  return Response.json({error:"This operation could not complete. Your existing documents are safe. Please try again."},{status:500});
}
export async function openai(path:string,body:object){
  if(!env.OPENAI_API_KEY)throw new AppError("OpenAI is not configured. Add the server API key before indexing or asking questions.",503);
  let response:Response;
  try{response=await fetch(`https://api.openai.com/v1/${path}`,{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});}
  catch{throw new AppError("OpenAI did not respond in time. Please try again.",504);}
  if(!response.ok){
    if(response.status===429)throw new AppError("OpenAI quota or rate limit reached. Check API billing or try again shortly.",429);
    if(response.status===401||response.status===403)throw new AppError("OpenAI could not authorize this request. Check the server API key and project access.",502);
    throw new AppError("OpenAI could not process the request. Please try again.",502);
  }
  return response.json() as Promise<any>;
}
export async function embed(texts:string[]):Promise<number[][]>{
  const vectors:number[][]=[];
  for(let i=0;i<texts.length;i+=32){
    const batch=texts.slice(i,i+32);const result=await openai("embeddings",{model:EMBEDDING_MODEL,input:batch,dimensions:DIMENSIONS,encoding_format:"float"});
    if(!Array.isArray(result.data)||result.data.length!==batch.length)throw new AppError("OpenAI returned incomplete embeddings. Please retry.",502);
    const data=result.data.sort((a:any,b:any)=>a.index-b.index);
    for(let j=0;j<data.length;j++){const item=data[j];if(item.index!==j||!Array.isArray(item.embedding)||item.embedding.length!==DIMENSIONS||item.embedding.some((n:unknown)=>typeof n!=="number"||!Number.isFinite(n)))throw new AppError("OpenAI returned an invalid embedding. Please retry.",502);vectors.push(item.embedding);}
  }return vectors;
}
