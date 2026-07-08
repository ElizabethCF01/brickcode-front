# BrickCode — Capstone Presentation Content

> **What this file is.** The *content and slide-by-slide organization* for a minimalist
> defense presentation of BrickCode (M.Sc. Computer Science & Data Science).
> You pick the template; this gives you the words and the flow.
>
> **Language:** English. **Tone:** honest about the real state of the work, but engaging.
> **Target length:** ~15 slides, ~12–15 min talk (each slide is extensible with your notes).
>
> For every slide you'll see:
> - **On slide** — the minimal text/visual that actually goes on the slide.
> - **Why** — the job this slide does in the story (not shown to the audience).
>
> Speaker script is intentionally left out for now — ask when you're ready and I'll write it.

---

## Design principles (read once, then delete)

These are the "presenter best-practices" this deck is built on:

1. **One idea per slide.** If a slide needs two ideas, it's two slides.
2. **The slide is not the script.** Few words on screen; the detail comes from your mouth.
   Aim for ≤ 6 lines and ≤ 6 words per line on content slides.
3. **Narrative, not feature list.** Structure = *Hook → Problem → Insight → Solution →
   Proof → Contribution → Honesty → Close*. A committee remembers a story, not a spec.
4. **Lead with the gap, not the tool.** Open on the problem a child (and a teacher) has,
   not on "I built a simulator."
5. **Show, don't tell.** One live demo / GIF beats three bullet points about features.
6. **Earn credibility with honesty.** A committee trusts a candidate who names limits before
   being asked. The "what's real / what's next" slide is a strength, not a confession.
7. **Two disciplines, one thesis.** Every few slides, tie back to *CS = the system,
   DS = turning interaction into insight*. That's what makes this a CS **& DS** capstone.

---

## The one-sentence thesis (say this out loud, more than once)

> **BrickCode is an educational-robotics simulator that not only teaches children to program
> without hardware — it instruments their activity so the teacher can *see* how each child's
> computational thinking develops.**

The simulator is the **instrument**. The analytics + dashboard is the **contribution**.

---

# SLIDES

---

## Slide 1 — Title

**On slide**
- **BrickCode**
- Teaching kids to code robots — with no robot.
- *A 3D robotics simulator that turns play into learning analytics.*
- Your name · M.Sc. Computer Science & Data Science · Capstone Defense · [date]

**Why:** Clean title + a one-line promise that already hints at the twist (analytics), so the
committee knows this is more than a toy.

---

## Slide 2 — The hook (open on the child, not the code)

**On slide**
- A kid opens Scratch to program a LEGO robot.
- First it asks for: **a robot. a cable. a Wi-Fi network. a driver.**
- *The lesson stops before it starts.*

**Why:** Concrete, relatable friction. Everyone has felt "setup killed the idea." No jargon yet.
Best practice: start with a scene, not a definition.

---

## Slide 3 — The problem (make the gap undeniable)

**On slide**
- Physical robotics has real barriers: **cost, hardware, maintenance, space, Wi-Fi.**
- Existing LEGO Scratch plugins (Mindstorms, Boost, WeDo) **all require the physical kit.**
- There is **no accessible, pedagogical 3D simulator** to experiment with motors, sensors
  and LEGO pieces without hardware.
- *Access to robotics education is gated by a purchase order.*

**Why:** Establishes the market/education gap crisply and names the competitors so nobody
thinks you missed them. Equity angle = the emotional core.

---

## Slide 4 — The reframe (this is the pivotal slide)

**On slide**
- Removing the hardware is table stakes.
- The real question: *when a child programs, what can we learn about **how they think**?*
- **BrickCode = an instrument, not just a game.**
- Two users, one system:
  - **Student** → programs the robot → generates data
  - **Teacher** → reads how computational thinking develops

**Why:** This is where a "nice tool" becomes a "master's thesis." It reframes the whole talk
and sets up the DS contribution. Slow down here.

---

## Slide 5 — What the student sees

**On slide**
- Drag blocks (Scratch-like) → a **3D LEGO robot** obeys, in real time.
- Real physics: gravity, collisions, motor torque *(Rapier)*.
- Real sensors: distance, color.
- No hardware. No install. No internet. **Just a browser.**

**Why:** Now — only now — you show the product. The audience already wants it because you
built the need first. Keep it to the experience, not the tech stack.

---

## Slide 6 — DEMO (the moment that sells it)

**On slide**
- 🎬 **Live demo / short GIF**
- "Move forward, stop 20 cm from the wall."
- *(Blocks on the left → robot moving in 3D on the right.)*

**Why:** The single highest-impact slide. If live is risky, embed a 15–20s screen recording.
Rule: rehearse the demo until it's boring to you. Have the GIF as a fallback.

---

## Slide 7 — The invisible half: instrumentation

**On slide**
- Every meaningful action is quietly logged:
  - blocks added / removed / moved
  - each **run**, each **error**, timings, attempts
  - the program's state at every execution
- Non-intrusive (the child never notices) · privacy-respecting.
- *The play becomes a dataset.*

**Why:** Reveals the "secret" of the reframe from Slide 4. Emphasize *non-intrusive* — it's an
ethical and design win. This is the bridge from CS engineering to DS.

---

## Slide 8 — The Data Science contribution: from logs to insight

**On slide**
- Raw events → **interpretable metrics**:
  - programming **trajectory** (tree edit distance between successive program versions)
  - block-usage sequences · error patterns · time-to-solution · attempts
- Derived **computational-thinking indicators**:
  - abstraction · decomposition · loops · conditionals · iterative debugging

**Why:** The heart of the DS half. Name the technique (tree edit distance over the Blockly AST)
— it signals rigor and gives the committee something concrete to ask about (good: you control
the question).

---

## Slide 9 — The payoff: the teacher's dashboard

**On slide**
- Per-student and per-group views.
- Not raw logs — **guidance**: *mirror* what happened, *orient* toward what to do next.
- The teacher sees *who is stuck, who is guessing, who is decomposing the problem.*
- *One glance replaces reading 30 programs.*

**Why:** Closes the loop opened in Slide 4. This is the "so what" for the beneficiary. Ground it
in the mirroring/guiding framework (shows literature awareness without a citation dump).

---

## Slide 10 — How it's built (CS credibility)

**On slide**
- Browser-native, fully client-side: **React + TypeScript + Vite**
- **Three.js** (3D) · **Rapier/WASM** (physics) · **Blockly** (visual programming)
- Four subsystems, cleanly separated:
  1. Simulation engine  2. Block interpreter  3. Blockly workspace  4. Telemetry + analytics
- *(Simple architecture diagram: Student sim → events → pipeline → Teacher dashboard)*

**Why:** Establishes engineering seriousness fast. The diagram is worth more than the bullets —
reuse the instrument→pipeline→dashboard flow. One slide only; don't drown in the stack.

---

## Slide 11 — Engineering decisions that matter

**On slide**
- **Interpreter, not code-gen.** Blocks drive the sim directly — no `eval`, no sandbox,
  real-time sensor feedback.
- **Async interpreter** — loops & sensor polling never block the physics loop.
- **Single coupled physics+render loop** — one source of truth for time.
- *Choices made for safety (kids), correctness, and clean data.*

**Why:** Shows you made deliberate, defensible trade-offs — exactly what a committee probes.
Each bullet is a question you *want* to be asked. Tie "clean data" back to the DS half.

---

## Slide 12 — Grounded in the literature

**On slide**
- **Simulators & equity** — simulation lowers cost/space barriers; precedents (e.g. RoboScape
  Online) show CT gains.
- **Learning analytics on block programming** — inferring strategy from logs (Grover et al.).
- **Teacher-facing dashboards** — mirroring vs. guiding; teacher–AI complementarity
  (Holstein et al., Amarasinghe et al.).
- *BrickCode sits at the intersection of all three.*

**Why:** Positions the work academically. Three anchors, one line each — enough to prove
grounding, not a lit-review slide. This reassures the DS/research side of the committee.

---

## Slide 13 — What's real today (honesty as a strength)

**On slide**
- ✅ **Built & working:** 3D sim with physics · pre-assembled robot · motors + distance/color
  sensors · Blockly + real-time interpreter · multiple levels/challenges · **block-level
  telemetry capture** · backend persistence & sync · teacher-dashboard scaffold.
- 🚧 **In progress:** analytics pipeline (logs → CT indicators) · dashboard wired to indicators
  · hosted deployment.

**Why:** The trust slide. You state the boundary before they find it. Green/amber split reads
as "in control of my own project." Be precise — don't oversell the pipeline as done.

---

## Slide 14 — Honest scope & limitations

**On slide**
- Cohort is small (**≈2 students**) → the DS deliverable is a **proof-of-concept pipeline +
  conceptually validated metrics** (with synthetic data to show it scales) — **not** a trained
  predictive model.
- Not an empirical study with control group / inferential statistics.
- Robots are **presets**, not a free-form LEGO construction editor (future work).
- **The contribution is the artifact:** a functional, well-engineered, well-grounded system.

**Why:** Pre-empts the three hardest questions (sample size, ML claims, construction editor).
Naming them yourself defuses them. Restate what the capstone *is* assessed on — your framing,
not theirs.

---

## Slide 15 — Roadmap & closing

**On slide**
- **Next:** finish the analytics pipeline · complete the CT-indicator dashboard · host it ·
  more levels/challenges.
- **The takeaway:**
  > BrickCode removes the hardware barrier to robotics —
  > and turns every child's play into a window on how they learn to think.
- Thank you. · Questions.

**Why:** Ends on the one-sentence thesis (callback to Slide 4), plus a concrete forward path so
the committee sees momentum. Close on the vision line, not on a bullet list.

---

# Optional / backup slides (keep in your back pocket for Q&A)

- **Appendix A — Event schema.** The exact `LearningEvent` / `LearningSession` shape you capture.
  Pull up if asked "what exactly do you log?"
- **Appendix B — Tree edit distance, worked example.** Two successive programs and the distance
  between them. Pull up if asked "how do you measure a trajectory?"
- **Appendix C — Privacy & ethics.** What's stored, anonymization, that logging is non-intrusive.
  Kids' data always draws a question.
- **Appendix D — Why simulation over hardware, in one table.** Cost, setup time, reset,
  observability. For the skeptic who loves physical robots.

---

# Suggestions from me (take or leave)

1. **The reframe (Slide 4) is your whole defense.** If the committee only remembers one thing,
   make it "instrument, not toy." Consider rehearsing the talk so everything points at it.
2. **Budget your time backwards from the demo.** The demo (Slide 6) and the DS contribution
   (Slides 7–9) deserve ~half your minutes. Trim the stack slide before you trim those.
3. **Have the demo as a recorded GIF even if you go live.** Live 3D + physics in a browser is
   exactly the thing that breaks on the projector. A silent 20s loop is a safe fallback.
4. **Two colors, one font, lots of whitespace.** Minimalist means the LEGO/robot imagery does
   the decorating; don't add clip-art. Let one screenshot per slide breathe.
5. **Don't hide the "≈2 students" number** — say it with confidence and immediately reframe it as
   "which is why the contribution is the *instrument and the pipeline*, designed to scale."
   Weakness owned early stops being a weakness.
6. **If you have a real captured session, show one real trajectory** on Slide 8 instead of a
   generic diagram. One authentic data artifact is worth ten mockups.

---

*Ready when you are: say the word and I'll write the spoken script (per slide, timed),
tighten this to a specific slide count, or adapt it to whatever template you choose.*
