import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {scoreAnswers} from "@/lib/assessment";
const schema=z.object({attemptId:z.string().uuid(),answers:z.record(z.string().uuid(),z.string())});
export async function POST(req:Request){try{
 const {supabase,user}=await requireUser();const body=schema.parse(await req.json());const admin=createAdminClient();
 const {data:attempt,error:ae}=await admin.from("quiz_attempts").select("id,status,material_id").eq("id",body.attemptId).eq("user_id",user.id).single();if(ae||!attempt)throw new Error("Quiz attempt not found.");if(attempt.status!=="in_progress")throw new Error("This quiz has already been submitted.");
 const {data:questions,error:qe}=await admin.from("quiz_questions").select("id,options,correct_answer,explanation,option_explanations,topic_name,source_chunk_ids,citations").eq("attempt_id",body.attemptId).eq("user_id",user.id);if(qe||!questions?.length)throw new Error("Quiz questions not found.");
 const questionIds=new Set(questions.map(q=>q.id));if(Object.keys(body.answers).some(id=>!questionIds.has(id)))throw new Error("Submission contains an invalid question ID.");
 for(const q of questions){const selected=body.answers[q.id]||"";if(selected&&!((q.options as string[]).includes(selected)))throw new Error("An answer is not one of the available options.");}
 const scored=scoreAnswers(questions.map(q=>q.correct_answer),questions.map(q=>body.answers[q.id]||""));
 const topicRows=await supabase.from("topics").select("id,topic_name").eq("user_id",user.id);
 const results=questions.map((q)=>{const selected=body.answers[q.id]||"";const topic=topicRows.data?.find(t=>t.topic_name===q.topic_name);const optionNotes=(q.option_explanations||{}) as Record<string,string>;const feedback=selected===q.correct_answer?q.explanation:(optionNotes[selected]||q.explanation);return {question_id:q.id,user_id:user.id,attempt_id:body.attemptId,topic_id:topic?.id||null,topic_name:q.topic_name,selected_answer:selected,correct_answer:q.correct_answer,is_correct:selected===q.correct_answer,feedback,source_chunk_ids:q.source_chunk_ids,source_citations:q.citations,explanation:q.explanation,citations:q.citations};});
 const {error:insertError}=await admin.from("quiz_responses").insert(results.map(({explanation,citations,...r})=>r));if(insertError)throw insertError;
 const {error:updateError}=await admin.from("quiz_attempts").update({correct_answers:scored.correct,percentage:scored.percentage,status:"completed",completed_at:new Date().toISOString()}).eq("id",body.attemptId).eq("user_id",user.id);if(updateError)throw updateError;
 return NextResponse.json({percentage:scored.percentage,correct:scored.correct,total:questions.length,results:results.map(r=>({isCorrect:r.is_correct,selected:r.selected_answer,correctAnswer:r.correct_answer,topic:r.topic_name,explanation:r.explanation,feedback:r.feedback,citations:r.citations}))});
 }catch(e:any){return NextResponse.json({error:e.message||"Quiz submission failed."},{status:e.message==="Unauthorized"?401:400});}}
