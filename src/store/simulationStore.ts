import { create } from 'zustand'

type SimulationStatus = 'stopped' | 'running' | 'paused'

interface SimulationState {
  status: SimulationStatus
  sensorValues: Record<string, number>
  /** Whether the active robot carries a distance sensor (drives sensor UI visibility). */
  hasSensor: boolean
  showEditor: boolean
  setStatus: (status: SimulationStatus) => void
  setSensorValue: (id: string, value: number) => void
  setHasSensor: (hasSensor: boolean) => void
  toggleEditor: () => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: 'stopped',
  sensorValues: {},
  hasSensor: false,
  showEditor: true,
  setStatus: (status) => set({ status }),
  setHasSensor: (hasSensor) => set({ hasSensor }),
  setSensorValue: (id, value) =>
    set((state) => ({ sensorValues: { ...state.sensorValues, [id]: value } })),
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
}))
