// Synthetic data generator — lets the pipeline (and the dashboard) be exercised
// at classroom scale despite the real cohort being ≈2 students. It fabricates
// LearningSessions whose program snapshots evolve run-to-run in the shape of
// three recognizable strategies, so the trajectory + indicators + status labels
// can be demonstrated and screenshotted for the defense. This is illustrative
// data, clearly separate from any real student record.

import type { LearningSession, LearningEvent } from '../backend/types'
import type { SerializedBlock, SerializedProgram } from './types'

// ── Serialized-program builders (real block types) ──────────────────────────

function chain(blocks: SerializedBlock[]): SerializedBlock | undefined {
  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next = { block: blocks[i + 1] }
  return blocks[0]
}

function program(...blocks: SerializedBlock[]): SerializedProgram {
  const head: SerializedBlock = { type: 'event_when_started' }
  const body = chain(blocks)
  if (body) head.next = { block: body }
  return { blocks: { blocks: [head] } }
}

const move = (): SerializedBlock => ({ type: 'robot_drive_forward' })
const turn = (): SerializedBlock => ({ type: 'robot_turn' })
const stop = (): SerializedBlock => ({ type: 'robot_stop' })
const distanceLt = (): SerializedBlock => ({
  type: 'logic_compare',
  inputs: { A: { block: { type: 'sensor_distance' } }, B: { block: { type: 'math_number' } } },
})
const forever = (...body: SerializedBlock[]): SerializedBlock => ({
  type: 'control_forever',
  inputs: { DO: { block: chain(body) } },
})
const repeatN = (...body: SerializedBlock[]): SerializedBlock => ({
  type: 'controls_repeat',
  inputs: { DO: { block: chain(body) } },
})
const waitUntil = (cond: SerializedBlock): SerializedBlock => ({
  type: 'control_wait_until',
  inputs: { CONDITION: { block: cond } },
})

// ── Strategy archetypes: a sequence of (program, success) per run ────────────

export type Archetype = 'decomposer' | 'guesser' | 'stuck'

interface Run {
  program: SerializedProgram
  success: boolean
}

const ARCHETYPES: Record<Archetype, Run[]> = {
  // Small, purposeful edits that build structure and end in a working solution.
  decomposer: [
    { program: program(move()), success: false },
    { program: program(move(), stop()), success: false },
    { program: program(forever(move())), success: false },
    { program: program(forever(waitUntil(distanceLt()), stop())), success: true },
  ],
  // Large, erratic rewrites every run; never lands the solution.
  guesser: [
    { program: program(move()), success: false },
    { program: program(forever(move(), turn(), move(), turn())), success: false },
    { program: program(repeatN(move(), move(), move())), success: false },
    { program: program(turn(), move(), stop(), turn()), success: false },
  ],
  // Barely changes the program across runs; no progress.
  stuck: [
    { program: program(move()), success: false },
    { program: program(move()), success: false },
    { program: program(move(), stop()), success: false },
  ],
}

// ── Session assembly ─────────────────────────────────────────────────────────

function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
}

function makeSession(run: Run, challengeId: string, startedAt: Date): LearningSession {
  const events: LearningEvent[] = [
    event('program_run_started', startedAt, challengeId, { program: run.program }),
    event('program_run_ended', new Date(startedAt.getTime() + 4000), challengeId),
    event('challenge_evaluated', new Date(startedAt.getTime() + 4000), challengeId, {
      success: run.success,
    }),
  ]
  return {
    id: uuid(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 4000).toISOString(),
    challengeIds: [challengeId],
    events,
    eventCount: events.length,
    schemaVersion: 1,
    synced: true,
  }
}

function event(
  type: string,
  when: Date,
  challengeId: string,
  payload?: Record<string, unknown>,
): LearningEvent {
  return {
    type,
    tMonotonic: 0,
    tWall: when.getTime(),
    challengeId,
    payload,
    schemaVersion: 1,
  }
}

/** All sessions for one synthetic student following the given strategy. */
export function generateStudentSessions(
  archetype: Archetype,
  challengeId = 'challenge-01',
  firstRunAt: Date = new Date('2026-01-01T09:00:00Z'),
): LearningSession[] {
  return ARCHETYPES[archetype].map((run, i) =>
    makeSession(run, challengeId, new Date(firstRunAt.getTime() + i * 5 * 60_000)),
  )
}

export interface SyntheticStudent {
  pseudonym: string
  archetype: Archetype
  sessions: LearningSession[]
}

/** A whole synthetic class, cycling through the three strategies. */
export function generateSyntheticClass(count = 9): SyntheticStudent[] {
  const order: Archetype[] = ['decomposer', 'guesser', 'stuck']
  return Array.from({ length: count }, (_, i) => {
    const archetype = order[i % order.length]
    return {
      pseudonym: `Student ${String(i + 1).padStart(2, '0')}`,
      archetype,
      sessions: generateStudentSessions(archetype),
    }
  })
}
