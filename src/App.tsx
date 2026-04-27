import ControlPanel from './components/ControlPanel'
import SensorPanel from './components/SensorPanel'
import BlocklyWorkspace from './components/BlocklyWorkspace'
import SimulatorCanvas from './engine/renderer/SimulatorCanvas'

export default function App() {
  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-gray-900">
      <ControlPanel />

      <div className="flex flex-1 overflow-hidden">
        {/* 3D viewport */}
        <div className="flex-1 relative min-w-0">
          <SimulatorCanvas />
          <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
            Arrastra para orbitar · Rueda para zoom
          </div>
        </div>

        {/* Blockly panel */}
        <div className="w-105 border-l border-gray-700 flex flex-col overflow-hidden shrink-0">
          <BlocklyWorkspace />
        </div>
      </div>

      <SensorPanel />
    </div>
  )
}
