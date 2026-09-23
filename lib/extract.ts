export type PageText = { page: number | null; text: string };
export async function extractFile(file: File, progress:(message:string)=>void=()=>{}): Promise<PageText[]> {
  const extension=file.name.split(".").pop()?.toLowerCase();let pages:PageText[];
  if(extension==="pdf") {
    const pdf=await import("pdfjs-dist");pdf.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
    const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),wasmUrl:"/pdf-wasm/",standardFontDataUrl:"/pdf-fonts/",cMapUrl:"/pdf-cmaps/",cMapPacked:true});const document=await task.promise;
    let ocr:import("tesseract.js").Worker|undefined;
    try{if(document.numPages>300)throw new Error("Please split PDFs larger than 300 pages.");pages=[];
      for(let i=1;i<=document.numPages;i++){
        progress(`Reading page ${i} of ${document.numPages}…`);
        const page=await document.getPage(i);const content=await page.getTextContent();
        let text=content.items.map(item=>"str" in item?item.str+(item.hasEOL?"\n":" "):"").join("");
        // Headers can be selectable even when the page body is an image.
        if(text.trim().length<400){
          progress(`Reading scanned page ${i} of ${document.numPages}…`);
          if(!ocr){const {createWorker}=await import("tesseract.js");ocr=await createWorker("eng",1,{workerPath:"/ocr/worker.min.js",corePath:"/ocr",langPath:"/ocr/lang",workerBlobURL:false});}
          const viewport=page.getViewport({scale:2});const canvas=window.document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          try{await page.render({canvas,viewport}).promise;const result=await ocr.recognize(canvas);if(result.data.text.trim().length>text.trim().length)text=result.data.text;}
          finally{canvas.width=0;canvas.height=0;}
        }
        pages.push({page:i,text});page.cleanup();
      }
    }finally{if(ocr)await ocr.terminate();await task.destroy();}
  }else if(extension==="docx") {const mammoth=await import("mammoth");pages=[{page:null,text:(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value}];
  }else if(["txt","md","csv"].includes(extension||"")){pages=[{page:null,text:await file.text()}];
  }else throw new Error("Choose a PDF, DOCX, TXT, Markdown, or CSV file.");
  if(!pages.some(p=>p.text.trim()))throw new Error("No readable text found, even after OCR. Try a clearer scan.");
  if(pages.reduce((n,p)=>n+p.text.length,0)>600000)throw new Error("Please split documents larger than 600,000 characters.");return pages;
}
