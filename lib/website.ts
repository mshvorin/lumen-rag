import {load,type Cheerio} from "cheerio/slim";
import type {AnyNode} from "domhandler";
import robotsParser from "robots-parser";
import ipaddr from "ipaddr.js";

export const CRAWLER="LumenBot";
export function websiteUrl(value:string):URL {
  if(typeof value!=="string"||value.length>2048)throw new Error("Enter a website URL under 2,048 characters.");
  let url:URL;try{url=new URL(value.includes("://")?value:`https://${value}`);}catch{throw new Error("Enter a valid website URL.");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.port||!host.includes(".")||ipaddr.isValid(host.replace(/^\[|\]$/g,""))||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/.test(host)||/\.(localhost|local|internal|test|invalid|onion|arpa)$/.test(host))throw new Error("Use a public HTTPS website with a domain name and no custom port or credentials.");
  url.hash="";
  for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(key))url.searchParams.delete(key);
  url.searchParams.sort();return url;
}
export function inScope(url:URL,root:URL,section:boolean){
  if(url.hostname.replace(/^www\./,"")!==root.hostname.replace(/^www\./,""))return false;
  const prefix=root.pathname.replace(/\/$/,"");
  return !section||!prefix||url.pathname===prefix||url.pathname.startsWith(`${prefix}/`);
}
export function publicAddress(address:string){try{return ipaddr.parse(address).range()==="unicast";}catch{return false;}}
export function robotPolicy(text:string,url:URL){
  const robots=robotsParser(new URL("/robots.txt",url).href,text);
  if(robots.isAllowed(url.href,CRAWLER)===false)throw new Error("This page is disallowed by the website's robots.txt.");
  const delay=robots.getCrawlDelay(CRAWLER)||0;
  if(delay>30)throw new Error("The site's crawl delay exceeds the supported 30 seconds.");
  return Math.max(1,delay);
}
export function extractWebsite(html:string,url:URL,root:URL,section:boolean){
  const $=load(html);const title=($("title").first().text()||$("h1").first().text()||url.hostname).replace(/\s+/g," ").trim().slice(0,230);
  const directives=$("meta[name]").filter((_,el)=>/^(robots|lumenbot)$/i.test($(el).attr("name")||"")).map((_,el)=>$(el).attr("content")||"").get().join(",");
  if(/\b(noindex|none)\b/i.test(directives))throw new Error("This page asks crawlers not to index its content.");
  const preferred=$(".mw-parser-output").first();
  const main=preferred.length?preferred:$("main,[role='main']").first();
  const links=new Set<string>();
  const anchors=[...main.find("a[href]").toArray(),...$("a[href]").toArray()];
  if(!/\b(nofollow|none)\b/i.test(directives))anchors.forEach(el=>{
    if(links.size>=150||/\bnofollow\b/i.test($(el).attr("rel")||""))return;
    try{const link=websiteUrl(new URL($(el).attr("href")!,url).href);
      if(inScope(link,root,section)&&! /\.(pdf|zip|png|jpe?g|webp|gif|svg|mp[34]|docx?|xlsx?|exe|css|js)$/i.test(link.pathname)&&! /\/(Special|File|User|Talk|Template):/i.test(link.pathname))links.add(link.href);
    }catch{}
  });
  $("script,style,noscript,template,svg,iframe,form,nav,footer,[hidden],[aria-hidden='true'],[role='navigation'],[role='banner'],.mw-editsection,.noprint,.toc").remove();
  const body:Cheerio<AnyNode>=main.length&&main.text().trim().length>100?main:$("body").length?$("body"):$.root();
  body.find("br").replaceWith("\n");body.find("p,div,section,article,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre").append("\n");body.find("td,th").append(" | ");
  const full=body.text().replace(/\u0000/g,"").replace(/[\t \u00a0]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  if(full.length<80)throw new Error("Not enough readable text. This page may need JavaScript, a login, or allow crawler access.");
  if(/just a moment|attention required|verify you are human|access denied/i.test(title)&&full.length<5000)throw new Error("The site returned an access challenge. Try another public page or upload its text.");
  return {title,text:full.slice(0,60000),links:[...links],truncated:full.length>60000};
}
