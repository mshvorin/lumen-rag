"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, ChevronRight, FileText, FolderOpen, Layers3, LoaderCircle, Plus, ScanText, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Doc = { id: string; name: string; bytes: number; chunks: number; words: number };
type Source = { name: string; content: string; score: number; position: number; page: number | null };
type Answer = { answer: string; sources: Source[]; elapsed: number; noMatch?: boolean };
const steps = [{icon:Upload,name:"Add documents",hint:"Your knowledge"},{icon:ScanText,name:"Extract & embed",hint:"Searchable passages"},{icon:Search,name:"Find the best matches",hint:"Cosine similarity"},{icon:Sparkles,name:"Get a grounded answer",hint:"With sources"}];
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("The server could not complete this request. Refresh the page and try again.");
  const body: any = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again."); return body;
}
export default function Home() {
  const [docs,setDocs]=useState<Doc[]>([]), [loading,setLoading]=useState(true), [connected,setConnected]=useState(false);
  const [busy,setBusy]=useState(""), [error,setError]=useState(""), [question,setQuestion]=useState(""), [asked,setAsked]=useState("");
  const [threshold,setThreshold]=useState(.3), [answer,setAnswer]=useState<Answer|null>(null), [asking,setAsking]=useState(false);
  const [dragging,setDragging]=useState(false), [settings,setSettings]=useState(false), [selected,setSelected]=useState<Source|null>(null);
  const [remove,setRemove]=useState<Doc|null>(null), [deleting,setDeleting]=useState(false);
  const input=useRef<HTMLInputElement>(null), textarea=useRef<HTMLTextAreaElement>(null);
  async function refresh() {
    try {const result=await api("/api/documents");setDocs(result.documents);setConnected(result.connected);}
    catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function upload(files:File[]) {
    if(!files.length||busy||asking)return;setError("");const failures:string[]=[];
    for(const file of files)try {
      if(file.size>15*1024*1024)throw new Error("Maximum file size is 15 MB.");
      setBusy(`Reading ${file.name}…`);const {extractFile}=await import("@/lib/extract");const pages=await extractFile(file,setBusy);
      setBusy(`Embedding ${file.name}…`);const form=new FormData();form.append("file",file);form.append("pages",JSON.stringify(pages));
      await api("/api/documents",{method:"POST",body:form});
    }catch(e){failures.push(`${file.name}: ${(e as Error).message}`);}
    setBusy("");await refresh();if(failures.length)setError(failures.join("\n"));if(input.current)input.current.value="";
  }
  async function ask(value=question) {
    if(!value.trim()||asking||busy||!docs.length)return;
    setAsking(true);setError("");setAsked(value.trim());setAnswer(null);
    try {const result=await api("/api/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:value.trim(),threshold})});setAnswer(result);return result;}
    catch(e){setError((e as Error).message);}finally{setAsking(false);}
  }
  async function deleteDocument() {
    if(!remove)return;setDeleting(true);setError("");
    try{await api(`/api/documents?id=${encodeURIComponent(remove.id)}`,{method:"DELETE"});setRemove(null);setAnswer(null);await refresh();}
    catch(e){setError((e as Error).message);}finally{setDeleting(false);}
  }
  const totalChunks=docs.reduce((sum,d)=>sum+d.chunks,0);
  const actions=useRef({ask,setQuestion});actions.current={ask,setQuestion};
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:object,options:object)=>unknown}}).modelContext;
    if(!context?.registerTool)return;const lifecycle=new AbortController();
    try{Promise.resolve(context.registerTool({name:"ask_documents",title:"Ask your documents",description:"Search the current document collection and generate a cited answer using the current similarity threshold. Calls OpenAI and displays the result.",inputSchema:{type:"object",properties:{question:{type:"string",minLength:1,maxLength:2000}},required:["question"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input:unknown){
      const q=(input as {question?:unknown})?.question;if(typeof q!=="string"||!q.trim()||q.length>2000)throw new Error("Enter a question of up to 2,000 characters.");
      actions.current.setQuestion(q);const result=await actions.current.ask(q);if(!result)throw new Error("Add documents and wait for the current operation to finish, or check the displayed error.");
      return {answer:result.answer,sources:result.sources.map((s:Source)=>({name:s.name,page:s.page,score:s.score}))};
    }},{signal:lifecycle.signal})).catch(()=>{});}catch{}return ()=>lifecycle.abort();
  },[]);
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Lumen home"><span className="brand-icon"><Layers3 size={22}/></span>lumen<span className="brand-divider"/><span className="brand-sub">Document intelligence</span></a><div className="top-right"><span className="private"><ShieldCheck size={15}/>Private workspace</span><span className="avatar"><FolderOpen size={15}/></span></div></header>
    <main><div className="page-heading"><div><div className="eyebrow">YOUR KNOWLEDGE, CONNECTED</div><h1>A little clarity. From every file.</h1><p>Bring your documents together. Find the answers inside.</p></div><button className="secondary" onClick={()=>setSettings(true)}><SlidersHorizontal size={16}/>Retrieval settings</button></div>
      <div className="pipeline" aria-label="Document processing pipeline">{steps.map((step,i)=><div className="pipeline-step" key={step.name}><span className={`step-icon step-${i}`}><step.icon size={19}/></span><div><span className="step-number">0{i+1}</span><strong>{step.name}</strong><small>{step.hint}</small></div>{i<3&&<ChevronRight className="step-arrow" size={18}/>}</div>)}</div>
      <div className="workspace"><section className="collection panel" aria-labelledby="collection-title"><div className="section-heading"><div className="section-title"><FolderOpen size={19}/><h2 id="collection-title">Your collection</h2><span className="count">{docs.length}</span></div><button className="icon-button" aria-label="Add documents" disabled={!!busy||asking} onClick={()=>input.current?.click()}><Plus size={19}/></button></div>
        <input ref={input} type="file" multiple accept=".pdf,.txt,.md,.csv,.docx" className="sr-only" aria-label="Choose documents" onChange={e=>void upload(Array.from(e.target.files||[]))}/>
        <button disabled={!!busy||asking} className={`dropzone ${dragging?"dragging":""}`} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(Array.from(e.dataTransfer.files));}}><span className="upload-icon">{busy?<LoaderCircle className="spin" size={23}/>:<Upload size={23}/>}</span><strong>{busy||"Drop your files here"}</strong><span>{busy?"Preparing your document for search":"or click to browse your files"}</span><small>PDF, DOCX, TXT, Markdown, CSV · up to 15 MB</small></button>
        <div className="file-list" aria-live="polite">{loading?<div className="collection-empty"><LoaderCircle className="spin" size={22}/><p>Loading your collection…</p></div>:docs.length?docs.map(doc=><div className="file-row" key={doc.id}><span className={`file-icon ${doc.name.toLowerCase().endsWith(".pdf")?"pdf":""}`}><FileText size={20}/></span><div className="file-info"><strong title={doc.name}>{doc.name}</strong><small>{doc.chunks} passages · {doc.words.toLocaleString()} words</small><span className="ready"><Check size={11}/>Ready to search</span></div><button className="icon-button delete" aria-label={`Delete ${doc.name}`} onClick={()=>setRemove(doc)} disabled={!!busy||asking}><Trash2 size={15}/></button></div>):<div className="collection-empty"><div className="empty-file-icon"><FileText size={23}/></div><strong>Your knowledge starts here</strong><p>Add a document to make its contents<br/>searchable and ready for questions.</p></div>}</div>
        <div className="collection-footer"><span><Layers3 size={14}/>{totalChunks.toLocaleString()} indexed passages</span><span>{docs.length} {docs.length===1?"file":"files"}</span></div></section>
        <section className="answers panel" aria-labelledby="answer-title"><div className="section-heading"><div className="section-title"><Sparkles size={19}/><h2 id="answer-title">Ask your documents</h2></div><span className={`connection ${connected?"online":""}`}><span/>{connected?"OpenAI configured":loading?"Connecting":"Setup needed"}</span></div>
          <div className="conversation" aria-live="polite">{!answer&&!asking?<div className="ask-empty"><span className="sparkle-tile"><Sparkles size={29}/></span><div className="eyebrow">FROM INFORMATION TO INSIGHT</div><h2>Good questions.<br/><span>Grounded answers.</span></h2><p>Ask in your own words. Every answer is built<br className="desktop-break"/> from the most relevant passages in your files.</p><div className="prompt-suggestions">{["What are the key takeaways?","What does the document say about…"].map(q=><button key={q} onClick={()=>{setQuestion(q);textarea.current?.focus();}}>{q}<ArrowUpRight size={15}/></button>)}</div></div>:<><div className="question-bubble">{asked}</div>{asking?<div className="answer-loading"><LoaderCircle className="spin" size={20}/><div><strong>Finding the right context…</strong><p>Searching your collection, then composing an answer.</p></div></div>:answer&&<div className="answer-result"><div className="answer-label"><span className="mini-logo"><Sparkles size={15}/></span><strong>{answer.noMatch?"No matching passages":"Answer"}</strong><span>{(answer.elapsed/1000).toFixed(1)}s</span></div><div className="answer-text">{answer.answer.split(/(\[\d+\])/g).map((part,i)=>{const n=Number(part.match(/^\[(\d+)\]$/)?.[1]);return n&&answer.sources[n-1]?<button className="citation" key={i} onClick={()=>setSelected(answer.sources[n-1])}>{n}</button>:<span key={i}>{part}</span>;})}</div>{!!answer.sources.length&&<div className="sources"><div className="sources-heading">SOURCES <span>{answer.sources.length} matched passages</span></div>{answer.sources.map((s,i)=><button className="source-row" key={i} onClick={()=>setSelected(s)}><span className="source-number">{i+1}</span><div><strong>{s.name}</strong><small>{s.page?`Page ${s.page}`:`Passage ${s.position+1}`}</small></div><span className="score">{s.score.toFixed(3)}</span><ArrowUpRight size={15}/></button>)}</div>}</div>}</>}</div>
          <form className="composer" onSubmit={e=>{e.preventDefault();void ask();}}><label className="sr-only" htmlFor="question">Your question</label><textarea ref={textarea} id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What would you like to know?" maxLength={2000} rows={2} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void ask();}}}/><div className="composer-bottom"><span><FolderOpen size={13}/>{docs.length?`Searching ${docs.length} ${docs.length===1?"document":"documents"}`:"Add a document to get started"}</span><button className="send" type="submit" disabled={!docs.length||!question.trim()||asking||!!busy} aria-label="Ask question">{asking?<LoaderCircle className="spin" size={18}/>:<ArrowUp size={20}/>}</button></div></form>
          <div className="answer-footer"><ShieldCheck size={13}/>Answers grounded in your files.<span>Top 3 · similarity ≥ {threshold.toFixed(2)}</span></div></section></div>
      {error&&<div role="alert" className="error-banner"><span>{error}{error.includes("Sign in")&&<> <a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to continue</a></>}</span><button aria-label="Dismiss error" className="icon-button" onClick={()=>setError("")}><X size={17}/></button></div>}
      <footer className="page-footer"><span>Less searching. More understanding.</span><span>Powered by OpenAI <span className="footer-dot">·</span> Built around your knowledge</span></footer></main>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="settings-dialog"><DialogTitle>Retrieval settings</DialogTitle><DialogDescription>Control how closely a passage must match your question.</DialogDescription><div className="threshold-label"><label id="threshold-label">Minimum cosine similarity</label><strong>{threshold.toFixed(2)}</strong></div><Slider aria-labelledby="threshold-label" value={[threshold]} min={0} max={1} step={.01} onValueChange={v=>setThreshold(v[0])}/><div className="range-labels"><span>Broader results</span><span>Stricter matches</span></div><p className="settings-note">Start at 0.30. Similarity scores are not confidence percentages. A threshold of 0.90 is very strict and may return no matches. If nothing qualifies, Lumen won’t generate an unsupported answer.</p><div className="setting-row"><span>Passages sent to OpenAI</span><strong>Up to 3</strong></div><div className="setting-row"><span>Embedding model</span><strong>text-embedding-3-small</strong></div><button className="primary" onClick={()=>setSettings(false)}>Done<Check size={16}/></button></DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="source-dialog"><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.page?`Page ${selected.page}`:`Passage ${(selected?.position||0)+1}`} · cosine similarity {selected?.score.toFixed(3)}</DialogDescription><div className="source-content">{selected?.content}</div></DialogContent></Dialog>
    <AlertDialog open={!!remove} onOpenChange={open=>{if(!open&&!deleting)setRemove(null);}}><AlertDialogContent><AlertDialogTitle>Remove this document?</AlertDialogTitle><AlertDialogDescription>“{remove?.name}” and its indexed passages will be removed from your collection.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={e=>{e.preventDefault();void deleteDocument();}}>{deleting?"Removing…":"Remove document"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
