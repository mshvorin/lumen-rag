import assert from 'node:assert/strict';
const base='http://localhost:5173';
let cookie='';const ids=[];
async function call(path,options={}){const r=await fetch(base+path,{...options,headers:{...options.headers,...(cookie?{cookie}:{})}});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body={error:text}}return {status:r.status,body};}
const anonymous=await call('/api/documents');assert.equal(anonymous.status,401);
const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});cookie=signIn.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert(cookie);
const initial=await call('/api/documents');assert.equal(initial.status,200);assert.equal(initial.body.connected,true);
const text='Lumen test policy: Employees receive 24 days of annual leave. Annual leave requests require manager approval. Submit requests at least seven days before the first day of leave.';
async function upload(index){const form=new FormData();form.append('file',new File([text+index],`lumen-check-${Date.now()}-${index}.txt`,{type:'text/plain'}));form.append('pages',JSON.stringify([{page:null,text:text+index}]));return call('/api/documents',{method:'POST',body:form});}
try{
  for(let i=0;i<4;i++){const result=await upload(i);assert.equal(result.status,201,JSON.stringify(result.body));ids.push(result.body.id);}
  const duplicate=await upload(0);assert.equal(duplicate.status,409);
  const list=await call('/api/documents');assert.equal(list.body.documents.length,initial.body.documents.length+4);
  const query={question:'How many days of annual leave do employees receive?',threshold:.3};
  const answer=await call('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query)});
  assert.equal(answer.status,200,JSON.stringify(answer.body));assert.equal(answer.body.sources.length,3);assert.match(answer.body.answer,/24/);assert.match(answer.body.answer,/\[[123]\]/);assert(answer.body.sources.every(s=>s.score>=.3));
  const noMatch=await call('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...query,threshold:1})});assert.equal(noMatch.status,200);assert.equal(noMatch.body.noMatch,true);assert.equal(noMatch.body.sources.length,0);
  const invalid=await call('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...query,threshold:1.5})});assert.equal(invalid.status,400);
  const crossOrigin=await call('/api/ask',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify(query)});assert.equal(crossOrigin.status,403);
  console.log(JSON.stringify({passed:true,checks:['authentication','persistent upload','deduplication','live embeddings','cosine retrieval','top 3','live cited answer','no-match threshold','input validation','origin validation'],answer:answer.body.answer,scores:answer.body.sources.map(s=>s.score)}));
}finally{for(const id of ids){const deleted=await call('/api/documents?id='+id,{method:'DELETE'});assert.equal(deleted.status,200);}const final=await call('/api/documents');assert.equal(final.body.documents.length,initial.body.documents.length);console.log('Test documents removed; collection restored.');}
