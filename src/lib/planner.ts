export type PlannerTopic = { id: string; topic_name: string; level: string; accuracy: number };
export function buildPlan(topics: PlannerTopic[], dailyMinutes: number, startDate = new Date(), maxDays = 7) {
  const rank = (level: string) => level === "Weak" ? 1 : level === "Medium" ? 2 : level === "Not Assessed" ? 3 : 4;
  const queue = [...topics].sort((a, b) => rank(a.level) - rank(b.level) || a.accuracy - b.accuracy);
  const items: { topic_id: string; topic_name: string; planned_minutes: number; priority: number; activity: string; scheduled_date: string }[] = [];
  const perDay = Math.max(1, Math.floor(dailyMinutes / 2));
  for (let i = 0; i < queue.length; i++) {
    const topic = queue[i];
    const day = Math.floor(i / 2) % maxDays;
    const date = new Date(startDate); date.setDate(date.getDate() + day);
    items.push({ topic_id: topic.id, topic_name: topic.topic_name, planned_minutes: Math.min(perDay, dailyMinutes), priority: rank(topic.level), activity: topic.level === "Weak" ? "Review source material, practise examples and retry missed concepts." : topic.level === "Medium" ? "Revise key concepts and complete a short practice quiz." : topic.level === "Not Assessed" ? "Study the topic and complete a baseline assessment." : "Complete a brief spaced-revision activity.", scheduled_date: date.toISOString().slice(0, 10) });
  }
  return items;
}
