export const EMBEDDING_MODEL="text-embedding-3-small";
export const DIMENSIONS=512;
export type Passage={content:string;page:number|null;position:number};
export function chunkPages(pages:{text:string;page:number|null}[]):Passage[]{
  const result:Passage[]=[];
  for(const page of pages){
    const text=page.text.replace(/\u0000/g,"").replace(/[\t ]+/g," ").trim();
    for(let start=0;start<text.length;){
      let end=Math.min(start+1600,text.length);
      if(end<text.length){const boundary=text.lastIndexOf(" ",end);if(boundary>start+1100)end=boundary;}
      result.push({content:text.slice(start,end).trim(),page:page.page,position:result.length});
      if(end===text.length)break;
      const overlapStart=Math.max(start+1,end-240);const boundary=text.indexOf(" ",overlapStart);
      start=boundary>=overlapStart&&boundary<end?boundary+1:overlapStart;
    }
  }
  return result;
}
export function cosine(a:number[],b:number[]):number{
  if(a.length!==b.length||!a.length)throw new Error("Incompatible embedding dimensions.");
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb))):0;
}
export function rank<T extends {embedding:string}>(rows:T[],query:number[],threshold:number){
  return rows.map(({embedding,...row})=>({...row,score:cosine(query,JSON.parse(embedding))})).filter(row=>row.score>=threshold).sort((a,b)=>b.score-a.score).slice(0,3);
}
