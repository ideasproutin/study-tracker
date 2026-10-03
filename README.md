# Cadence

A personal study tracker based on the provided Cadence screens. React 19, TypeScript, Tailwind CSS 4, Vite, Phosphor icons, and Recharts. No backend, account, sample sessions, seeded topics, or fabricated progress.

## Running

```sh
npm ci
npm run dev
```

Production: `npm run build`. Static client output: `dist/client`. Serve it with `npm run preview` or a static host. Hash navigation works on static hosts without route rewriting.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:sites
```

## Data and calculations

- All application data is persisted under `cadence:data:v1` in localStorage. A failed save reports an error without accepting the change. Unreadable saved data is preserved and can be exported from Settings.
- Setup offers optional skill suggestions. None exist in the application until the user chooses them. Each selected skill starts with zero study time and zero completed topics.
- Skill/overall progress is completed topics divided by total topics. A topic is complete when manually checked or linked to at least one session with its completion switch enabled. Removing the last completing session makes it pending unless it is also manually checked.
- A logged session counts toward study time and streaks even if its topic is pending. Session duration is stored as minutes; timers preserve fractional minutes and do not round elapsed time up.
- A study day is a unique local calendar date with a saved session. The current streak ends today or yesterday; longer gaps reset it. Longest streak and milestones are derived from the existing session history and recalculate after deletion. Consistency uses fixed rolling 7/30/90-day windows.
- The timer persists its start timestamp and accumulated paused duration, so navigating or refreshing does not lose it. Background time is counted while running. Midnight-spanning sessions are assigned to their starting date, displayed in the finish dialog. Sessions longer than 24 hours must be cancelled and logged manually.
- Unknown topic names entered in Log become actual user-created topics. Existing names within the skill are linked automatically.
- Deleting a skill deletes associated topics, sessions, and plans. Deleting a topic preserves its sessions as unlinked history. Destructive changes require confirmation; a full reset requires typing DELETE.
- JSON backups include skills, topics, sessions, plans, preferences, and the timer. Imports validate types, dates, durations, IDs, and references before asking to replace current data. Import is replacement, not merge.
- Learning history reconstructs the progress of currently existing topics from their creation dates, manual completion timestamps, and dated sessions. It is not an immutable historical snapshot. Edits and deletions therefore recalculate historical values.

Use the same origin and browser to access local data. Different devices, browsers, profiles, and origins have separate storage. Settings provides JSON export/import for moving and backing up data.

Reference orb: cropped from the supplied Cadence image. Fonts and icon assets are bundled locally. No third-party font or image requests are made at runtime.
