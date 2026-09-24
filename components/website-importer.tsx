"use client";
import {useRef,useState} from "react";
import {Globe,ArrowUpRight,LoaderCircle,Check} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";

type Entry={url:string;message:string;ok:boolean};
type Page={url:string;title:string;text:string;links:string[];truncated:boolean};
export function WebsiteImporter({disabled,onBusy,onComplete}:{disabled:boolean;onBusy:(message:string)=>void;onComplete:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[url,setUrl]=useState(""),[limit,setLimit]=useState(5),[depth,setDepth]=useState(1),[section,setSection]=useState(false);
  const [running,setRunning]=useState(false),[stopping,setStopping]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[summary,setSummary]=useState(""),[current,setCurrent]=useState(""),[error,setError]=useState("");
  const stop=useRef(false);
  async function crawl(){
    if(running||disabled)return;
    let root:string;try{root=new URL(url.includes("://")?url:`https://${url}`).href;}catch{setError("Enter a valid website URL.");return;}
    if(!Number.isInteger(limit)||limit<1||limit>25){setError("Choose between 1 and 25 pages.");return;}
    setRunning(true);setStopping(false);stop.current=false;setEntries([]);setSummary("");setError("");
    const queue=[{url:root,depth:0}],seen=new Set([root]),resolved=new Set<string>();let visited=0,added=0,unchanged=0,chars=0;let reason="No more links in the chosen scope.";
    try{
      while(queue.length&&visited<limit&&!stop.current){
        const item=queue.shift()!;if(resolved.has(item.url))continue;visited++;setCurrent(item.url);onBusy(`Reading website page ${visited} of ${limit}…`);
        try{
          const response=await fetch("/api/crawl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.url,root,section})});
          if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("The server could not read this page. Try again.");
          const page=await response.json() as Page&{error?:string};if(!response.ok)throw new Error(page.error||"Could not read this page.");
          if(resolved.has(page.url)){setEntries(e=>[...e,{url:item.url,message:"Already visited after redirect",ok:true}]);continue;}resolved.add(page.url);
          if(chars+page.text.length>600000){reason="Reached the 600,000-character import limit.";break;}chars+=page.text.length;
          if(item.depth<depth)for(const link of page.links){if(!seen.has(link)&&seen.size<500){seen.add(link);queue.push({url:link,depth:item.depth+1});}}
          onBusy(`Embedding website page ${visited} of ${limit}…`);
          const form=new FormData();form.append("file",new File([page.text],`${page.title.replace(/[\\/:*?"<>|]/g,"_")}.txt`,{type:"text/plain"}));form.append("pages",JSON.stringify([{page:null,text:page.text}]));form.append("sourceUrl",page.url);form.append("title",page.title);
          const indexed=await fetch("/api/documents",{method:"POST",body:form});
          if(!indexed.headers.get("content-type")?.includes("application/json"))throw new Error("Indexing did not complete. Check your collection before retrying.");
          const result=await indexed.json() as {error?:string};
          if(indexed.status===409&&result.error?.includes("already")){unchanged++;setEntries(e=>[...e,{url:page.url,message:"Already indexed · unchanged",ok:true}]);}
          else if(!indexed.ok)throw new Error(result.error||"Could not index this page.");
          else {added++;setEntries(e=>[...e,{url:page.url,message:page.truncated?"Indexed · first 60,000 characters":"Indexed",ok:true}]);}
        }catch(e){const message=(e as Error).message;setEntries(rows=>[...rows,{url:item.url,message,ok:false}]);if(/quota|capacity|3,000|Sign in|not configured|authorize|storage/i.test(message)){reason=message;break;}}
      }
      if(stop.current)reason="Stopped after the current page.";else if(visited>=limit)reason="Reached your page limit.";
      setSummary(`${added} page${added===1?"":"s"} indexed · ${unchanged} unchanged · ${visited} attempted. ${reason}`);
    }finally{onBusy("");setRunning(false);setCurrent("");await onComplete();}
  }
  return <>
    <button className="website-add secondary" disabled={disabled} onClick={()=>setOpen(true)}><Globe size={17}/>Add a website<ArrowUpRight size={16}/></button>
    {summary&&<button className="crawl-summary" onClick={()=>setOpen(true)}>{summary}</button>}
    <Dialog open={open} onOpenChange={value=>{if(!running)setOpen(value);}}><DialogContent className="website-dialog"><DialogTitle>Add a website</DialogTitle><DialogDescription>Turn public web pages into searchable knowledge, with links back to every source.</DialogDescription>
      <form onSubmit={e=>{e.preventDefault();void crawl();}}>
        <label className="website-field">Starting URL<input aria-label="Starting URL" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.jackjaffa.com" required maxLength={2048} disabled={running}/></label>
        <div className="crawl-controls"><label className="website-field">Maximum pages<input aria-label="Maximum pages" type="number" min={1} max={25} value={limit} onChange={e=>setLimit(Number(e.target.value))} disabled={running}/></label><label className="website-field">Link depth<select aria-label="Link depth" value={depth} onChange={e=>setDepth(Number(e.target.value))} disabled={running}><option value={0}>0 · Starting page only</option><option value={1}>1 · Direct links</option><option value={2}>2 · Two links away</option><option value={3}>3 · Three links away</option></select></label></div>
        <label className="website-field">Crawl scope<select aria-label="Crawl scope" value={section?"section":"site"} onChange={e=>setSection(e.target.value==="section")} disabled={running}><option value="site">Same website</option><option value="section">Only URLs under the starting path</option></select></label>
        <p className="settings-note">Up to 25 pages per import, including the starting page. Depth controls how far links are followed. Keep this tab open while importing. Pages already saved stay in your collection if you stop.</p>
        <p className="website-hint">Public HTML text only. Some wikis and sites block crawlers or require JavaScript; skipped pages appear below. Website crawling rules are respected.</p>
        {error&&<p role="alert" className="website-error">{error}</p>}
        {running?<button className="secondary website-stop" type="button" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);}}> {stopping?"Stopping after this page…":"Stop after this page"}</button>:<button type="submit" className="primary" disabled={disabled||!url.trim()}><Globe size={16}/>{entries.length?"Import again":"Import website"}</button>}
      </form>
      <div aria-live="polite">{running&&<div className="crawl-current"><LoaderCircle size={16} className="spin"/><span>{current}</span></div>}{summary&&<p className="crawl-result">{summary}</p>}</div>
      {!!entries.length&&<ul className="crawl-log">{entries.map((entry,i)=><li key={i}>{entry.ok?<Check size={14}/>:<span className="skip-dot">!</span>}<div><span title={entry.url}>{entry.url}</span><small>{entry.message}</small></div></li>)}</ul>}
    </DialogContent></Dialog>
  </>;
}
