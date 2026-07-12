# BrickCode — Slides ready to paste (Canva)

> **How to use this.** For each slide you get exactly three things:
> - **HEADLINE** → the big text box in your template.
> - **ON SCREEN** → the *only* other text/visual that goes on the slide (keep it this short).
> - **YOU SAY** → a cue for what you speak — this is NOT on the slide, it's how the sparse
>   slide still lands.
>
> Rule of thumb while pasting: if a line feels long for a slide, it belongs in **YOU SAY**,
> not on screen. Fifteen slides, ~12–15 min.

---

## Slide 1 — Title

**HEADLINE:** BrickCode
**ON SCREEN:**
- *Code a robot. No robot required.*
- [Your name] · M.Sc. Computer Science & Data Science · Capstone Defense · [date]
- Visual: your 3D robot render / logo, big.

**YOU SAY:** Brief welcome + "In the next 15 minutes I'll show you a system that teaches kids
to program robots without hardware — and quietly measures how they learn to think."

---

## Slide 2 — The hook

**HEADLINE:** The lesson stops before it starts.
**ON SCREEN:**
- To program a LEGO robot in Scratch, a child first needs:
- **a kit · a cable · Wi-Fi · drivers**
- Visual: photo of a tangled cable or a LEGO kit box.

**YOU SAY:** Paint the scene — a kid excited to code, blocked by 20 minutes of setup before
anything moves. The idea dies in the setup.

---

## Slide 3 — The problem

**HEADLINE:** Robotics education is gated by hardware.
**ON SCREEN (3 short bullets):**
- Cost, maintenance, space
- Every LEGO Scratch plugin needs the physical kit + Wi-Fi
- No accessible, pedagogical **3D simulator** to replace it

**YOU SAY:** Name the competitors (Mindstorms, Boost, WeDo) so they know you did your homework,
then land the equity point: access shouldn't depend on a purchase order.

---

## Slide 4 — The reframe  ★ (your key slide)

**HEADLINE:** An instrument, not a toy.
**ON SCREEN:**
- **Student** → programs the robot → *generates data*
- **Teacher** → *sees how computational thinking develops*
- Visual: your two-user diagram (student ▸ pipeline ▸ teacher).

**YOU SAY:** This is the pivot — slow down. Removing hardware is table stakes; the real question
is what we can learn about *how a child thinks* while they play. That's what makes this CS **&
Data Science**.

---

## Slide 5 — What the student sees

**HEADLINE:** Drag blocks. Watch a 3D robot obey.
**ON SCREEN:**
- Real physics · real sensors · **just a browser**
- Visual: big screenshot — blocks on the left, 3D robot on the right.

**YOU SAY:** No hardware, no install, no internet. Real gravity, collisions, motor torque,
distance and color sensors — all simulated.

---

## Slide 6 — DEMO  ★

**HEADLINE:** *(almost none — let the demo fill the slide)*
**ON SCREEN:**
- A single line: *"Move forward, stop 20 cm from the wall."*
- Visual: **live demo or a 15–20s GIF**, near full-screen.

**YOU SAY:** Narrate the child's logic out loud as it runs. Keep the recorded GIF ready as a
fallback in case live breaks.

---

## Slide 7 — The invisible half

**HEADLINE:** Every run, quietly logged.
**ON SCREEN:**
- full **program snapshot** every run · executed blocks · errors · timings
- *non-intrusive · privacy-respecting*
- Visual: a short event-log using the real event types (see the mockup).

**YOU SAY:** The child never notices. Their play becomes a clean dataset — this is the bridge
from the tool to the research.

---

## Slide 8 — The Data Science contribution

**HEADLINE:** From play to insight.
**ON SCREEN:**
- **Trajectory** · error patterns · time & attempts
- ⟶ **computational-thinking indicators**
- Visual: a real trajectory graph if you have one; else the pipeline diagram.

**YOU SAY:** Name the technique — tree edit distance between successive versions of the program
— and the indicators it reveals: abstraction, decomposition, loops, conditionals, debugging.

---

## Slide 9 — The teacher's payoff

**HEADLINE:** One glance replaces 30 programs.
**ON SCREEN:**
- Who's **stuck** · who's **guessing** · who's **decomposing**
- Visual: dashboard mockup (per-student / per-group).

**YOU SAY:** The dashboard doesn't dump logs — it *mirrors* what happened and *orients* the
teacher toward what to do next.

---

## Slide 10 — How it's built

**HEADLINE:** Four subsystems, cleanly separated.
**ON SCREEN:**
- React + TypeScript · Three.js · Rapier (WASM) · Blockly
- Visual (the star of this slide): **diagram** — Student sim → events → pipeline → Teacher
  dashboard.

**YOU SAY:** Fully client-side, runs in any browser. Walk the diagram left to right; let it do
the talking, not the bullet list.

---

## Slide 11 — Engineering decisions

**HEADLINE:** Deliberate trade-offs.
**ON SCREEN (3 bullets):**
- Interpreter, **not** `eval`/codegen — safe for kids, real-time feedback
- Async — loops & sensors never block the physics loop
- Clean data by design

**YOU SAY:** Each of these is a question you *want* to be asked — invite them. Tie "clean data"
back to the analytics half.

---

## Slide 12 — Grounded in research

**HEADLINE:** Standing on solid ground.
**ON SCREEN (3 bullets):**
- Simulators & equity (e.g. RoboScape Online)
- Learning analytics on block programming (Grover et al.)
- Teacher dashboards: mirror vs. guide (Holstein, Amarasinghe et al.)

**YOU SAY:** One sentence: BrickCode sits at the intersection of these three lines. Don't read
the citations — they're there to show grounding.

---

## Slide 13 — What's real today

**HEADLINE:** What's real today.
**ON SCREEN (two columns):**
- ✅ **Built:** 3D sim + physics · sensors · Blockly interpreter · levels · program-snapshot
  telemetry · backend + sync · **analytics pipeline (tree edit distance → CT indicators)** ·
  **teacher dashboard: CT indicators + trajectory**
- 🚧 **In progress:** hosted deployment · more levels · classroom validation at scale

**YOU SAY:** State the boundary before they ask. Being precise here reads as being in control of
your own project.

---

## Slide 14 — Honest scope

**HEADLINE:** Honest scope.
**ON SCREEN (3 bullets):**
- ≈2 students → **proof-of-concept pipeline**, not a trained ML model
- No control-group study / inferential stats
- Preset robots, not a free-form build editor *(future work)*

**YOU SAY:** Own the "≈2 students" with confidence, then reframe: that's *why* the contribution
is the instrument + pipeline, designed to scale. The capstone is assessed on the artifact.

---

## Slide 15 — Close

**HEADLINE:** Play becomes a window into how kids learn to think.
**ON SCREEN:**
- **Next:** finish the pipeline · complete the dashboard · host it
- *Thank you.* · Questions
- Visual: your robot, one last time.

**YOU SAY:** Callback to Slide 4 — remove the hardware barrier, and turn every child's play into
insight for the teacher. End on the vision line, then stop.

---

## Backup slides (hidden, for Q&A)

- **Event schema** — the exact shape you log ("what exactly do you capture?")
- **Tree edit distance** — two programs, one worked example ("how do you measure a trajectory?")
- **Privacy & ethics** — what's stored, anonymization, non-intrusive logging
- **Sim vs. hardware** — one comparison table for the physical-robotics skeptic

---

### Pasting checklist
- [ ] Max ~3–4 bullets per slide; 3–6 words each.
- [ ] One image/diagram per content slide — let it breathe.
- [ ] Two colors + one font family across all slides.
- [ ] Slides 4, 6, 8, 9 get the most visual weight (reframe, demo, DS, dashboard).
- [ ] Demo GIF embedded as fallback even if going live.
