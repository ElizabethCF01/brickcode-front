import type { IHub } from '../interpreter/BlockInterpreter'
import { useSimulationStore, HUB_MATRIX_SIZE } from '../store/simulationStore'

const COLS = 3

/**
 * Software model of the SPIKE Essential hub's 3×3 light matrix.
 *
 * Implements the `IHub` surface the `BlockInterpreter` calls and pushes the
 * current 9-value brightness array to `simulationStore.hubMatrix`, which
 * `HubMatrixPanel` renders. Pure state — no Three.js/WebGL — so it works in
 * headless tests too.
 */
export class HubLights implements IHub {
  private readonly matrix: number[] = new Array<number>(HUB_MATRIX_SIZE).fill(0)

  /** Set one pixel (row/col 0–2, row 0 = top) to a 0–100 brightness. */
  setPixel(row: number, col: number, brightness: number): void {
    if (row < 0 || row >= COLS || col < 0 || col >= COLS) return
    this.matrix[row * COLS + col] = clampBrightness(brightness)
    this.publish()
  }

  /** Replace the whole matrix with a 9-value row-major pattern. */
  displayImage(pattern: number[]): void {
    for (let i = 0; i < HUB_MATRIX_SIZE; i++) {
      this.matrix[i] = clampBrightness(pattern[i] ?? 0)
    }
    this.publish()
  }

  /** Turn every pixel off. */
  clearDisplay(): void {
    this.matrix.fill(0)
    this.publish()
  }

  private publish(): void {
    useSimulationStore.getState().setHubMatrix([...this.matrix])
  }
}

function clampBrightness(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}
