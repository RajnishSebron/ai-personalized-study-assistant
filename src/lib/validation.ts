import { z } from "zod";
export const materialSchema = z.object({
  fileName: z.string().min(1).max(255), fileType: z.enum(["pdf", "txt", "md"]),
  category: z.enum(["syllabus", "notes", "past_paper"]), storagePath: z.string().min(3),
  pages: z.array(z.object({ page: z.number().int().positive(), text: z.string().max(100000) })).min(1).max(50)
});
export const quizQuestionSchema = z.object({
  question: z.string().min(8), options: z.array(z.string().min(1)).length(4), correct_answer: z.string(),
  explanation: z.string().min(1), option_explanations: z.record(z.string()), topic: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]), source_chunk_ids: z.array(z.string().uuid()).min(1)
});
export const quizSchema = z.object({ questions: z.array(quizQuestionSchema).min(1) });
