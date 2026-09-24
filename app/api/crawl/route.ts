import {AppError,failure,owner} from "@/lib/server";
import {crawlPage} from "@/lib/crawl";
export async function POST(request:Request){try{
  await owner(request);
  if(Number(request.headers.get("content-length"))>10000)throw new AppError("The website request is too large.");
  let body;try{body=await request.json() as {url?:unknown;root?:unknown;section?:unknown};}catch{throw new AppError("Invalid website request.");}
  if(typeof body.url!=="string"||typeof body.root!=="string"||typeof body.section!=="boolean")throw new AppError("Choose a website URL and crawl scope.");
  try{return Response.json(await crawlPage(body.url,body.root,body.section),{headers:{"Cache-Control":"no-store"}});}
  catch(e){throw new AppError(e instanceof Error&&e.name!=="TimeoutError"?e.message:"The website took too long to respond. Try again or use a smaller page.",422);}
}catch(e){return failure(e);}}
