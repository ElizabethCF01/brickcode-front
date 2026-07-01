import { useState } from 'react'
import { useChallengeStore } from '../store/challengeStore'

export default function ChallengePanel() {
  const result = useChallengeStore((s) => s.result)
  const level = useChallengeStore((s) => s.activeLevel)
  const [showHints, setShowHints] = useState(false)

  if (!level) return null

  return (
    <div className="px-4 py-3 bg-gray-850 border-t border-gray-700 text-sm shrink-0"
         style={{ backgroundColor: '#1a2332' }}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-yellow-300 font-bold">{level.title}</span>
        <button
          onClick={() => setShowHints(h => !h)}
          className="text-gray-400 hover:text-gray-200 text-xs underline"
        >
          {showHints ? 'Ocultar pistas' : 'Ver pistas 💡'}
        </button>
      </div>

      <p className="text-gray-300 mb-2 leading-snug">{level.description}</p>

      {showHints && level.hints.length > 0 && (
        <ul className="mb-2 space-y-1">
          {level.hints.map((hint, i) => (
            <li key={i} className="text-gray-400 text-xs flex gap-2">
              <span className="text-yellow-400 shrink-0">💡</span>
              {hint}
            </li>
          ))}
        </ul>
      )}

      {result && (
        <div
          className={`mt-1 px-3 py-2 rounded font-medium ${
            result.success
              ? 'bg-green-900 text-green-200'
              : 'bg-red-950 text-red-300'
          }`}
          style={{ backgroundColor: result.success ? '#14532d' : '#450a0a' }}
        >
          {result.success ? '✅ ' : '❌ '}
          {result.message}
        </div>
      )}
    </div>
  )
}
