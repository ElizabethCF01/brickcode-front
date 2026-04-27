import type { Block, Workspace } from 'blockly'
import type { LegoMotor } from '../engine/components/LegoMotor'
import type { LegoDistanceSensor } from '../engine/components/LegoDistanceSensor'

// Default drive speed in deg/s (one full wheel rotation per second).
const DEFAULT_DRIVE_SPEED = 360

/**
 * Minimal robot interface required by the interpreter.
 *
 * Drive convention: left.setSpeed(+n) and right.setSpeed(+n) both spin their
 * wheels in the forward direction. Both positive = robot moves forward.
 * The physical motor mounting must match this convention.
 */
export interface SimpleRobot {
  motors: {
    left: LegoMotor
    right: LegoMotor
  }
  sensor: LegoDistanceSensor
}

export class BlockInterpreter {
  private _running = false
  private cancelToken: (() => void) | null = null
  private readonly robot: SimpleRobot

  constructor(robot: SimpleRobot) {
    this.robot = robot
  }

  /**
   * Walks the Blockly workspace AST and executes each block by calling robot
   * methods directly. Returns when all top-level sequences finish or stop() is
   * called.
   */
  async run(workspace: Workspace): Promise<void> {
    if (this._running) return
    this._running = true

    try {
      const topBlocks = workspace.getTopBlocks(/* ordered */ true)
      for (const top of topBlocks) {
        if (!this._running) break
        await this.executeSequence(top)
      }
    } finally {
      this._running = false
      this.cancelToken = null
    }
  }

  /** Cancel execution and immediately brake both motors. */
  stop(): void {
    this._running = false
    if (this.cancelToken) {
      this.cancelToken()
      this.cancelToken = null
    }
    this.robot.motors.left.stop()
    this.robot.motors.right.stop()
  }

  isRunning(): boolean {
    return this._running
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async executeSequence(block: Block | null): Promise<void> {
    let current: Block | null = block
    while (current !== null && this._running) {
      await this.executeStatement(current)
      current = current.getNextBlock()
    }
  }

  private async executeStatement(block: Block): Promise<void> {
    switch (block.type) {
      case 'drive_forward': {
        const speed    = Number(block.getFieldValue('SPEED')    ?? DEFAULT_DRIVE_SPEED)
        const duration = Number(block.getFieldValue('DURATION') ?? 1)
        this.robot.motors.left.setSpeed(speed)
        this.robot.motors.right.setSpeed(speed)
        await this.sleep(duration * 1000)
        // Auto-stop only on natural completion; stop() handles the cancel case.
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      case 'wait_seconds': {
        const secs = Number(block.getFieldValue('SECONDS') ?? 1)
        await this.sleep(secs * 1000)
        break
      }

      case 'motor_stop': {
        this.robot.motors.left.stop()
        this.robot.motors.right.stop()
        break
      }

      // Unknown block types are silently skipped so a workspace with experimental
      // blocks doesn't crash an otherwise valid program.
    }
  }

  /**
   * Awaitable delay that can be interrupted by stop().
   * Resolves immediately (without delay) if already stopped.
   */
  private sleep(ms: number): Promise<void> {
    if (!this._running) return Promise.resolve()
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms)
      this.cancelToken = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }
}
