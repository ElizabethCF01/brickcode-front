import type { ISound } from '../interpreter/BlockInterpreter'

/**
 * WebAudio-backed model of the SPIKE Essential hub speaker.
 *
 * Implements the `ISound` surface the `BlockInterpreter` calls. The
 * `AudioContext` is created lazily on the first tone — browsers block audio
 * until a user gesture, and the Run button (which kicks off interpretation) is
 * that gesture, so a context created/resumed there is allowed to play.
 *
 * Headless tests never construct this (they pass a mock `ISound` or omit it),
 * so the absence of `AudioContext` in Node is never hit.
 */
export class HubSound implements ISound {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private gain: GainNode | null = null

  /** Play a tone at `frequencyHz` for `durationMs`, then stop automatically. */
  playTone(frequencyHz: number, durationMs: number): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    // Replace any tone already sounding.
    this.stop()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'              // a chiptune-ish buzz, kid-friendly
    osc.frequency.value = frequencyHz
    // Gentle attack/release so notes don't click.
    const now = ctx.currentTime
    const end = now + Math.max(0, durationMs) / 1000
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01)
    gain.gain.setValueAtTime(0.2, Math.max(now + 0.01, end - 0.02))
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(end)
    this.osc = osc
    this.gain = gain
    osc.onended = () => {
      if (this.osc === osc) {
        this.osc = null
        this.gain = null
      }
    }
  }

  /** Stop any tone currently playing. */
  stop(): void {
    if (this.osc) {
      try {
        this.osc.stop()
      } catch {
        // Already stopped — ignore.
      }
      this.osc.disconnect()
      this.osc = null
    }
    this.gain?.disconnect()
    this.gain = null
  }

  /** Release the AudioContext. */
  dispose(): void {
    this.stop()
    this.ctx?.close().catch(() => { /* already closed */ })
    this.ctx = null
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    // Autoplay policy: a context may start suspended until a user gesture.
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}
