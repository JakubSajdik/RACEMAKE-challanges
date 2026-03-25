# Task — Hard Product Engineer Challenge

## What’s in here

| File | Role |
|------|------|
| `challenge-hard.ts` | Hono API: ingest, lap summaries, worst-lap analysis + PitGPT-style message. |
| `Hard Product Engineer Challenge.ts` | Original brief at the top, `TelemetryFrame` type, and the embedded `telemetry` array (same idea as `telemetry.json`). |
| `telemetry.json` | Sample payload for `curl` (same stint as the TS data). |
| `package.json` | `hono` + `@hono/node-server`. |
| `WRITEUP.md` | How I interpreted the spec and edge cases. |

## Run

```bash
cd Task_hard
bun install && bun run challenge-hard.ts
```

Without Bun:

```bash
npm install && npm run start:node
```

Default port is **3000** unless you set `PORT`.

## Try it

From `Task_hard` (so `@telemetry.json` resolves):

```bash
curl -X POST http://localhost:3000/ingest -H "Content-Type: application/json" -d @telemetry.json
curl http://localhost:3000/laps
curl http://localhost:3000/analysis
```

You should see three **completed** laps in `/laps` (out-lap and the truncated last lap dropped), and `/analysis` picking the slowest of those vs the best lap in the set, then classifying the worst sector on the worst lap.
