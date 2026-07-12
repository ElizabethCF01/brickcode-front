# BrickCode — References & academic grounding

The project sits at the intersection of three research lines (mirrors `north-star.md`
§Academic grounding). This file records the anchors and **where each one grounds a
design decision** in the artifact, so the defense can trace claims to sources.

> ⚠️ **Verify before the defense.** The entries below capture author / year / topic
> as used in the project. Confirm exact venue, pages, and DOI against the original
> papers, and format to your program's required citation style, before submitting.

---

## 1. Educational-robotics simulators & access equity

Physical robotics carries cost, maintenance, and space barriers that simulation
reduces; simulator precedents report computational-thinking gains. Motivates the
whole "no hardware, no Wi-Fi" premise (deck slides 02–05).

- **Broll, B., et al.** *RoboScape / RoboScape Online* — a networked educational
  robotics environment; reports engagement and CT benefits without per-student
  hardware. (NetsBlox / Vanderbilt line of work.)
- General framing: educational-robotics reviews note the field's dependence on
  teacher training and the thinness of shared theoretical frameworks — which is
  part of why BrickCode centers the **teacher** (deck slide 09).

## 2. Learning analytics & computational thinking in block-based environments

Frameworks that combine data-driven and hypothesis-driven approaches to infer
programming strategies from interaction logs. Grounds the telemetry → metrics →
CT-indicators pipeline (deck slides 07–08; `src/analytics/`).

- **Grover, S., et al. (2017).** A framework combining hypothesis-driven and
  data-driven approaches to measure computational thinking in block-based
  programming, from log/clickstream data. *(LAK '17 line of work.)*
  → Grounds: deriving CT indicators from block-level logs rather than tests;
  the `indicators.ts` heuristics; trajectory analysis over successive programs.
- **Programming-trajectory / edit-distance analysis** over Scratch-like programs —
  measuring how a learner's program evolves between attempts.
  → Grounds: **tree edit distance** between successive run snapshots
  (`treeEditDistance.ts`) as the trajectory signal and the driver of the
  *iterative debugging* indicator and the stuck/guessing/decomposing labels.

## 3. Teacher-facing dashboards & classroom orchestration

Design of teacher-facing dashboards distinguishing **mirroring** support (show what
happened) from **guiding** support (orient the teacher toward action), and
teacher–AI complementarity in real-time orchestration. Grounds the dashboard design
(deck slide 09; `src/dashboard/analyticsView.tsx`, `DemoClassPage.tsx`).

- **Holstein, K., McLaren, B. M., & Aleven, V.** Teacher awareness / real-time
  classroom orchestration tools and their learning benefits.
  → Grounds: surfacing *who is stuck / guessing / decomposing* as an at-a-glance
  strategy label, not raw logs.
- **Amarasinghe, I., Hernández-Leo, D., et al.** Teacher orchestration and
  dashboard design for collaborative/individual classroom activity.
  → Grounds: the mirror-then-guide framing — indicators + trajectory that orient
  the teacher, rather than dumping every event.

---

## How to use this file

- Cite as design decisions are documented (see `docs/architecture.md` →
  *Learning Analytics Pipeline*). Every telemetry/analysis choice should be
  explainable in terms of *which CT indicator it helps reveal to the teacher*.
- Keep this list in sync with the claims made in the presentation (deck slide 12)
  and the thesis chapter.
