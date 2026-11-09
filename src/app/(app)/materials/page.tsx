"use client";
import { useEffect,useState } from "react";
import { PageTitle } from "@/components/shell";
import { createClient } from "@/lib/supabase/browser";
type Page={page:number;text:string};
async function extractFile(file:File,language:string,onProgress:(s:string)=>void):Promise<Page[]> {
  const ext=file.name.split(".").pop()?.toLowerCase();
  if(ext==="txt"||ext==="md") return [{page:1,text:await file.text()}];
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  if(pdf.numPages>50)throw new Error("Maximum PDF length is 50 pages.");
  const pages:Page[]=[]; let worker:any=null;
  try {
    for(let p=1;p<=pdf.numPages;p++){
      onProgress(`Extracting page ${p} of ${pdf.numPages}…`);
      const page=await pdf.getPage(p); const content=await page.getTextContent();
      let text=content.items.map((item:any)=>"str" in item?item.str:"").join(" ").trim();
      if(text.length<25){
        onProgress(`Running OCR on scanned page ${p}…`);
        if(!worker){const {createWorker}=await import("tesseract.js");worker=await createWorker(language);}
        const viewport=page.getViewport({scale:1.7});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d");if(!context)throw new Error("Could not create OCR canvas.");
        await page.render({canvasContext:context,viewport}).promise;
        const result=await worker.recognize(canvas);text=result.data.text.trim();
      }
      pages.push({page:p,text});
    }
  } finally { if(worker)await worker.terminate(); }
  return pages;
}
export default function Materials(){
 const [items,setItems]=useState<any[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[progress,setProgress]=useState(""),[category,setCategory]=useState("syllabus"),[language,setLanguage]=useState("eng");
 async function load(){const {data}=await createClient().from("materials").select("id,title,file_name,processing_status,indexed_chunks,total_chunks,category,uploaded_at").order("uploaded_at",{ascending:false});setItems(data||[]);}
 useEffect(()=>{load();},[]);
 async function processBatches(materialId:string){let complete=false;while(!complete){const r=await fetch("/api/materials/process",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({materialId,batchSize:3})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Indexing failed.");complete=!!d.completed;setProgress(`Indexed ${d.indexedChunks} of ${d.totalChunks} chunks…`);await load();}}
 async function upload(file?:File){if(!file)return;setBusy(true);setMessage("");setProgress("");let storagePath="";let materialCreated=false;try{
   if(file.size>10*1024*1024)throw new Error("Maximum file size is 10 MB.");const ext=file.name.split(".").pop()?.toLowerCase();if(!["pdf","txt","md"].includes(ext||""))throw new Error("Only PDF, TXT and Markdown files are supported.");
   const pages=await extractFile(file,language,setProgress);const full=pages.map(p=>p.text).join("\n");if(full.trim().length<80)throw new Error("Not enough text was extracted. Check scan quality or select the correct OCR language.");
   const supabase=createClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw new Error("Please log in again.");
   const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");storagePath=`${user.id}/${crypto.randomUUID()}/${safeName}`;
   const {error:storageError}=await supabase.storage.from("study-materials").upload(storagePath,file,{contentType:ext==="pdf"?"application/pdf":"text/plain",upsert:false});if(storageError)throw storageError;
   const response=await fetch("/api/materials",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,fileType:ext,category,storagePath,pages})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Material registration failed.");materialCreated=true;
   setProgress("Generating embeddings in resumable batches…");await processBatches(data.materialId);setMessage("Material uploaded, indexed and analysed successfully.");
 }catch(e:any){if(storagePath&&!materialCreated){await createClient().storage.from("study-materials").remove([storagePath]).catch(()=>{});}setMessage(e.message||"Upload failed.");}finally{setBusy(false);setProgress("");await load();}}
 async function resume(id:string){setBusy(true);try{await processBatches(id);setMessage("Processing completed.");}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 async function remove(id:string){const r=await fetch(`/api/materials?id=${id}`,{method:"DELETE"});const d=await r.json();if(!r.ok)setMessage(d.error||"Delete failed.");await load();}
 return <><PageTitle title="My Materials" subtitle="Upload syllabus, class notes and previous examination papers to create your private study knowledge base."/><div className="panel"><div className="grid sm:grid-cols-2 gap-3 mb-4"><label className="text-sm">Document category<select className="field mt-1" value={category} onChange={e=>setCategory(e.target.value)}><option value="syllabus">Syllabus</option><option value="notes">Class notes</option><option value="past_paper">Past paper</option></select></label><label className="text-sm">OCR language<select className="field mt-1" value={language} onChange={e=>setLanguage(e.target.value)}><option value="eng">English</option><option value="hin+eng">Hindi + English (requires language data support)</option></select></label></div><label className="block border-2 border-dashed rounded-xl p-9 text-center cursor-pointer hover:bg-slate-50"><div className="font-semibold">Choose PDF, TXT or Markdown</div><p className="text-sm text-slate-500 mt-2">Max 10 MB · PDF up to 50 pages · OCR fallback enabled</p><input type="file" accept=".pdf,.txt,.md" className="hidden" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/></label>{busy&&<p className="mt-3 text-sm text-indigo-700">{progress||"Processing material…"}</p>}{message&&<p className="mt-3 text-sm">{message}</p>}</div><div className="panel mt-5"><h2 className="font-semibold mb-3">Uploaded documents</h2>{items.length?items.map(item=><div key={item.id} className="flex flex-wrap justify-between items-center gap-3 border-b py-3"><div><b>{item.title}</b><p className="text-xs text-slate-500">{item.file_name} · {item.category} · {item.processing_status} · {item.indexed_chunks||0}/{item.total_chunks||0} chunks</p></div><div className="flex gap-3">{item.processing_status!=="completed"&&<button className="text-indigo-700 text-sm" disabled={busy} onClick={()=>resume(item.id)}>Resume</button>}<button className="text-red-600 text-sm" disabled={busy} onClick={()=>remove(item.id)}>Delete</button></div></div>):<p className="text-sm text-slate-500">No materials uploaded yet.</p>}</div></>;
}
