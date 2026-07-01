import { create } from 'zustand'
import type { LevelDefinition } from '../challenges/types'

export interface ChallengeResult {
  success: boolean
  message: string
}

interface ChallengeState {
  /** The level currently loaded into the simulator, or null on the level-select screen. */
  activeLevel: LevelDefinition | null
  result: ChallengeResult | null
  setActiveLevel: (level: LevelDefinition | null) => void
  setResult: (result: ChallengeResult | null) => void
}

export const useChallengeStore = create<ChallengeState>((set) => ({
  activeLevel: null,
  result: null,
  setActiveLevel: (level) => set({ activeLevel: level, result: null }),
  setResult: (result) => set({ result }),
}))
