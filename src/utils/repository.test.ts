import { describe, expect, it } from "vitest";
import { diffData, parseSnapshot } from "./repository";
import { emptyData, Data, dayKey } from "../model";
import { prepareImport } from "./import-data";
import { changesConfirmed } from "./confirmed-changes";
describe("cloud serialization and safe migration", () => {
  it("recognizes a committed change after a lost save response without duplicating it", () => {
    const before = emptyData(),
      next = structuredClone(before);
    next.preferences.dailyTarget = 90;
    expect(changesConfirmed(before, next, next)).toBe(true);
    expect(changesConfirmed(before, next, before)).toBe(false);
  });
  it("sends only changed rows, not all existing history", () => {
    const before = emptyData();
    before.skills = [
      {
        id: "s",
        name: "Skill",
        color: "#49cee3",
        targetHours: 10,
        createdAt: new Date().toISOString(),
      },
    ];
    const after = structuredClone(before);
    after.skills[0].targetHours = 20;
    const diff = diffData(before, after);
    expect(diff.skills.upsert).toHaveLength(1);
    expect(diff.sessions.upsert).toEqual([]);
    expect(diff.preferences).toBeUndefined();
    expect(diff.timer).toBeUndefined();
  });
  it("serializes deletion and explicit timer clearing", () => {
    const before = emptyData();
    before.skills = [
      {
        id: "s",
        name: "Skill",
        color: "#49cee3",
        targetHours: 10,
        createdAt: new Date().toISOString(),
      },
    ];
    before.timer = {
      skillId: "s",
      topicId: null,
      topic: "Study",
      planId: null,
      date: dayKey(),
      time: "12:00",
      elapsed: 30,
      startedAt: null,
    };
    const diff = diffData(before, emptyData());
    expect(diff.skills.delete).toEqual(["s"]);
    expect(diff.timer).toBe(null);
  });
  it("rejects snapshots belonging to a different authenticated account", () => {
    expect(() =>
      parseSnapshot(
        {
          revision: 0,
          profile: { id: "b", displayName: "B" },
          data: emptyData(),
        },
        "a",
      ),
    ).toThrow("invalid account");
  });
  it("rejects a missing schema/profile instead of presenting fabricated empty data", () => {
    expect(() => parseSnapshot(null, "a")).toThrow("profile is missing");
  });
  it("remaps imported IDs and references without changing real history or the source backup", () => {
    const data: Data = {
      ...emptyData(),
      skills: [
        {
          id: "s",
          name: "Skill",
          color: "#49cee3",
          targetHours: 10,
          createdAt: new Date().toISOString(),
        },
      ],
      topics: [
        {
          id: "t",
          skillId: "s",
          name: "Topic",
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ],
      sessions: [
        {
          id: "x",
          skillId: "s",
          topicId: "t",
          topic: "Topic",
          minutes: 45,
          date: dayKey(),
          time: "12:00",
          notes: "Actual notes",
          completed: true,
          createdAt: new Date().toISOString(),
        },
      ],
      plans: [
        { id: "p", topicId: "t", date: dayKey(), minutes: 45, sessionId: "x" },
      ],
      timer: {
        skillId: "s",
        topicId: "t",
        topic: "Topic",
        planId: "p",
        date: dayKey(),
        time: "12:00",
        elapsed: 90,
        startedAt: null,
      },
    };
    const migrated = prepareImport(data);
    expect(migrated.skills[0].id).not.toBe("s");
    expect(migrated.topics[0].skillId).toBe(migrated.skills[0].id);
    expect(migrated.sessions[0].topicId).toBe(migrated.topics[0].id);
    expect(migrated.plans[0].sessionId).toBe(migrated.sessions[0].id);
    expect(migrated.timer?.planId).toBe(migrated.plans[0].id);
    expect(migrated.sessions[0].minutes).toBe(45);
    expect(data.skills[0].id).toBe("s");
  });
});
