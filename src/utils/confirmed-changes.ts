import type { Data } from "../model";
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [
          key,
          (key === "createdAt" || key === "completedAt") &&
          typeof v === "string"
            ? Date.parse(v)
            : normalized(v),
        ]),
    );
  return value;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
// If a response is lost after commit, a reload can confirm the intended diff.
// Compare just our changed rows so unrelated concurrent updates are retained.
export function changesConfirmed(
  before: Data,
  next: Data,
  actual: Data,
): boolean {
  for (const key of ["skills", "topics", "sessions", "plans"] as const) {
    const oldRows = new Map(before[key].map((row) => [row.id, row]));
    const newRows = new Map(next[key].map((row) => [row.id, row]));
    const serverRows = new Map(actual[key].map((row) => [row.id, row]));
    for (const [id, row] of newRows)
      if (!equal(row, oldRows.get(id)) && !equal(row, serverRows.get(id)))
        return false;
    for (const id of oldRows.keys())
      if (!newRows.has(id) && serverRows.has(id)) return false;
  }
  if (
    !equal(before.preferences, next.preferences) &&
    !equal(next.preferences, actual.preferences)
  )
    return false;
  if (!equal(before.timer, next.timer) && !equal(next.timer, actual.timer))
    return false;
  return true;
}
