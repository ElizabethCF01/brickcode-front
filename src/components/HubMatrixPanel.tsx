import { useSimulationStore } from '../store/simulationStore'

/**
 * Renders the SPIKE Essential hub's 3×3 light matrix as a small overlay.
 * Reads `hubMatrix` (nine 0–100 brightness values, row-major) from the store;
 * the `light_*` blocks drive it through `HubLights`.
 */
export default function HubMatrixPanel() {
  const hubMatrix = useSimulationStore((s) => s.hubMatrix)

  return (
    <div className="bg-ink/80 rounded-xl p-2 pointer-events-none select-none" aria-hidden="true">
      <div className="text-[10px] font-semibold text-white/70 mb-1 text-center">Light</div>
      <div className="grid grid-cols-3 gap-1">
        {hubMatrix.map((brightness, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-sm"
            style={{
              backgroundColor: '#7CFF6B',
              // 0 brightness → nearly off; 100 → full glow.
              opacity: 0.12 + (Math.max(0, Math.min(100, brightness)) / 100) * 0.88,
              boxShadow: brightness > 0 ? '0 0 6px #7CFF6B' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
