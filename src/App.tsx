import SimulatorCanvas from './engine/renderer/SimulatorCanvas'

export default function App() {
  return (
    <div className="w-full h-full flex flex-col bg-gray-900">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-yellow-400 font-bold text-xl tracking-wide">BrickCode</span>
        <span className="text-gray-400 text-sm">Simulador LEGO 3D</span>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1 relative">
          <SimulatorCanvas />
          <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
            Arrastra para orbitar · Rueda para zoom
          </div>
        </div>

        {/* Right sidebar placeholder */}
        <aside className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col items-center justify-center text-gray-500 text-sm">
          <p>Bloques</p>
          <p className="text-xs mt-1">(próximamente)</p>
        </aside>
      </div>
    </div>
  )
}
