import type { SimulationEngine } from './SimulationEngine'

let _engine: SimulationEngine | null = null

export function setEngine(engine: SimulationEngine | null): void {
  _engine = engine
}

export function getEngine(): SimulationEngine | null {
  return _engine
}
