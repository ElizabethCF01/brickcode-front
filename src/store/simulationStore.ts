import { create } from 'zustand'

type SimulationStatus = 'stopped' | 'running' | 'paused'

interface SimulationState {
  status: SimulationStatus
  sensorValues: Record<string, number>
  setStatus: (status: SimulationStatus) => void
  setSensorValue: (id: string, value: number) => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: 'stopped',
  sensorValues: {},
  setStatus: (status) => set({ status }),
  setSensorValue: (id, value) =>
    set((state) => ({ sensorValues: { ...state.sensorValues, [id]: value } })),
}))
