/**
 * Racemake Hard Challenge — Bun + Hono telemetry API
 * From Task_hard: bun install && bun run challenge-hard.ts
 * Or: npm install && npm run start:node
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { TelemetryFrame } from "./Hard Product Engineer Challenge.ts";

let store: TelemetryFrame[] = [];

const S1_END = 0.333;
const S2_END = 0.667;
const COMPLETE_LAP_MIN_POS = 0.9;
const POS_EPS = 1e-9;

function assignSector(pos: number): 1 | 2 | 3 {
  if (pos < S1_END) return 1;
  if (pos < S2_END) return 2;
  return 3;
}

/** Drop pit / stationary samples: very low speed and position unchanged vs previous frame. */
function filterStationary(frames: TelemetryFrame[]): TelemetryFrame[] {
  const sorted = [...frames].sort((a, b) => a.ts - b.ts);
  const out: TelemetryFrame[] = [];
  let prevKept: TelemetryFrame | undefined;

  for (const f of sorted) {
    if (
      f.spd < 5 &&
      prevKept !== undefined &&
      Math.abs(f.pos - prevKept.pos) < POS_EPS
    ) {
      continue;
    }
    out.push(f);
    prevKept = f;
  }
  return out;
}

function groupByLap(frames: TelemetryFrame[]): Map<number, TelemetryFrame[]> {
  const m = new Map<number, TelemetryFrame[]>();
  for (const f of frames) {
    const list = m.get(f.lap) ?? [];
    list.push(f);
    m.set(f.lap, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.ts - b.ts);
  }
  return m;
}

function isCompleteLap(lapFrames: TelemetryFrame[]): boolean {
  if (lapFrames.length === 0) return false;
  const maxPos = Math.max(...lapFrames.map((f) => f.pos));
  return maxPos >= COMPLETE_LAP_MIN_POS;
}

interface LapSummary {
  lapNumber: number;
  lapTime: number;
  sectors: { sector: number; time: number }[];
  avgSpeed: number;
  maxSpeed: number;
}

function buildLapSummary(lapNumber: number, lapFrames: TelemetryFrame[]): LapSummary {
  const t0 = lapFrames[0]!.ts;
  const t1 = lapFrames[lapFrames.length - 1]!.ts;
  const lapTime = t1 - t0;

  const sectorTime: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  for (let i = 0; i < lapFrames.length - 1; i++) {
    const a = lapFrames[i]!;
    const b = lapFrames[i + 1]!;
    const dt = b.ts - a.ts;
    if (dt <= 0) continue;
    const sec = assignSector(a.pos);
    sectorTime[sec] += dt;
  }

  const speeds = lapFrames.map((f) => f.spd);
  const avgSpeed = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  const maxSpeed = Math.max(...speeds);

  return {
    lapNumber,
    lapTime,
    sectors: [
      { sector: 1, time: sectorTime[1] },
      { sector: 2, time: sectorTime[2] },
      { sector: 3, time: sectorTime[3] },
    ],
    avgSpeed,
    maxSpeed,
  };
}

function completedLapSummaries(frames: TelemetryFrame[]): LapSummary[] {
  const cleaned = filterStationary(frames);
  const byLap = groupByLap(cleaned);
  const summaries: LapSummary[] = [];

  for (const [lapNum, lapFrames] of byLap) {
    if (lapNum === 0) continue;
    if (!isCompleteLap(lapFrames)) continue;
    summaries.push(buildLapSummary(lapNum, lapFrames));
  }

  summaries.sort((a, b) => a.lapNumber - b.lapNumber);
  return summaries;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function framesInSector(
  lapFrames: TelemetryFrame[],
  sector: 1 | 2 | 3
): TelemetryFrame[] {
  return lapFrames.filter((f) => assignSector(f.pos) === sector);
}

type IssueKind =
  | "heavy_braking"
  | "low_throttle"
  | "tyre_overheat"
  | "inconsistency";

function detectSectorIssue(frames: TelemetryFrame[]): IssueKind {
  if (frames.length === 0) return "low_throttle";

  const maxTyre = Math.max(
    ...frames.flatMap((f) => [f.tyres.fl, f.tyres.fr, f.tyres.rl, f.tyres.rr])
  );
  const heavyBrake = frames.some((f) => f.brk > 0.8 && f.spd > 200);
  const avgThr =
    frames.reduce((s, f) => s + f.thr, 0) / frames.length;
  const spdStd = stddev(frames.map((f) => f.spd));

  if (maxTyre > 110) return "tyre_overheat";
  if (heavyBrake) return "heavy_braking";
  if (spdStd > 40) return "inconsistency";
  if (avgThr < 0.6) return "low_throttle";

  // No single telemetry flag; still need one of the four issue labels for the API contract.
  return "inconsistency";
}

function pitgptMessage(issue: IssueKind, sector: number): string {
  switch (issue) {
    case "tyre_overheat":
      return `Sector ${sector} is killing your lap — tyre temps are through the roof. You're asking for grip that isn't there. Ease the inputs, short-shift if you have to, and let the rubber recover.`;
    case "heavy_braking":
      return `Sector ${sector} — you're hitting the brakes too hard while still carrying big speed. That's scrub and time. Bleed pressure earlier, trail it in, and roll more entry speed.`;
    case "inconsistency":
      return `Sector ${sector} looks messy — your speed trace is all over the place. Pick your marks, repeat the same inputs every lap, and the time will come.`;
    case "low_throttle":
      return `Sector ${sector}, you're shy on throttle on average. Trust the rear, commit on exit — the stopwatch rewards the brave pedal here.`;
  }
}

function buildAnalysis(frames: TelemetryFrame[]) {
  const summaries = completedLapSummaries(frames);

  if (summaries.length === 0) {
    return {
      bestLap: null,
      worstLap: null,
      problemSector: 0,
      issue: "low_throttle",
      coachingMessage:
        "No complete laps in the data yet. Finish a clean lap from the line and we'll talk.",
    };
  }

  const best = summaries.reduce((a, b) => (a.lapTime <= b.lapTime ? a : b));
  const worst = summaries.reduce((a, b) => (a.lapTime >= b.lapTime ? a : b));
  const delta = worst.lapTime - best.lapTime;

  let problemSector: 1 | 2 | 3 = 1;
  let maxSectorLoss = -Infinity;

  for (const s of worst.sectors) {
    const bestSec = best.sectors.find((x) => x.sector === s.sector)!;
    const loss = s.time - bestSec.time;
    if (loss > maxSectorLoss) {
      maxSectorLoss = loss;
      problemSector = s.sector as 1 | 2 | 3;
    }
  }

  const cleaned = filterStationary(frames);
  const byLap = groupByLap(cleaned);
  const worstFrames = byLap.get(worst.lapNumber) ?? [];
  const sectorFrames = framesInSector(worstFrames, problemSector);
  const issue = detectSectorIssue(sectorFrames);
  const coachingMessage = pitgptMessage(issue, problemSector);

  return {
    bestLap: { lapNumber: best.lapNumber, lapTime: best.lapTime },
    worstLap: {
      lapNumber: worst.lapNumber,
      lapTime: worst.lapTime,
      delta,
    },
    problemSector,
    issue,
    coachingMessage,
  };
}

const app = new Hono();

app.post("/ingest", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  if (!Array.isArray(body)) {
    return c.json({ error: "expected a JSON array of telemetry frames" }, 400);
  }

  store = body as TelemetryFrame[];
  const lapIds = new Set(store.map((f) => f.lap));
  return c.json({ laps: lapIds.size, frames: store.length });
});

app.get("/laps", (c) => {
  const summaries = completedLapSummaries(store);
  return c.json(summaries);
});

app.get("/analysis", (c) => {
  return c.json(buildAnalysis(store));
});

const port = Number(process.env.PORT) || 3000;
console.log(`PitGPT API → http://localhost:${port}`);
console.log(`POST /ingest  GET /laps  GET /analysis`);

if (typeof Bun !== "undefined") {
  Bun.serve({ port, fetch: app.fetch });
} else {
  serve({ fetch: app.fetch, port });
}
