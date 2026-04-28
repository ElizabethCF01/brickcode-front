import { create } from 'zustand'

type SimulationStatus = 'stopped' | 'running' | 'paused'

interface SimulationState {
  status: SimulationStatus
  sensorValues: Record<string, number>
  showEditor: boolean
  setStatus: (status: SimulationStatus) => void
  setSensorValue: (id: string, value: number) => void
  toggleEditor: () => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: 'stopped',
  sensorValues: {},
  showEditor: true,
  setStatus: (status) => set({ status }),
  setSensorValue: (id, value) =>
    set((state) => ({ sensorValues: { ...state.sensorValues, [id]: value } })),
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
}))
