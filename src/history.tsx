import { Check, PencilSimple, Trash } from "@phosphor-icons/react";
import { Data, Session, shiftDay, minutesLabel, sumMinutes } from "./model";
export function SessionRow({
  session: s,
  data,
  onEdit,
  onDelete,
}: {
  session: Session;
  data: Data;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const skill = data.skills.find((x) => x.id === s.skillId);
  return (
    <div className="session-row inset">
      <span
        className={`session-check ${s.completed ? "complete" : ""}`}
        aria-label={s.completed ? "Topic complete" : "Topic pending"}
      >
        {s.completed && <Check size={16} />}
      </span>
      <div className="row-copy">
        <strong>{s.topic}</strong>
        <p>
          <span className="dot" style={{ background: skill?.color }} />
          {skill?.name} · {s.time}
        </p>
        {s.notes && <em>{s.notes}</em>}
      </div>
      <strong
        className="session-duration"
        title={`${Number(s.minutes.toFixed(2))} minutes`}
      >
        {s.minutes < 1
          ? `${Math.round(s.minutes * 60)}s`
          : minutesLabel(s.minutes)}
      </strong>
      <button
        className="icon-button subtle"
        aria-label={`Edit session ${s.topic}`}
        onClick={onEdit}
      >
        <PencilSimple size={16} />
      </button>
      <button
        className="icon-button subtle"
        aria-label={`Delete session ${s.topic}`}
        onClick={onDelete}
      >
        <Trash size={16} />
      </button>
    </div>
  );
}
export function History({
  data,
  today,
  mode,
  onEdit,
  onDelete,
}: {
  data: Data;
  today: string;
  mode: "Daily" | "Weekly";
  onEdit: (s: Session) => void;
  onDelete: (s: Session) => void;
}) {
  const groups = new Map<string, Session[]>();
  [...data.sessions]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .forEach((s) => {
      const key =
        mode === "Daily"
          ? s.date
          : shiftDay(
              s.date,
              -((new Date(`${s.date}T12:00:00`).getDay() + 6) % 7),
            );
      groups.set(key, [...(groups.get(key) || []), s]);
    });
  return (
    <div className="history-list">
      {[...groups].map(([date, sessions]) => (
        <div key={date}>
          <div className="history-heading">
            <strong>
              {mode === "Weekly" ? "Week of " : ""}
              {date === today && mode === "Daily"
                ? "Today"
                : date === shiftDay(today, -1) && mode === "Daily"
                  ? "Yesterday"
                  : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: mode === "Daily" ? "long" : undefined,
                      month: "short",
                      day: "numeric",
                      year:
                        new Date(`${date}T12:00:00`).getFullYear() !==
                        new Date().getFullYear()
                          ? "numeric"
                          : undefined,
                    })}
            </strong>
            <span>
              {minutesLabel(sumMinutes(sessions))} ·{" "}
              {sessions.filter((s) => s.completed).length}/{sessions.length}{" "}
              done
            </span>
          </div>
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              data={data}
              onEdit={() => onEdit(s)}
              onDelete={() => onDelete(s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
export function Heatmap({
  totals,
  today,
}: {
  totals: Map<string, number>;
  today: string;
}) {
  const end = shiftDay(today, 6 - new Date(`${today}T12:00:00`).getDay()),
    start = shiftDay(end, -181),
    max = Math.max(...totals.values(), 1);
  return (
    <div className="heatmap-scroll">
      <div className="heatmap">
        <div className="month-labels">
          {Array.from({ length: 26 }, (_, i) => {
            const d = shiftDay(start, i * 7),
              prev = shiftDay(d, -7);
            return (
              <span key={d}>
                {i === 0 || d.slice(0, 7) !== prev.slice(0, 7)
                  ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                      month: "short",
                    })
                  : ""}
              </span>
            );
          })}
        </div>
        <div className="heatmap-body">
          <div className="day-labels">
            <span />
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
          </div>
          <div className="heatmap-cells">
            {Array.from({ length: 182 }, (_, i) => {
              const day = shiftDay(start, i),
                minutes = totals.get(day) || 0;
              const level = minutes
                ? Math.min(4, Math.max(1, Math.ceil((minutes / max) * 4)))
                : 0;
              return (
                <button
                  key={day}
                  type="button"
                  className={`heat-cell level-${level} ${day === today ? "today-cell" : ""} ${day > today ? "future" : ""}`}
                  title={`${day}: ${minutesLabel(minutes)}`}
                  aria-label={`${day}: ${minutesLabel(minutes)}`}
                  onClick={(e) => {
                    const label = e.currentTarget
                      .closest(".heatmap")
                      ?.querySelector("[data-heat-detail]");
                    if (label)
                      label.textContent = `${day}: ${minutesLabel(minutes)} studied`;
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="heatmap-legend">
          <span data-heat-detail>Click a day to see study time</span>
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <i key={n} className={`heat-cell level-${n}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
