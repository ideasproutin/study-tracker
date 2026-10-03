import { Data, uid, validateData } from "../model";
// IDs live in shared tables. Re-key imported histories so a backup can be safely
// restored to a different account without colliding with another owner's rows.
export function prepareImport(raw: unknown): Data {
  const data = validateData(raw);
  const skillIds = new Map(data.skills.map((s) => [s.id, uid()]));
  const topicIds = new Map(data.topics.map((t) => [t.id, uid()]));
  const sessionIds = new Map(data.sessions.map((s) => [s.id, uid()]));
  const planIds = new Map(data.plans.map((p) => [p.id, uid()]));
  return {
    ...data,
    skills: data.skills.map((s) => ({ ...s, id: skillIds.get(s.id)! })),
    topics: data.topics.map((t) => ({
      ...t,
      id: topicIds.get(t.id)!,
      skillId: skillIds.get(t.skillId)!,
    })),
    sessions: data.sessions.map((s) => ({
      ...s,
      id: sessionIds.get(s.id)!,
      skillId: skillIds.get(s.skillId)!,
      topicId: s.topicId ? topicIds.get(s.topicId)! : null,
    })),
    plans: data.plans.map((p) => ({
      ...p,
      id: planIds.get(p.id)!,
      topicId: topicIds.get(p.topicId)!,
      sessionId: p.sessionId ? sessionIds.get(p.sessionId)! : null,
    })),
    timer: data.timer
      ? {
          ...data.timer,
          skillId: skillIds.get(data.timer.skillId)!,
          topicId: data.timer.topicId
            ? topicIds.get(data.timer.topicId)!
            : null,
          planId: data.timer.planId ? planIds.get(data.timer.planId)! : null,
        }
      : null,
  };
}
