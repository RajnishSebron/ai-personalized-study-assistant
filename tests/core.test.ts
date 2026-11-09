import {describe,it,expect} from "vitest";
import {chunkText} from "../src/lib/document/chunk";
import {classifyTopic,scoreAnswers} from "../src/lib/assessment";
import {buildPlan} from "../src/lib/planner";
describe("document chunking",()=>{it("keeps page provenance and splits long text",()=>{const chunks=chunkText([{page:2,text:"Unit 1\n\n"+"A useful concept. ".repeat(400)}],1000,100);expect(chunks.length).toBeGreaterThan(1);expect(chunks.every(c=>c.page_number===2)).toBe(true);});});
describe("assessment logic",()=>{it("classifies topics",()=>{expect(classifyTopic(2,10)).toBe("Weak");expect(classifyTopic(6,10)).toBe("Medium");expect(classifyTopic(9,10)).toBe("Strong");expect(classifyTopic(0,0)).toBe("Not Assessed");});it("scores answers",()=>{expect(scoreAnswers(["A","B"],["A","C"]).percentage).toBe(50);});});
describe("revision planner",()=>{it("puts weak topics first",()=>{const plan=buildPlan([{id:"1",topic_name:"Strong",level:"Strong",accuracy:95},{id:"2",topic_name:"Weak",level:"Weak",accuracy:20}],60,new Date("2026-11-09"));expect(plan[0].topic_name).toBe("Weak");});});
