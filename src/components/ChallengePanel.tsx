import { useState } from 'react'
import { CircleCheck, CircleX, Lightbulb } from 'lucide-react'
import { useChallengeStore } from '../store/challengeStore'

export default function ChallengePanel() {
  const result = useChallengeStore((s) => s.result)
  const level = useChallengeStore((s) => s.activeLevel)
  const [showHints, setShowHints] = useState(false)

  if (!level) return null

  return (
    <div className="px-4 py-3 bg-surface/95 border-t border-line text-sm shrink-0">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-ink font-bold">{level.title}</span>
        <button
          onClick={() => setShowHints(h => !h)}
          aria-expanded={showHints}
          className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-semibold
            text-action-600 hover:text-action-500 hover:bg-surface-2 transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Lightbulb size={16} aria-hidden="true" />
          {showHints ? 'Hide hints' : 'Show hints'}
        </button>
      </div>

      <p className="text-ink-muted mb-2 leading-snug">{level.description}</p>

      {showHints && level.hints.length > 0 && (
        <ul className="mb-2 space-y-1">
          {level.hints.map((hint, i) => (
            <li key={i} className="text-ink-muted text-xs flex gap-2">
              <Lightbulb size={14} className="text-brand-600 shrink-0" aria-hidden="true" />
              {hint}
            </li>
          ))}
        </ul>
      )}

      {/* Live region stays mounted so screen readers announce the run result. */}
      <div aria-live="polite">
        {result && (
          <div
            className={`mt-1 flex items-center gap-2 px-3 py-2 rounded-lg font-semibold border ${
              result.success
                ? 'bg-success-100 text-success-700 border-success-600/30'
                : 'bg-danger-100 text-danger-700 border-danger-600/30'
            }`}
          >
            {result.success
              ? <CircleCheck size={18} className="shrink-0" aria-hidden="true" />
              : <CircleX size={18} className="shrink-0" aria-hidden="true" />}
            {result.message}
          </div>
        )}
      </div>
    </div>
  )
}
