import { create } from 'zustand'

interface Challenge {
  id: string
  title: string
  description: string
}

interface ChallengeState {
  activeChallenge: Challenge | null
  success: boolean
  setChallenge: (challenge: Challenge | null) => void
  setSuccess: (success: boolean) => void
}

export const useChallengeStore = create<ChallengeState>((set) => ({
  activeChallenge: null,
  success: false,
  setChallenge: (challenge) => set({ activeChallenge: challenge, success: false }),
  setSuccess: (success) => set({ success }),
}))
