import { create } from 'zustand'

type SimulationStatus = 'stopped' | 'running' | 'paused'

/**
 * SPIKE Essential hub 3×3 light matrix. Nine brightness values (0–100),
 * row-major (index = row * 3 + col), row 0 = top. Mirrors the physical hub's
 * 3×3 light matrix; the `light_*` blocks write here and `HubMatrixPanel` renders it.
 */
export const HUB_MATRIX_SIZE = 9
const EMPTY_MATRIX: number[] = new Array<number>(HUB_MATRIX_SIZE).fill(0)

interface SimulationState {
  status: SimulationStatus
  sensorValues: Record<string, number>
  /** Whether the active robot carries a distance sensor (drives sensor UI visibility). */
  hasSensor: boolean
  /** Hub 3×3 light matrix brightness values (0–100), row-major. */
  hubMatrix: number[]
  showEditor: boolean
  setStatus: (status: SimulationStatus) => void
  setSensorValue: (id: string, value: number) => void
  setHasSensor: (hasSensor: boolean) => void
  setHubMatrix: (matrix: number[]) => void
  toggleEditor: () => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: 'stopped',
  sensorValues: {},
  hasSensor: false,
  hubMatrix: EMPTY_MATRIX,
  showEditor: true,
  setStatus: (status) => set({ status }),
  setHasSensor: (hasSensor) => set({ hasSensor }),
  setSensorValue: (id, value) =>
    set((state) => ({ sensorValues: { ...state.sensorValues, [id]: value } })),
  setHubMatrix: (matrix) => set({ hubMatrix: matrix.slice(0, HUB_MATRIX_SIZE) }),
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
}))
