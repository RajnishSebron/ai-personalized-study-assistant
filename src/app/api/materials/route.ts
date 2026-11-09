import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {materialSchema} from "@/lib/validation";
import {chunkText} from "@/lib/document/chunk";
export const maxDuration = 30;
export async function POST(req:Request){
  try{
    const {supabase,user}=await requireUser();const body=materialSchema.parse(await req.json());
    if(!body.storagePath.startsWith(`${user.id}/`))throw new Error("Invalid storage path.");
    const totalChars=body.pages.reduce((n,p)=>n+p.text.length,0);if(totalChars>500000)throw new Error("Extracted text is too large. Split the PDF into smaller files.");
    const chunks=chunkText(body.pages);if(!chunks.length)throw new Error("No text chunks extracted.");
    const {data:material,error}=await supabase.from("materials").insert({user_id:user.id,title:body.fileName.replace(/\.[^.]+$/,""),file_name:body.fileName,file_type:body.fileType,category:body.category,storage_path:body.storagePath,processing_status:"indexing",total_pages:body.pages.length,total_chunks:chunks.length,indexed_chunks:0}).select("id").single();if(error)throw error;
    const rows=chunks.map(c=>({material_id:material.id,user_id:user.id,chunk_index:c.chunk_index,content:c.content,page_number:c.page_number,section_heading:c.section_heading,embedding:null}));
    for(let i=0;i<rows.length;i+=50){const {error:e}=await supabase.from("document_chunks").insert(rows.slice(i,i+50));if(e){await supabase.from("materials").delete().eq("id",material.id);throw e;}}
    return NextResponse.json({materialId:material.id,totalChunks:chunks.length});
  }catch(e:any){return NextResponse.json({error:e.message||"Material registration failed."},{status:e.message==="Unauthorized"?401:400});}
}
export async function DELETE(req:Request){
  try{const {supabase,user}=await requireUser();const id=new URL(req.url).searchParams.get("id");if(!id)throw new Error("Missing material ID.");
    const {data:material,error}=await supabase.from("materials").select("storage_path").eq("id",id).eq("user_id",user.id).single();if(error||!material)throw new Error("Material not found.");
    if(material.storage_path){const {error:storageError}=await supabase.storage.from("study-materials").remove([material.storage_path]);if(storageError)throw storageError;}
    const {error:deleteError}=await supabase.from("materials").delete().eq("id",id).eq("user_id",user.id);if(deleteError)throw deleteError;
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e.message||"Delete failed."},{status:e.message==="Unauthorized"?401:400});}
}
