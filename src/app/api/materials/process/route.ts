import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {embedDocument} from "@/lib/rag/embeddings";
import {gemini,generationModel} from "@/lib/gemini/client";
import {parseJson} from "@/lib/gemini/json";
export const maxDuration=30;
const schema=z.object({materialId:z.string().uuid(),batchSize:z.number().int().min(1).max(5).default(3)});
export async function POST(req:Request){
 try{
  const {supabase,user}=await requireUser();const {materialId,batchSize}=schema.parse(await req.json());
  const {data:material,error:me}=await supabase.from("materials").select("id,title,category,total_chunks,indexed_chunks,processing_status").eq("id",materialId).eq("user_id",user.id).single();if(me||!material)throw new Error("Material not found.");
  if(material.processing_status==="completed")return NextResponse.json({completed:true,indexedChunks:material.indexed_chunks,totalChunks:material.total_chunks});
  const {data:pending,error}=await supabase.from("document_chunks").select("id,content").eq("material_id",materialId).eq("user_id",user.id).is("embedding",null).order("chunk_index").limit(batchSize);if(error)throw error;
  for(const chunk of pending||[]){const vector=await embedDocument(chunk.content);const {error:updateError}=await supabase.from("document_chunks").update({embedding:vector}).eq("id",chunk.id).eq("user_id",user.id);if(updateError)throw updateError;}
  const {count,error:countError}=await supabase.from("document_chunks").select("id",{count:"exact",head:true}).eq("material_id",materialId).eq("user_id",user.id).not("embedding","is",null);if(countError)throw countError;
  const indexed=count||0;await supabase.from("materials").update({indexed_chunks:indexed,processing_status:"indexing",last_error:null}).eq("id",materialId).eq("user_id",user.id);
  const total=material.total_chunks||0;
  if(indexed>=total){
    if(material.category==="syllabus"){
      const {count:existingTopics}=await supabase.from("topics").select("id",{count:"exact",head:true}).eq("material_id",materialId).eq("user_id",user.id);
      if((existingTopics||0)===0){
      const {data:source}=await supabase.from("document_chunks").select("content").eq("material_id",materialId).order("chunk_index").limit(30);
      const context=(source||[]).map(x=>x.content).join("\n\n").slice(0,30000);
      const response=await gemini().models.generateContent({model:generationModel(),contents:`Extract a hierarchical syllabus outline ONLY from this text. Return JSON only: {"topics":[{"name":"string","description":"string","parent_name":null}]}. parent_name must exactly match a parent topic name from this response or be null. Do not invent content.\n\n${context}`});
      const parsed=parseJson<{topics:{name:string;description?:string;parent_name:string|null}[]}>(response.text||"{}");
      const safe=(parsed.topics||[]).slice(0,100);const ids=new Map<string,string>();
      for(const topic of safe){const parentId=topic.parent_name?ids.get(topic.parent_name)||null:null;const {data:created,error:te}=await supabase.from("topics").insert({user_id:user.id,material_id:materialId,topic_name:topic.name,description:topic.description||null,parent_topic_id:parentId}).select("id").single();if(te)throw te;if(created)ids.set(topic.name,created.id);}
      }
    }
    await supabase.from("materials").update({processing_status:"completed",indexed_chunks:indexed,last_error:null}).eq("id",materialId).eq("user_id",user.id);
    return NextResponse.json({completed:true,indexedChunks:indexed,totalChunks:total});
  }
  return NextResponse.json({completed:false,indexedChunks:indexed,totalChunks:total});
 }catch(e:any){return NextResponse.json({error:e.message||"Indexing batch failed."},{status:e.message==="Unauthorized"?401:400});}
}
