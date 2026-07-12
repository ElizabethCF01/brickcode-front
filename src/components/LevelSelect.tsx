import { useMemo, useState } from 'react'
import { CircleCheck, Lock, LogOut } from 'lucide-react'
import { LEVELS, isPlayable } from '../challenges'
import type { Level, LevelCategory, LevelDefinition } from '../challenges/types'
import { getCompletedLevels } from '../challenges/completion'
import { getSupabase } from '../backend/supabaseClient'

// Category presentation mirrors the SPIKE-style toolbox palette in robotBlocks.ts
// so a level's tags read the same colour as the blocks it exercises.
const CATEGORY_LABEL: Record<LevelCategory, string> = {
  motors: 'Motors',
  sensors: 'Sensors',
  lights: 'Lights',
  sound: 'Sound',
}
// Mirrors the SPIKE toolbox palette in robotBlocks.ts (Sensores = cyan).
const CATEGORY_COLOR: Record<LevelCategory, string> = {
  motors: '#0090F5',
  sensors: '#3FCCF1',
  lights: '#9B6AF6',
  sound: '#C061F1',
}
const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

type Filter = LevelCategory | 'all'

interface LevelSelectProps {
  onSelect: (level: LevelDefinition) => void
}

export default function LevelSelect({ onSelect }: Readonly<LevelSelectProps>) {
  // Read once on mount; navigating back from a level remounts this screen, so the
  // completed badges stay fresh without a subscription.
  const [completed] = useState(getCompletedLevels)
  const [filter, setFilter] = useState<Filter>('all')

  // Only offer filters for categories that actually appear in the catalog.
  const categories = useMemo(() => {
    const set = new Set<LevelCategory>()
    LEVELS.forEach((l) => l.tags.forEach((t) => set.add(t)))
    return [...set]
  }, [])

  const visible = useMemo(
    () => (filter === 'all' ? LEVELS : LEVELS.filter((l) => l.tags.includes(filter))),
    [filter],
  )

  return (
    <div className="w-screen h-screen overflow-y-auto bg-canvas text-ink">
      <header className="flex items-center gap-4 px-6 py-3 bg-surface border-b border-line">
        <span className="flex items-center gap-2 font-extrabold text-xl tracking-wide">
          <img src="/logo.png" alt="" className="h-7 w-7" />
          <span>BrickCode</span>
        </span>
        <button
          onClick={() => getSupabase()?.auth.signOut()}
          className="ml-auto flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold
            bg-surface-2 hover:bg-line text-ink transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-extrabold mb-1">Choose your challenge</h1>
        <p className="text-ink-muted mb-6">Each level practices something different. Start wherever you like!</p>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          {categories.map((cat) => (
            <FilterChip
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              label={CATEGORY_LABEL[cat]}
              color={CATEGORY_COLOR[cat]}
            />
          ))}
        </div>

        {/* Level grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((level) => (
            <LevelCard
              key={level.id}
              level={level}
              completed={completed.has(level.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: Readonly<{
  active: boolean
  onClick: () => void
  label: string
  color?: string
}>) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-2 min-h-10 rounded-full text-sm font-semibold transition-colors border
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
        active
          ? 'bg-ink text-white border-ink'
          : 'bg-surface text-ink-muted border-line hover:border-ink-muted'
      }`}
    >
      {color && !active && (
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </button>
  )
}

function LevelCard({
  level,
  completed,
  onSelect,
}: Readonly<{
  level: Level
  completed: boolean
  onSelect: (level: LevelDefinition) => void
}>) {
  const playable = isPlayable(level) && !level.comingSoon
  const clickable = playable

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect(level as LevelDefinition)}
      className={`relative text-left rounded-2xl border p-4 flex flex-col gap-3 transition ${
        clickable
          ? 'bg-surface border-line hover:border-brand-500 hover:shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
          : 'bg-surface-2 border-line opacity-70 cursor-not-allowed'
      }`}
    >
      {/* Status badge */}
      <div className="absolute top-3 right-3 text-sm">
        {completed ? (
          <CircleCheck size={20} className="text-success-600" aria-label="Completed" />
        ) : level.comingSoon ? (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-muted bg-line px-1.5 py-0.5 rounded">
            <Lock size={10} aria-hidden="true" />
            Coming soon
          </span>
        ) : null}
      </div>

      <div className="pr-8">
        <h2 className="font-bold text-ink leading-tight">{level.title}</h2>
        <DifficultyDots difficulty={level.difficulty} />
      </div>

      <p className="text-ink-muted text-sm leading-snug line-clamp-3">{level.description}</p>

      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        {level.tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-ink"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[tag] }}
              aria-hidden="true"
            />
            {CATEGORY_LABEL[tag]}
          </span>
        ))}
      </div>
    </button>
  )
}

function DifficultyDots({ difficulty }: Readonly<{ difficulty: number }>) {
  return (
    <span
      className="flex items-center gap-1 mt-1"
      aria-label={`Difficulty: ${DIFFICULTY_LABEL[difficulty]}`}
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-2 h-2 rounded-full ${n <= difficulty ? 'bg-brand-500' : 'bg-line'}`}
          aria-hidden="true"
        />
      ))}
      <span className="text-[11px] text-ink-muted ml-1">{DIFFICULTY_LABEL[difficulty]}</span>
    </span>
  )
}
