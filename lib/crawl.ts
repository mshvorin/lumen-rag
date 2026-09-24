import {CRAWLER,extractWebsite,inScope,publicAddress,robotPolicy,websiteUrl} from "./website";

async function resolvePublic(host:string,signal:AbortSignal){
  // Check both address families before every outbound hop. Workers also restrict origin fetches to public networks.
  const answers=await Promise.all(["A","AAAA"].map(async type=>{
    const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:"application/dns-json"},signal});
    if(!response.ok)throw new Error("Could not verify this website's public address.");
    const dns=await response.json() as {Status:number;Answer?:{type:number;data:string}[]};
    if(dns.Status!==0)throw new Error("The website's address could not be resolved.");
    return (dns.Answer||[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);
  }));
  const addresses=answers.flat();if(!addresses.length||addresses.some(a=>!publicAddress(a)))throw new Error("Only websites on public networks can be imported.");
}
async function readLimited(response:Response,limit:number){
  if(Number(response.headers.get("content-length"))>limit){await response.body?.cancel();throw new Error("This page is too large to import (2 MB HTML limit).");}
  if(!response.body)return "";
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error("This page is too large to import (2 MB HTML limit).");parts.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const charset=response.headers.get("content-type")?.match(/charset=["']?([^\s;"']+)/i)?.[1]||"utf-8";
  try{return new TextDecoder(charset).decode(bytes);}catch{return new TextDecoder().decode(bytes);}
}
async function get(url:URL,signal:AbortSignal){
  await resolvePublic(url.hostname,signal);
  return fetch(url.href,{redirect:"manual",headers:{"User-Agent":`${CRAWLER}/1.0`,Accept:"text/html,text/plain;q=0.9"},signal});
}
async function robots(url:URL,signal:AbortSignal){
  let target=new URL("/robots.txt",url);
  for(let hop=0;hop<4;hop++){
    const response=await get(target,signal);
    if(response.status>=300&&response.status<400){await response.body?.cancel();target=websiteUrl(new URL(response.headers.get("location")||"",target).href);if(!inScope(target,url,false))throw new Error("robots.txt redirects outside this website.");continue;}
    if(response.status===404||response.status===410){await response.body?.cancel();return 1;}
    if(!response.ok){await response.body?.cancel();throw new Error(`Cannot read this site's crawling policy (HTTP ${response.status}).`);}
    return robotPolicy(await readLimited(response,512000),url);
  }throw new Error("Too many robots.txt redirects.");
}
export async function crawlPage(value:string,rootValue:string,section:boolean){
  let url=websiteUrl(value);const root=websiteUrl(rootValue),signal=AbortSignal.timeout(55000);
  for(let hop=0;hop<4;hop++){
    if(!inScope(url,root,section))throw new Error("This page redirects outside the chosen crawl scope. Use its destination URL to start another import.");
    const delay=await robots(url,signal);await new Promise(resolve=>setTimeout(resolve,delay*1000));
    const response=await get(url,signal);
    if(response.status>=300&&response.status<400){await response.body?.cancel();url=websiteUrl(new URL(response.headers.get("location")||"",url).href);continue;}
    if(!response.ok){await response.body?.cancel();throw new Error(`The website returned HTTP ${response.status}. It may block crawlers or require a login.`);}
    if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type")||"")){await response.body?.cancel();throw new Error("This URL is not an HTML page. Upload documents using Add files.");}
    const directives=response.headers.get("x-robots-tag")||"";
    if(/\b(noindex|none)\b/i.test(directives)){await response.body?.cancel();throw new Error("This page asks crawlers not to index its content.");}
    const page=extractWebsite(await readLimited(response,2*1024*1024),url,root,section);
    if(/\b(nofollow|none)\b/i.test(directives))page.links=[];
    return {...page,url:url.href};
  }throw new Error("Too many page redirects.");
}
