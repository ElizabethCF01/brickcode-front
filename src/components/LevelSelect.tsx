import { useMemo, useState } from 'react'
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

export default function LevelSelect({ onSelect }: LevelSelectProps) {
  // Read once on mount; navigating back from a level remounts this screen, so the
  // ✅ badges stay fresh without a subscription.
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
    <div className="w-screen h-screen overflow-y-auto bg-gray-900 text-white">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-700">
        <span className="flex items-center gap-2 text-yellow-400 font-bold text-xl tracking-wide">
          <img src="/logo.png" alt="" className="h-7 w-7" />
          <span>BrickCode</span>
        </span>
        <button
          onClick={() => getSupabase()?.auth.signOut()}
          className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          title="Sign out"
        >
          🚪 Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-1">Choose your challenge</h1>
        <p className="text-gray-400 mb-6">Each level practices something different. Start wherever you like!</p>

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
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        active
          ? 'bg-white text-gray-900 border-white'
          : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500'
      }`}
    >
      {color && !active && (
        <span
          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
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
}: {
  level: Level
  completed: boolean
  onSelect: (level: LevelDefinition) => void
}) {
  const playable = isPlayable(level) && !level.comingSoon
  const clickable = playable

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect(level as LevelDefinition)}
      className={`relative text-left rounded-xl border p-4 flex flex-col gap-3 transition ${
        clickable
          ? 'bg-gray-800 border-gray-700 hover:border-yellow-400 hover:shadow-lg cursor-pointer'
          : 'bg-gray-850 border-gray-800 opacity-60 cursor-not-allowed'
      }`}
      style={!clickable ? { backgroundColor: '#161d2b' } : undefined}
    >
      {/* Status badge */}
      <div className="absolute top-3 right-3 text-sm">
        {completed ? (
          <span className="text-green-400" title="Completed">✅</span>
        ) : level.comingSoon ? (
          <span className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
            Coming soon
          </span>
        ) : null}
      </div>

      <div className="pr-8">
        <h2 className="font-bold text-yellow-300 leading-tight">{level.title}</h2>
        <DifficultyDots difficulty={level.difficulty} />
      </div>

      <p className="text-gray-300 text-sm leading-snug line-clamp-3">{level.description}</p>

      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        {level.tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: CATEGORY_COLOR[tag] }}
          >
            {CATEGORY_LABEL[tag]}
          </span>
        ))}
      </div>
    </button>
  )
}

function DifficultyDots({ difficulty }: { difficulty: number }) {
  return (
    <span className="flex items-center gap-1 mt-1" title={DIFFICULTY_LABEL[difficulty]}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${n <= difficulty ? 'bg-yellow-400' : 'bg-gray-600'}`}
        />
      ))}
      <span className="text-[11px] text-gray-400 ml-1">{DIFFICULTY_LABEL[difficulty]}</span>
    </span>
  )
}
