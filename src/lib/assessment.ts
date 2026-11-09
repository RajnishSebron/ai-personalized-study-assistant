export type TopicLevel = "Weak" | "Medium" | "Strong" | "Not Assessed";
export function classifyTopic(correct: number, attempted: number): TopicLevel {
  if (attempted <= 0) return "Not Assessed";
  const accuracy = correct / attempted * 100;
  return accuracy < 50 ? "Weak" : accuracy < 80 ? "Medium" : "Strong";
}
export function scoreAnswers(correctAnswers: string[], selectedAnswers: string[]) {
  const results = correctAnswers.map((answer, i) => ({ selected: selectedAnswers[i] ?? "", correct: answer, isCorrect: (selectedAnswers[i] ?? "") === answer }));
  const correct = results.filter(r => r.isCorrect).length;
  return { results, correct, total: results.length, percentage: results.length ? Math.round(correct / results.length * 100) : 0 };
}
