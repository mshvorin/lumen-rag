import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';let cookie='',id;
async function call(path,options={}){const r=await fetch(base+path,{...options,headers:{...options.headers,...(cookie?{cookie}:{})}});return {status:r.status,body:await r.json()};}
const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://127.0.0.1',root:'https://127.0.0.1',section:false})};
assert.equal((await call('/api/crawl',options)).status,401);
const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});cookie=signIn.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
assert.equal((await call('/api/crawl',options)).status,422);
const source=`https://example.com/lumen-test-${Date.now()}`;
async function upload(text){const form=new FormData();form.append('file',new File([text],'test.txt'));form.append('pages',JSON.stringify([{page:null,text}]));form.append('sourceUrl',source);form.append('title','Website integration check');return call('/api/documents',{method:'POST',body:form});}
try{
 const first=await upload('The website test collection allows exactly seventeen visitors each day.');assert.equal(first.status,201);id=first.body.id;
 assert.equal((await upload('The website test collection allows exactly seventeen visitors each day.')).status,409);
 const changed=await upload('The website test collection now allows exactly twenty-three visitors each day.');assert.equal(changed.status,201);assert.equal(changed.body.id,id);
 const docs=await call('/api/documents');const saved=docs.body.documents.filter(d=>d.id===id);assert.equal(saved.length,1);assert.equal(saved[0].source_url,source);
 const answer=await call('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'How many visitors does the website test collection now allow each day?',threshold:.3})});assert.equal(answer.status,200);assert(answer.body.sources.some(s=>s.source_url===source&&s.content.includes('twenty-three')));
 console.log('Website integration passed: auth, private URL rejection, persistence, URL attribution, deduplication, reindexing, and live cited retrieval.');
}finally{if(id)assert.equal((await call('/api/documents?id='+id,{method:'DELETE'})).status,200);}
