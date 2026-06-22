import type { Block, Workspace } from 'blockly'

// ── Drive constants ────────────────────────────────────────────────────────
// Legacy drive_forward block: SPEED field is already in deg/s.
const DEFAULT_DRIVE_SPEED = 360

// New robot_drive_forward/backward blocks: SPEED field is 0–100 (percentage).
// 100 % maps to MAX_DRIVE_SPEED_DEG_S.
const MAX_DRIVE_SPEED_DEG_S = 360

// ── Turn geometry (matches SimpleRobot dimensions) ────────────────────────
const WHEEL_RADIUS_WU    = 0.28   // world units (1 WU = 10 cm) — LDraw 3483 large wheel
const WHEEL_BASE_DEFAULT = 1.75   // SimpleRobot wheel-centre to wheel-centre
const TURN_MOTOR_SPEED   = 180    // deg/s applied to each motor while turning

/**
 * Public motor API required by the interpreter.
 * Both LegoMotor and the demo SimpleMotor in SimulationEngine satisfy this.
 */
export interface IMotor {
  setSpeed(degreesPerSecond: number): void
  stop(): void
}

/**
 * Public sensor API required by the interpreter.
 * LegoDistanceSensor satisfies this.
 */
export interface ISensor {
  getValue(): number
}

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
    left: IMotor
    right: IMotor
  }
  sensor: ISensor
  /**
   * Whether this robot actually carries a distance sensor. Procedural robots
   * (`SimpleRobot`) are `true`; imported `.ldr` robots are `true` only when the
   * parsed model contains a sensor part. The UI uses this to hide sensor-only
   * panels/blocks for motors-only robots. When omitted, treat as `false`.
   */
  hasSensor?: boolean
  /**
   * Current world-space position of the chassis centre, in world units.
   * Used by motor-only challenges to measure how far the robot has driven.
   */
  getPosition?(): { x: number; y: number; z: number }
  /** Wheel centre-to-centre distance in world units. Used by robot_turn. */
  wheelBaseWU?: number
  /** Driven-wheel rolling radius in world units. Used by robot_turn. */
  wheelRadiusWU?: number
  /**
   * Multiplier applied to commanded degrees in `robot_turn` to compensate for
   * friction / chassis damping / joint saturation losses that the kinematic
   * formula doesn't capture. Same role as the calibration step on real LEGO
   * Spike/Mindstorms robots: measure how much the robot actually rotates and
   * adjust until commanded == observed. 1.0 = no calibration.
   */
  turnCalibration?: number
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
        const wheelBase   = this.robot.wheelBaseWU      ?? WHEEL_BASE_DEFAULT
        const wheelRadius = this.robot.wheelRadiusWU    ?? WHEEL_RADIUS_WU
        const calibration = this.robot.turnCalibration  ?? 1.0

        const motorDeg = (degrees * calibration) * (wheelBase / 2) / wheelRadius
        const duration = motorDeg / TURN_MOTOR_SPEED  // seconds

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

      // ── Control flow ────────────────────────────────────────────────────────

      case 'controls_if': {
        // Supports the basic if block (no else-if / else arms for now).
        const condition = this.evaluateValue(block.getInputTargetBlock('IF0'))
        if (condition) {
          await this.executeSequence(block.getInputTargetBlock('DO0'))
        }
        break
      }

      case 'controls_whileUntil': {
        const mode = block.getFieldValue('MODE') ?? 'WHILE'
        // Guard against tight infinite loops: each iteration yields at least 50 ms
        // so the physics RAF loop can update sensor values between checks.
        while (this._running) {
          const cond = this.evaluateValue(block.getInputTargetBlock('BOOL'))
          if (mode === 'WHILE' && !cond) break
          if (mode === 'UNTIL' && cond)  break
          await this.executeSequence(block.getInputTargetBlock('DO'))
          await this.sleep(50)
        }
        break
      }

      case 'controls_repeat_ext': {
        const times = Math.round(this.evaluateValue(block.getInputTargetBlock('TIMES')))
        for (let i = 0; i < times && this._running; i++) {
          await this.executeSequence(block.getInputTargetBlock('DO'))
        }
        break
      }

      // Unknown block types are silently skipped so a workspace with experimental
      // blocks doesn't crash an otherwise valid program.
    }
  }

  /**
   * Evaluate a value block and return a number.
   * Returns 0 for null / unknown block types.
   */
  private evaluateValue(block: Block | null): number {
    if (!block) return 0

    switch (block.type) {
      case 'sensor_distance':
        return this.robot.sensor.getValue()

      case 'math_number':
        return Number(block.getFieldValue('NUM') ?? 0)

      case 'math_arithmetic': {
        const a  = this.evaluateValue(block.getInputTargetBlock('A'))
        const b  = this.evaluateValue(block.getInputTargetBlock('B'))
        const op = block.getFieldValue('OP')
        switch (op) {
          case 'ADD':      return a + b
          case 'MINUS':    return a - b
          case 'MULTIPLY': return a * b
          case 'DIVIDE':   return b !== 0 ? a / b : 0
          case 'POWER':    return Math.pow(a, b)
          default:         return 0
        }
      }

      case 'logic_compare': {
        const a  = this.evaluateValue(block.getInputTargetBlock('A'))
        const b  = this.evaluateValue(block.getInputTargetBlock('B'))
        const op = block.getFieldValue('OP')
        switch (op) {
          case 'EQ':  return a === b ? 1 : 0
          case 'NEQ': return a !== b ? 1 : 0
          case 'LT':  return a <   b ? 1 : 0
          case 'LTE': return a <=  b ? 1 : 0
          case 'GT':  return a >   b ? 1 : 0
          case 'GTE': return a >=  b ? 1 : 0
          default:    return 0
        }
      }

      default:
        return 0
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
