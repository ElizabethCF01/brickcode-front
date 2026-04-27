import { useSimulationStore } from '../store/simulationStore'

export default function ControlPanel() {
  const { status, setStatus } = useSimulationStore()

  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <span className="text-yellow-400 font-bold text-xl tracking-wide">
        🟡 BrickCode
      </span>

      <div className="flex gap-2 ml-auto">
        <button
          onClick={() => setStatus('running')}
          disabled={status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-gray-400
            text-white transition-colors"
        >
          ▶ Ejecutar
        </button>

        <button
          onClick={() => setStatus('stopped')}
          disabled={status === 'stopped'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:text-gray-400
            text-white transition-colors"
        >
          ⏹ Parar
        </button>

        <button
          onClick={() => setStatus('stopped')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-gray-600 hover:bg-gray-500 text-white transition-colors"
        >
          ↺ Reset
        </button>
      </div>
    </header>
  )
}
