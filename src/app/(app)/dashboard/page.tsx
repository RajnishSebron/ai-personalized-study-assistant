import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
export default async function Dashboard() {
  const {supabase,user}=await requireUser();
  const [materials,topics,attempts,completed] = await Promise.all([
    supabase.from("materials").select("id",{count:"exact",head:true}),
    supabase.from("topics").select("id",{count:"exact",head:true}),
    supabase.from("quiz_attempts").select("id,percentage,completed_at").eq("status","completed").order("completed_at",{ascending:false}).limit(8),
    supabase.from("revision_plan_items").select("id",{count:"exact",head:true}).eq("completion_status","completed")
  ]);
  const scores=attempts.data||[]; const avg=scores.length?Math.round(scores.reduce((s,a)=>s+Number(a.percentage),0)/scores.length):0;
  const cards=[["Materials uploaded",materials.count??0],["Topics mapped",topics.count??0],["Average quiz score",`${avg}%`],["Revisions completed",completed.count??0]];
  return <><PageTitle title={`Welcome back${user.user_metadata?.full_name?`, ${user.user_metadata.full_name}`:""}`} subtitle="Your learning progress at a glance."/><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label,value])=><div className="panel" key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="text-3xl font-bold mt-2">{value}</p></div>)}</div><section className="panel mt-6"><h2 className="font-semibold mb-3">Recent quiz attempts</h2>{scores.length?<div className="space-y-3">{scores.map(a=><div className="flex justify-between border-b pb-2 text-sm" key={a.id}><span className="text-slate-600">{new Date(a.completed_at).toLocaleString()}</span><b>{a.percentage}%</b></div>)}</div>:<p className="text-sm text-slate-500">No quiz attempts yet. Upload a syllabus or notes and take a diagnostic quiz to begin.</p>}</section></>;
}
