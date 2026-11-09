"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartNoAxesCombined, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut, MessageCircle, Target } from "lucide-react";
const nav = [["/dashboard","Overview",LayoutDashboard],["/materials","My Materials",FileText],["/topics","Topic Map",BookOpen],["/quiz","Diagnostic Quiz",ClipboardList],["/reports","Knowledge Gaps",Target],["/revision-plan","Revision Planner",ChartNoAxesCombined],["/tutor","AI Tutor",MessageCircle]] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div className="min-h-screen md:flex"><aside className="w-full md:w-64 bg-white border-r border-slate-200 p-5 md:min-h-screen"><div className="flex items-center gap-2 text-xl font-bold mb-8 text-indigo-700"><GraduationCap/> StudyPilot</div><nav className="space-y-1">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${path===href?"bg-indigo-50 text-indigo-700 font-semibold":"text-slate-600 hover:bg-slate-50"}`}><Icon size={18}/>{label}</Link>)}</nav><form action="/auth/signout" method="post" className="mt-8"><button className="flex items-center gap-3 px-3 py-3 text-sm text-slate-500"><LogOut size={18}/> Sign out</button></form></aside><main className="flex-1 p-5 md:p-9 max-w-7xl">{children}</main></div>;
}
export function PageTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="mb-7"><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-slate-500 mt-1">{subtitle}</p></div>; }
