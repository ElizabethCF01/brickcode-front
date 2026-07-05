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
  /** Whether the active robot carries a colour sensor (drives colour UI/blocks visibility). */
  hasColorSensor: boolean
  /** Colour code currently seen by the colour sensor (RED/GREEN/…), or null. */
  detectedColor: string | null
  /** Hub 3×3 light matrix brightness values (0–100), row-major. */
  hubMatrix: number[]
  showEditor: boolean
  /**
   * Raised by a scripted challenge when the scenario itself decides the run is
   * over (e.g. the crocodile reached the boat). ControlPanel watches this to
   * stop the interpreter and evaluate — the piece that finite programs get from
   * `interpreter.run()` resolving, but a `forever` reactive program never does.
   */
  autoStopRequested: boolean
  setStatus: (status: SimulationStatus) => void
  setSensorValue: (id: string, value: number) => void
  setHasSensor: (hasSensor: boolean) => void
  setHasColorSensor: (hasColorSensor: boolean) => void
  setDetectedColor: (color: string | null) => void
  setHubMatrix: (matrix: number[]) => void
  toggleEditor: () => void
  requestAutoStop: () => void
  clearAutoStop: () => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: 'stopped',
  sensorValues: {},
  hasSensor: false,
  hasColorSensor: false,
  detectedColor: null,
  hubMatrix: EMPTY_MATRIX,
  showEditor: true,
  autoStopRequested: false,
  setStatus: (status) => set({ status }),
  setHasSensor: (hasSensor) => set({ hasSensor }),
  setHasColorSensor: (hasColorSensor) => set({ hasColorSensor }),
  setDetectedColor: (color) =>
    set((state) => (state.detectedColor === color ? state : { detectedColor: color })),
  setSensorValue: (id, value) =>
    set((state) => ({ sensorValues: { ...state.sensorValues, [id]: value } })),
  setHubMatrix: (matrix) => set({ hubMatrix: matrix.slice(0, HUB_MATRIX_SIZE) }),
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
  requestAutoStop: () => set({ autoStopRequested: true }),
  clearAutoStop: () => set({ autoStopRequested: false }),
}))
