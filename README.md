# Racemake — submission package

This folder is everything I’m sending back: **basic** PitGPT pipeline challenge and **hard** telemetry API challenge, kept separate so it’s obvious what belongs to which task.

## Layout

| Folder | What it is |
|--------|------------|
| **Task_basic** | Sector-level lap analysis: bugfix, stint extension, and my written answer for the “think about production” question. |
| **Task_hard** | Raw 10 Hz telemetry → in-memory Hono API (`/ingest`, `/laps`, `/analysis`) plus sample `telemetry.json` and how I handled the messy edge cases. |

## Quick start

**Basic** — from `Task_basic`:

```bash
bun run challenge.ts
# or
npx tsx challenge.ts
```

**Hard** — from `Task_hard`:

```bash
bun install && bun run challenge-hard.ts
# or
npm install && npm run start:node
```

Then in another terminal (still from `Task_hard` if you use `@telemetry.json`):

```bash
curl -X POST http://localhost:3000/ingest -H "Content-Type: application/json" -d @telemetry.json
curl http://localhost:3000/laps
curl http://localhost:3000/analysis
```

## Read me first

In each task folder there is a **`WRITEUP.md`**: that’s where I explain what I changed and why, in normal language. The code is the source of truth; the writeup is the story around it.

— Jakub
