# Basic challenge — what I did

Short version: I fixed the ordering bug in lap analysis, extended the same pipeline to a two-lap stint with a short text summary, and wrote up how I’d scale this to real sessions. `coachVoice` is set to `pitgpt` as requested.

---

## Level 1 — Fix it

**What was going wrong**

`generateCoaching` always takes the **first** item in `analysis.findings` and treats that as the worst sector. So whatever order `analyzeLap` uses for that array directly decides which sector the coach talks about.

The sectors were sorted with **smallest** delta first (`a.delta - b.delta`). That put the least-lost sector at index 0, but the coaching layer assumed index 0 was the **most** lost. So the message could focus on something like sector 3 (+0.07 s) instead of sector 2 (+1.198 s).

**What I changed**

One line: sort by **largest** delta first, `b.delta - a.delta`, so the first finding really is the worst sector. That’s the minimal fix I’d put in a PR: “Sort sector findings by descending time loss so coaching targets the correct sector.”

---

## Level 2 — Extend it

**Goal**

`driverLap2` was already in the data but never wired up. I needed the same style of output for **both** laps, plus a **stint summary** that compares how the driver’s problems evolve (traction, early lift, overall pace vs reference).

**What I added (staying close to existing patterns)**

- Types: `PerLapCoaching` and `StintReport` so a stint is “a list of lap results + one summary string”.
- `analyzeStint(reference, [{ label, lap }, ...], config)` — maps each lap through the existing `analyzeLap` + `generateCoaching` so I didn’t fork the coaching logic.
- `generateStintSummary(first, last, config)` — compares only the **first** and **last** lap in the stint (here: “Stint lap 1” vs “Stint lap 14”):
  - total delta vs reference (sum of sector deltas) — are we bleeding more time by the end?
  - per sector: traction loss getting worse (same issue with bigger delta, or newly traction_loss).
  - early lift **appearing** on the later lap where it wasn’t on the earlier one — reads like tyre management / protecting the car.

The runner builds the stint with both `driverLap` and `driverLap2`, prints each lap’s JSON coaching block, then prints the summary. The original validation on lap 1 still runs so I didn’t break the checker.

---

## Level 3 — Think about it (production)

Right now this is one car, a handful of laps, and everything in memory. That’s fine for a demo; it doesn’t survive 20 cars, long stints, and 120 Hz streams.

**What I’d change architecturally**

I’d get **ingest and storage** off the “I need an answer in 50 ms” path. Write high-rate telemetry into something meant for time series, then **downsample or window** into sector-level aggregates (or whatever grain coaching actually needs). Lap analysis and coaching generation should run **asynchronously** — queue or worker per session or per car — so radio-style feedback isn’t blocked on replaying a full stint in one thread.

**What breaks first (in practice)**

Usually **CPU and latency** first if one thread does ingest + analysis + everything else. Then **memory** if there’s no backpressure and data piles up faster than you can process. Then **coupling**: one pipeline for the whole session means one slow path can stall everyone. I’d want **per-car or bounded pipelines**, **bounded buffers**, and **precomputed reference baselines** so coaching reads small snapshots instead of recomputing from raw high-rate data every time.

That’s the direction I’d pitch before optimizing the TypeScript loops — fix the shape of the system, then tighten hot paths.

---

If anything in the code is unclear, the interesting bits are `analyzeLap` (sort), `analyzeStint` / `generateStintSummary`, and the runner at the bottom of `challenge.ts`.
