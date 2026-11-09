import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {answerFromMaterials} from "@/lib/rag/answer";
export async function GET(req:Request){try{const {supabase,user}=await requireUser();const id=new URL(req.url).searchParams.get("sessionId");if(!id){const {data,error}=await supabase.from("chat_sessions").select("id,title,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30);if(error)throw error;return NextResponse.json({sessions:data||[]});}const {data:session,error:se}=await supabase.from("chat_sessions").select("id").eq("id",id).eq("user_id",user.id).single();if(se||!session)throw new Error("Chat session not found.");const {data,error}=await supabase.from("chat_messages").select("id,role,content,citations,created_at").eq("session_id",id).eq("user_id",user.id).order("created_at");if(error)throw error;return NextResponse.json({messages:data||[]});}catch(e:any){return NextResponse.json({error:e.message},{status:e.message==="Unauthorized"?401:400});}}
const schema=z.object({question:z.string().min(3).max(2000).optional(),sessionId:z.string().uuid().nullable().optional(),createOnly:z.boolean().optional()});
export async function POST(req:Request){try{const {supabase,user}=await requireUser();const body=schema.parse(await req.json());let sessionId=body.sessionId||null;
 if(sessionId){const {data,error}=await supabase.from("chat_sessions").select("id").eq("id",sessionId).eq("user_id",user.id).single();if(error||!data)throw new Error("Chat session not found.");}
 else {const title=body.question?.slice(0,60)||"New study chat";const {data,error}=await supabase.from("chat_sessions").insert({user_id:user.id,title}).select("id").single();if(error)throw error;sessionId=data.id;}
 if(body.createOnly)return NextResponse.json({sessionId});if(!body.question)throw new Error("Question is required.");
 const {error:userMessageError}=await supabase.from("chat_messages").insert({session_id:sessionId,user_id:user.id,role:"user",content:body.question});if(userMessageError)throw userMessageError;
 const result=await answerFromMaterials(supabase,body.question);
 const {error:assistantError}=await supabase.from("chat_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:result.answer,citations:result.citations});if(assistantError)throw assistantError;
 return NextResponse.json({sessionId,answer:result.answer,citations:result.citations});
 }catch(e:any){return NextResponse.json({error:e.message||"Chat failed."},{status:e.message==="Unauthorized"?401:400});}}
