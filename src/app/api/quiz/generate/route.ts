import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {retrieveChunks} from "@/lib/rag/retrieve";
import {gemini,generationModel} from "@/lib/gemini/client";
import {parseJson} from "@/lib/gemini/json";
import {quizSchema} from "@/lib/validation";
const schema=z.object({materialId:z.string().uuid(),count:z.number().int().min(5).max(15)});
export const maxDuration=30;
export async function POST(req:Request){try{
 const {supabase,user}=await requireUser();const {materialId,count}=schema.parse(await req.json());
 const {data:material,error:me}=await supabase.from("materials").select("id,title,processing_status").eq("id",materialId).eq("user_id",user.id).single();if(me||!material)throw new Error("Material not found.");if(material.processing_status!=="completed")throw new Error("Wait until this material has finished indexing.");
 const {data:topics}=await supabase.from("topics").select("id,topic_name").eq("material_id",materialId).limit(12);
 const retrieved=[] as any[];if(topics?.length){for(const topic of topics.slice(0,8)){const rows=await retrieveChunks(supabase,topic.topic_name,[materialId],2);retrieved.push(...rows);}}else{retrieved.push(...await retrieveChunks(supabase,"Important definitions, concepts, examples and key ideas in this study material",[materialId],12));}
 const unique=[...new Map(retrieved.filter(c=>c.similarity>=0.25).map(c=>[c.id,c])).values()].slice(0,24);if(!unique.length)throw new Error("Could not retrieve sufficient source passages for a quiz.");
 const allowed=new Map(unique.map(c=>[c.id,c]));const context=unique.map(c=>`CHUNK_ID:${c.id}\nDOCUMENT:${c.document_title}\nPAGE:${c.page_number??"unknown"}\nSECTION:${c.section_heading??"unknown"}\n${c.content}`).join("\n\n");
 const response=await gemini().models.generateContent({model:generationModel(),contents:`Create up to ${count} high-quality multiple-choice questions using ONLY these reference passages. Aim for broad topic coverage without duplicates. Return JSON only: {"questions":[{"question":"...","options":["A","B","C","D"],"correct_answer":"exact option text","explanation":"...","option_explanations":{"option text":"why"},"topic":"...","difficulty":"Easy|Medium|Hard","source_chunk_ids":["exact supplied UUID"]}]}. Exactly four options, one correct answer, and at least one valid source chunk ID per question. No unsupported claims.\n\n${context}`});
 const parsed=quizSchema.parse(parseJson(response.text||"{}"));const questions=parsed.questions.slice(0,count);
 for(const q of questions){if(!q.options.includes(q.correct_answer)||q.source_chunk_ids.some(id=>!allowed.has(id)))throw new Error("Generated question failed source or answer validation.");}
 const {data:attempt,error:ae}=await supabase.from("quiz_attempts").insert({user_id:user.id,material_id:materialId,total_questions:questions.length,correct_answers:0,percentage:0,status:"in_progress"}).select("id").single();if(ae)throw ae;
 const admin=createAdminClient();const rows=questions.map(q=>({user_id:user.id,attempt_id:attempt.id,question:q.question,options:q.options,correct_answer:q.correct_answer,explanation:q.explanation,option_explanations:q.option_explanations,topic_name:q.topic,difficulty:q.difficulty,source_chunk_ids:q.source_chunk_ids,citations:q.source_chunk_ids.map(id=>{const c=allowed.get(id)!;return {chunk_id:id,document:c.document_title,page:c.page_number,section:c.section_heading};})}));
 const {data:saved,error:saveError}=await admin.from("quiz_questions").insert(rows).select("id,question,options,topic_name,difficulty,citations");if(saveError)throw saveError;
 return NextResponse.json({attemptId:attempt.id,questions:(saved||[]).map(q=>({id:q.id,question:q.question,options:q.options,topic:q.topic_name,difficulty:q.difficulty,citations:q.citations}))});
 }catch(e:any){return NextResponse.json({error:e.message||"Quiz generation failed."},{status:e.message==="Unauthorized"?401:400});}}
