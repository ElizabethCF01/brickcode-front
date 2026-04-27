import type { Block, Workspace } from 'blockly'
import type { LegoMotor } from '../engine/components/LegoMotor'
import type { LegoDistanceSensor } from '../engine/components/LegoDistanceSensor'

// ── Drive constants ────────────────────────────────────────────────────────
// Legacy drive_forward block: SPEED field is already in deg/s.
const DEFAULT_DRIVE_SPEED = 360

// New robot_drive_forward/backward blocks: SPEED field is 0–100 (percentage).
// 100 % maps to MAX_DRIVE_SPEED_DEG_S.
const MAX_DRIVE_SPEED_DEG_S = 360

// ── Turn geometry (approximate — chassis not yet built) ────────────────────
// WHEEL_RADIUS_WU matches LegoMotor.ts WHEEL_RADIUS (2 studs × 0.08 = 0.16 WU).
// WHEEL_BASE_DEFAULT is an estimate; override via SimpleRobot.wheelBaseWU once
// the chassis exists with real measurements.
const WHEEL_RADIUS_WU    = 0.16   // world units (1 WU = 10 cm)
const WHEEL_BASE_DEFAULT = 0.48   // estimated 6-stud centre-to-centre separation
const TURN_MOTOR_SPEED   = 180    // deg/s applied to each motor while turning

/**
 * Minimal robot interface required by the interpreter.
 *
 * Drive convention: left.setSpeed(+n) and right.setSpeed(+n) both spin their
 * wheels in the forward direction. Both positive = robot moves forward.
 * The physical motor mounting must match this convention.
 *
 * wheelBaseWU is optional — supply it once the chassis is built.
 * Falls back to WHEEL_BASE_DEFAULT (0.48 WU) for robot_turn duration math.
 */
export interface SimpleRobot {
  motors: {
    left: LegoMotor
    right: LegoMotor
  }
  sensor: LegoDistanceSensor
  /** Wheel centre-to-centre distance in world units. Used by robot_turn. */
  wheelBaseWU?: number
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

      // ── Legacy blocks (kept for backwards compat with existing tests/workspaces) ──

      case 'drive_forward': {
        const speed    = Number(block.getFieldValue('SPEED')    ?? DEFAULT_DRIVE_SPEED)
        const duration = Number(block.getFieldValue('DURATION') ?? 1)
        this.robot.motors.left.setSpeed(speed)
        this.robot.motors.right.setSpeed(speed)
        await this.sleep(duration * 1000)
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      case 'motor_stop': {
        this.robot.motors.left.stop()
        this.robot.motors.right.stop()
        break
      }

      // ── New robot_* blocks from robotBlocks.ts ─────────────────────────────

      case 'robot_drive_forward': {
        const pct      = Number(block.getFieldValue('SPEED')    ?? 50)
        const duration = Number(block.getFieldValue('DURATION') ?? 1)
        const speed = (pct / 100) * MAX_DRIVE_SPEED_DEG_S
        this.robot.motors.left.setSpeed(speed)
        this.robot.motors.right.setSpeed(speed)
        await this.sleep(duration * 1000)
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      case 'robot_drive_backward': {
        const pct      = Number(block.getFieldValue('SPEED')    ?? 50)
        const duration = Number(block.getFieldValue('DURATION') ?? 1)
        const speed = (pct / 100) * MAX_DRIVE_SPEED_DEG_S
        this.robot.motors.left.setSpeed(-speed)
        this.robot.motors.right.setSpeed(-speed)
        await this.sleep(duration * 1000)
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      case 'robot_turn': {
        const direction = block.getFieldValue('DIRECTION') ?? 'LEFT'
        const degrees   = Number(block.getFieldValue('DEGREES') ?? 90)
        const wheelBase = this.robot.wheelBaseWU ?? WHEEL_BASE_DEFAULT

        // Arc each wheel must travel = robot_heading_change × (wheelBase/2).
        // Motor rotation = arc / WHEEL_RADIUS.
        // Duration = motor_rotation_deg / TURN_MOTOR_SPEED.
        const motorDeg = degrees * (wheelBase / 2) / WHEEL_RADIUS_WU
        const duration = motorDeg / TURN_MOTOR_SPEED  // seconds

        // LEFT turn: left motor backward, right motor forward (CCW viewed from above).
        // RIGHT turn: left motor forward, right motor backward.
        const leftSpeed  = direction === 'LEFT' ? -TURN_MOTOR_SPEED : +TURN_MOTOR_SPEED
        const rightSpeed = direction === 'LEFT' ? +TURN_MOTOR_SPEED : -TURN_MOTOR_SPEED

        this.robot.motors.left.setSpeed(leftSpeed)
        this.robot.motors.right.setSpeed(rightSpeed)
        await this.sleep(duration * 1000)
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      case 'robot_stop': {
        this.robot.motors.left.stop()
        this.robot.motors.right.stop()
        break
      }

      // ── Timing ─────────────────────────────────────────────────────────────

      case 'wait_seconds': {
        const secs = Number(block.getFieldValue('SECONDS') ?? 1)
        await this.sleep(secs * 1000)
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
