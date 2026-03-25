# Hard challenge — what I built

I implemented a small **Hono** API on **Bun** (with a **Node** fallback via `@hono/node-server`) that matches the brief: accept the raw frame array, keep it in memory, expose lap summaries and a coaching-style analysis for the **worst lap vs the best lap** in the stint.

---

## The three endpoints (tasks 1–3)

**POST /ingest**  
Body: JSON array of frames. I replace the in-memory store with that array and return `{ laps, frames }` where `laps` is the count of **distinct lap numbers** in the payload and `frames` is the array length. Simple and matches “what did we just load.”

**GET /laps**  
I only include laps I consider **complete** (see below). For each one I return `lapNumber`, `lapTime` (wall time from first to last sample in that lap), sector times using the Spa-ish split at **0.333** and **0.667** on track position, plus `avgSpeed` and `maxSpeed` over the samples that survived filtering.

**GET /analysis**  
Among completed laps I find the **fastest** and **slowest** by `lapTime`. For the slowest lap I compare sector times to the best lap and take the sector with the **largest time loss**. Then I look only at frames in that sector on that lap and assign one of the four issues using the rules from the spec (with a clear priority order in code so behaviour is predictable — see below). The `coachingMessage` is short, direct “radio” copy in the PitGPT spirit.

---

## Edge cases (the messy real-world stuff)

**Out-lap**  
In the sample data the out-lap is **`lap: 0`**. It never starts from ~0 on the timing line the way a “real” timed lap does. I **skip lap 0** entirely when building completed laps. That matches the story in the data comments.

**Incomplete last lap**  
The sample includes a lap that only has sector 1 samples (never gets near the end of the lap). I treat a lap as complete only if, after filtering, the **maximum track position** in that lap is at least about **0.9**. That drops the junk tail lap without requiring a perfect 1.0 (sampling might not hit exactly the line).

**Pit / stationary samples**  
If speed is **below 5 km/h** and **track position hasn’t changed** compared to the last **kept** frame, I drop the sample. That removes the “car parked in the box repeating the same `pos`” tail without deleting slow but still-moving laps.

I apply the stationary filter **before** grouping by lap and before completeness checks, so lap times aren’t stretched by minutes of standing still.

---

## Issue detection (how I prioritise)

The spec lists four signals. In real telemetry more than one can flash at once, so I had to pick an order. I check roughly in **severity / signal strength** order for this dataset:

1. **Tyre overheat** — any tyre above 110 °C (very clear in the “bad” lap sector 2 story).  
2. **Heavy braking** — brake above 0.8 with speed still above 200 km/h.  
3. **Inconsistency** — speed standard deviation above 40 in that sector’s samples.  
4. **Low throttle** — average throttle below 0.6 in that sector.

If nothing matches (should be rare), I fall back to **inconsistency** so the API still returns one of the four labels.

---

## What you should see on the sample file

After ingesting `telemetry.json`, `/laps` should list **laps 1–3** as complete. Lap **3** is the slowest; sector **2** is where most of the loss vs the best lap shows up, and the dominant story in the data is **tyre overheat** there — which is what the analysis is meant to surface.

If something looks off, the flow to trace is: `filterStationary` → `groupByLap` → `isCompleteLap` → `buildLapSummary` → `buildAnalysis` → `detectSectorIssue` on the worst sector’s frames.

---

That’s the gist. The implementation lives in `challenge-hard.ts`; this file is just the walkthrough so you don’t have to reverse-engineer intent from the code alone.
