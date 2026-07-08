import { useSimulationStore } from '../store/simulationStore'

const SENSOR_MAX_CM = 100

const STATUS_LABELS: Record<string, string> = {
  stopped: 'Idle',
  running: 'Running',
  paused: 'Paused',
}

// Display name + swatch colour per detectable colour code (see colorRegistry).
const COLOR_DISPLAY: Record<string, { label: string; hex: string }> = {
  RED:    { label: 'red',    hex: '#DA291C' },
  GREEN:  { label: 'green',  hex: '#2E7D32' },
  BLUE:   { label: 'blue',   hex: '#006CB7' },
  YELLOW: { label: 'yellow', hex: '#FFD700' },
  WHITE:  { label: 'white',  hex: '#F5F5F5' },
  BLACK:  { label: 'black',  hex: '#1a1a1a' },
}

export default function SensorPanel() {
  const { status, sensorValues, hasSensor, hasColorSensor, detectedColor } = useSimulationStore()
  const colorInfo = detectedColor ? COLOR_DISPLAY[detectedColor] : undefined

  const distance = sensorValues['front']
  const hasValue = distance !== undefined && Number.isFinite(distance)
  const fillPct = hasValue ? Math.min((distance / SENSOR_MAX_CM) * 100, 100) : 0

  return (
    <footer className="flex items-center gap-6 px-4 py-2 bg-gray-800 border-t border-gray-700 shrink-0 text-sm">
      {/* Sensor readout — only for robots that actually carry a distance sensor.
          Motors-only robots (e.g. imported spike-taxi) hide this entirely. */}
      {hasSensor && (
        <div className="flex items-center gap-3">
          <span className="text-gray-400 whitespace-nowrap">Front sensor:</span>

          <div className="w-32 h-4 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-100"
              style={{ width: `${fillPct}%` }}
            />
          </div>

          <span className="text-white font-mono w-14 text-right">
            {hasValue ? `${Math.round(distance)} cm` : '— cm'}
          </span>
        </div>
      )}

      {/* Colour sensor readout — a swatch + name of the colour in front, or a
          dimmed dash when nothing detectable is in range. */}
      {hasColorSensor && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400 whitespace-nowrap">Color:</span>
          <span
            className="w-4 h-4 rounded-full border border-gray-600"
            style={{ backgroundColor: colorInfo?.hex ?? 'transparent' }}
          />
          <span className="text-white font-mono w-16">
            {colorInfo?.label ?? '—'}
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 text-gray-400">
        <span>Status:</span>
        <span
          className={`font-medium ${
            status === 'running' ? 'text-green-400' : 'text-gray-300'
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>
    </footer>
  )
}
