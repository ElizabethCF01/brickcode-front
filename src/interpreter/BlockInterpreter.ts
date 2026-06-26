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

// ── Movement (SPIKE-style "move for N rotations/degrees/seconds") ──────────
// SPIKE separates speed from the move block; we drive `robot_move_for` at a
// fixed comfortable pace (≈ 50 % of MAX_DRIVE_SPEED_DEG_S) so the block needs
// no inline speed field — matching SPIKE Essential's Movement palette.
const MOVE_SPEED_DEG_S = 180      // wheel deg/s used by robot_move_for and motor_* blocks

// ── Sound (SPIKE Essential hub speaker) ────────────────────────────────────
const BEEP_HZ = 880               // default beep pitch (A5)
// Musical notes for `sound_play_note` (C4 octave). Keys match the block dropdown.
const NOTE_HZ: Record<string, number> = {
  DO:  261.63, RE: 293.66, MI: 329.63, FA: 349.23,
  SOL: 392,    LA:  440,   SI: 493.88,
}

// ── Hub 3×3 light-matrix preset images (row-major, 0–100 brightness) ───────
// SPIKE Essential's hub carries a 3×3 light matrix. These named patterns back
// the `light_display_image` dropdown; keys must match the block's options.
const PRESET_IMAGES: Record<string, number[]> = {
  // Heart: two bumps on top, full middle, point at the bottom.
  CORAZON:  [100,   0, 100, 100, 100, 100,   0, 100,   0],
  CARA:     [100,   0, 100,   0,   0,   0, 100, 100, 100],
  CUADRADO: [100, 100, 100, 100,   0, 100, 100, 100, 100],
  EQUIS:    [100,   0, 100,   0, 100,   0, 100,   0, 100],
  // Up arrow: tip, barbs, stem.
  FLECHA:   [  0, 100,   0, 100, 100, 100,   0, 100,   0],
  LLENO:    [100, 100, 100, 100, 100, 100, 100, 100, 100],
}

/**
 * Convert a `field_bitmap` value (a row-major `number[][]` of 0/1) into the
 * flat 9-value brightness array `IHub.displayImage` expects: lit pixel → 100,
 * off → 0. Returns all-off for a missing/malformed value.
 */
function matrixToPattern(grid: number[][] | null): number[] {
  if (!Array.isArray(grid)) return new Array<number>(9).fill(0)
  const pattern: number[] = []
  for (const row of grid) {
    if (Array.isArray(row)) for (const cell of row) pattern.push(cell ? 100 : 0)
  }
  return pattern
}

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
 * Hub effects surface for the SPIKE Essential 3×3 light matrix.
 * The engine supplies an implementation that writes to `simulationStore`;
 * headless tests can pass a mock or omit it (light blocks become no-ops).
 *
 * Coordinates: `row`/`col` are 0–2 (row 0 = top); `brightness` is 0–100.
 * `displayImage` takes a 9-value row-major array.
 */
export interface IHub {
  setPixel(row: number, col: number, brightness: number): void
  displayImage(pattern: number[]): void
  clearDisplay(): void
}

/**
 * A single motor addressed by hub port (SPIKE Essential has ports A and B).
 * `getAngle` backs the `motor_position` reporter; optional so simple mocks can
 * omit it.
 */
export interface IMotorPort {
  setSpeed(degreesPerSecond: number): void
  stop(): void
  getAngle?(): number
}

/**
 * Hub speaker surface. The engine supplies a WebAudio-backed implementation;
 * headless tests pass a mock or omit it (sound blocks become no-ops).
 */
export interface ISound {
  /** Play a tone at `frequencyHz` for `durationMs`, then stop automatically. */
  playTone(frequencyHz: number, durationMs: number): void
  stop(): void
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
  /**
   * Motors addressed by SPIKE hub port (e.g. `{ A: …, B: … }`). Backs the
   * single-motor `motor_*` blocks. Optional — robots without a port map make
   * those blocks no-ops. `SimpleRobot` exposes A→left, B→right.
   */
  motorsByPort?: Record<string, IMotorPort>
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
  private readonly hub: IHub | null
  private readonly sound: ISound | null
  /**
   * Optional telemetry sink, called once per executed statement with the block
   * type. Lets the recording layer build a block-type distribution without the
   * interpreter knowing anything about sessions/storage. No-op when omitted
   * (headless tests, no recorder).
   */
  private readonly onBlock: ((blockType: string) => void) | null

  constructor(
    robot: SimpleRobot,
    hub?: IHub,
    sound?: ISound,
    onBlock?: (blockType: string) => void,
  ) {
    this.robot = robot
    this.hub = hub ?? null
    this.sound = sound ?? null
    this.onBlock = onBlock ?? null
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
    this.sound?.stop()
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
    this.onBlock?.(block.type)
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

      // ── Movement: SPIKE-style "move for N rotations / degrees / seconds" ────

      case 'robot_move_for': {
        const direction = block.getFieldValue('DIRECTION') ?? 'FORWARD'
        const amount    = Number(block.getFieldValue('AMOUNT') ?? 1)
        const unit      = block.getFieldValue('UNIT') ?? 'ROTATIONS'

        // Convert the requested amount into a drive duration (seconds).
        let durationSec: number
        if (unit === 'SECONDS') durationSec = amount
        else {
          const wheelDeg = unit === 'ROTATIONS' ? amount * 360 : amount
          durationSec = wheelDeg / MOVE_SPEED_DEG_S
        }

        const speed = direction === 'BACKWARD' ? -MOVE_SPEED_DEG_S : MOVE_SPEED_DEG_S
        this.robot.motors.left.setSpeed(speed)
        this.robot.motors.right.setSpeed(speed)
        await this.sleep(durationSec * 1000)
        if (this._running) {
          this.robot.motors.left.stop()
          this.robot.motors.right.stop()
        }
        break
      }

      // ── Events ─────────────────────────────────────────────────────────────
      // Hat block: a cosmetic stack header. Execution falls through to the
      // blocks connected below it (handled by getNextBlock in executeSequence).
      case 'event_when_started':
        break

      // ── Hub 3×3 light matrix ───────────────────────────────────────────────

      case 'light_display_matrix': {
        // `field_bitmap` value is a number[][] of 0/1 (row-major). Convert each
        // lit pixel to full brightness for the hub.
        const grid = block.getFieldValue('MATRIX') as unknown as number[][] | null
        this.hub?.displayImage(matrixToPattern(grid))
        break
      }

      case 'light_display_image': {
        const name = block.getFieldValue('IMAGE') ?? 'CORAZON'
        this.hub?.displayImage(PRESET_IMAGES[name] ?? PRESET_IMAGES.CORAZON)
        break
      }

      case 'light_set_pixel': {
        const row        = Number(block.getFieldValue('ROW') ?? 1)
        const col        = Number(block.getFieldValue('COL') ?? 1)
        const brightness = Number(block.getFieldValue('BRIGHTNESS') ?? 100)
        // Blocks are 1-based for kids; the hub API is 0-based.
        this.hub?.setPixel(row - 1, col - 1, brightness)
        break
      }

      case 'light_off':
        this.hub?.clearDisplay()
        break

      // ── Motors addressed by port (SPIKE Essential ports A / B) ─────────────

      case 'motor_run_for': {
        const port      = block.getFieldValue('PORT') ?? 'A'
        const direction = block.getFieldValue('DIRECTION') ?? 'CW'
        const amount    = Number(block.getFieldValue('AMOUNT') ?? 1)
        const unit      = block.getFieldValue('UNIT') ?? 'ROTATIONS'
        const motor     = this.robot.motorsByPort?.[port]
        if (!motor) break

        let durationSec: number
        if (unit === 'SECONDS') durationSec = amount
        else {
          const motorDeg = unit === 'ROTATIONS' ? amount * 360 : amount
          durationSec = motorDeg / MOVE_SPEED_DEG_S
        }

        motor.setSpeed(direction === 'CCW' ? -MOVE_SPEED_DEG_S : MOVE_SPEED_DEG_S)
        await this.sleep(durationSec * 1000)
        if (this._running) motor.stop()
        break
      }

      case 'motor_start': {
        const port      = block.getFieldValue('PORT') ?? 'A'
        const direction = block.getFieldValue('DIRECTION') ?? 'CW'
        this.robot.motorsByPort?.[port]?.setSpeed(
          direction === 'CCW' ? -MOVE_SPEED_DEG_S : MOVE_SPEED_DEG_S,
        )
        break
      }

      case 'motor_stop_port': {
        const port = block.getFieldValue('PORT') ?? 'A'
        this.robot.motorsByPort?.[port]?.stop()
        break
      }

      // ── Sound (hub speaker) ────────────────────────────────────────────────

      case 'sound_beep': {
        const duration = Number(block.getFieldValue('DURATION') ?? 0.5)
        this.sound?.playTone(BEEP_HZ, duration * 1000)
        await this.sleep(duration * 1000)
        break
      }

      case 'sound_play_note': {
        const note     = block.getFieldValue('NOTE') ?? 'DO'
        const duration = Number(block.getFieldValue('DURATION') ?? 0.5)
        this.sound?.playTone(NOTE_HZ[note] ?? NOTE_HZ.DO, duration * 1000)
        await this.sleep(duration * 1000)
        break
      }

      case 'sound_stop':
        this.sound?.stop()
        break

      // ── Timing ─────────────────────────────────────────────────────────────

      case 'wait_seconds': {
        const secs = Number(block.getFieldValue('SECONDS') ?? 1)
        await this.sleep(secs * 1000)
        break
      }

      // ── Control flow ────────────────────────────────────────────────────────

      case 'controls_if': {
        // Supports the full if / else-if / else mutation: arms IF0/DO0,
        // IF1/DO1, … evaluated in order, with an optional ELSE branch.
        let matched = false
        for (let i = 0; block.getInputTargetBlock(`IF${i}`); i++) {
          if (this.evaluateValue(block.getInputTargetBlock(`IF${i}`))) {
            await this.executeSequence(block.getInputTargetBlock(`DO${i}`))
            matched = true
            break
          }
        }
        if (!matched) {
          const elseBranch = block.getInputTargetBlock('ELSE')
          if (elseBranch) await this.executeSequence(elseBranch)
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

      case 'motor_position': {
        const port = block.getFieldValue('PORT') ?? 'A'
        return this.robot.motorsByPort?.[port]?.getAngle?.() ?? 0
      }

      case 'operator_random': {
        const from = Number(block.getFieldValue('FROM') ?? 1)
        const to   = Number(block.getFieldValue('TO') ?? 10)
        const lo   = Math.min(from, to)
        const hi   = Math.max(from, to)
        return Math.floor(Math.random() * (hi - lo + 1)) + lo
      }

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
