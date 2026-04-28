import { create } from 'zustand'

export interface ChallengeResult {
  success: boolean
  message: string
}

interface Challenge {
  id: string
  title: string
  description: string
}

interface ChallengeState {
  activeChallenge: Challenge | null
  result: ChallengeResult | null
  setChallenge: (challenge: Challenge | null) => void
  setResult: (result: ChallengeResult | null) => void
}

export const useChallengeStore = create<ChallengeState>((set) => ({
  activeChallenge: null,
  result: null,
  setChallenge: (challenge) => set({ activeChallenge: challenge, result: null }),
  setResult: (result) => set({ result }),
}))
