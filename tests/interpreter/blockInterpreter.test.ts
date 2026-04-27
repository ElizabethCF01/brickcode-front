import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Block, Workspace } from 'blockly'
import { BlockInterpreter, type SimpleRobot } from '../../src/interpreter/BlockInterpreter'

// ── Minimal mock helpers ───────────────────────────────────────────────────

function mockMotor() {
  return {
    setSpeed:        vi.fn(),
    stop:            vi.fn(),
    getAngle:        vi.fn(() => 0),
    step:            vi.fn(),
    dispose:         vi.fn(),
  }
}

function mockSensor(value = 100) {
  return {
    getValue:        vi.fn(() => value),
    step:            vi.fn(),
    setDebugVisible: vi.fn(),
    dispose:         vi.fn(),
  }
}

function makeRobot(): SimpleRobot {
  return {
    motors: { left: mockMotor() as unknown as SimpleRobot['motors']['left'],
              right: mockMotor() as unknown as SimpleRobot['motors']['right'] },
    sensor: mockSensor() as unknown as SimpleRobot['sensor'],
  }
}

interface MockBlock {
  type: string
  getFieldValue: (name: string) => string | null
  getInputTargetBlock: (name: string) => MockBlock | null
  getNextBlock: () => MockBlock | null
}

function makeBlock(
  type: string,
  fields: Record<string, string> = {},
  next: MockBlock | null = null,
): MockBlock {
  return {
    type,
    getFieldValue:        (name) => fields[name] ?? null,
    getInputTargetBlock:  () => null,
    getNextBlock:         () => next,
  }
}

function makeWorkspace(topBlocks: MockBlock[]): Pick<Workspace, 'getTopBlocks'> {
  return { getTopBlocks: () => topBlocks as unknown as Block[] }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BlockInterpreter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // ── isRunning / stop ─────────────────────────────────────────────────────

  it('isRunning() is false before run() is called', () => {
    const interpreter = new BlockInterpreter(makeRobot())
    expect(interpreter.isRunning()).toBe(false)
  })

  it('isRunning() is true while awaiting a sleep inside run()', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { SPEED: '360', DURATION: '2' })
    const ws = makeWorkspace([driveBlock])

    const runPromise = interpreter.run(ws as Workspace)
    // Before any timers fire the interpreter is mid-sleep
    expect(interpreter.isRunning()).toBe(true)

    await vi.runAllTimersAsync()
    await runPromise
    expect(interpreter.isRunning()).toBe(false)
  })

  it('isRunning() returns false after run() resolves naturally', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const ws = makeWorkspace([makeBlock('motor_stop')])

    await interpreter.run(ws as Workspace)
    expect(interpreter.isRunning()).toBe(false)
  })

  // ── drive_forward ─────────────────────────────────────────────────────────

  it('drive_forward sets both motor speeds and auto-stops after duration', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { SPEED: '360', DURATION: '2' })
    const ws = makeWorkspace([driveBlock])

    const runPromise = interpreter.run(ws as Workspace)
    await vi.advanceTimersByTimeAsync(2000)
    await runPromise

    expect(robot.motors.left.setSpeed).toHaveBeenCalledWith(360)
    expect(robot.motors.right.setSpeed).toHaveBeenCalledWith(360)
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
    expect(robot.motors.right.stop).toHaveBeenCalledOnce()
  })

  it('drive_forward uses DEFAULT_DRIVE_SPEED when SPEED field is absent', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { DURATION: '1' })
    const ws = makeWorkspace([driveBlock])

    const runPromise = interpreter.run(ws as Workspace)
    await vi.runAllTimersAsync()
    await runPromise

    // 360 deg/s is the baked-in default
    expect(robot.motors.left.setSpeed).toHaveBeenCalledWith(360)
  })

  // ── wait_seconds ──────────────────────────────────────────────────────────

  it('wait_seconds delays execution without touching motors', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const waitBlock = makeBlock('wait_seconds', { SECONDS: '3' })
    const ws = makeWorkspace([waitBlock])

    const runPromise = interpreter.run(ws as Workspace)

    // Nothing should have happened yet
    expect(robot.motors.left.setSpeed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    await runPromise

    expect(robot.motors.left.setSpeed).not.toHaveBeenCalled()
    expect(robot.motors.left.stop).not.toHaveBeenCalled()
  })

  // ── motor_stop ────────────────────────────────────────────────────────────

  it('motor_stop calls stop() on both motors immediately', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const ws = makeWorkspace([makeBlock('motor_stop')])

    await interpreter.run(ws as Workspace)

    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
    expect(robot.motors.right.stop).toHaveBeenCalledOnce()
  })

  // ── stop() cancellation ───────────────────────────────────────────────────

  it('stop() cancels a running drive_forward and brakes motors', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { SPEED: '360', DURATION: '5' })
    const ws = makeWorkspace([driveBlock])

    const runPromise = interpreter.run(ws as Workspace)

    // Advance only 1 s of the 5 s drive, then cancel
    await vi.advanceTimersByTimeAsync(1000)
    interpreter.stop()
    await runPromise

    expect(interpreter.isRunning()).toBe(false)
    // stop() must have braked the motors
    expect(robot.motors.left.stop).toHaveBeenCalled()
    expect(robot.motors.right.stop).toHaveBeenCalled()
  })

  it('second run() call while already running is a no-op', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { SPEED: '180', DURATION: '2' })
    const ws = makeWorkspace([driveBlock])

    const first  = interpreter.run(ws as Workspace)
    const second = interpreter.run(ws as Workspace)  // should be ignored

    await vi.runAllTimersAsync()
    await Promise.all([first, second])

    // setSpeed called exactly once — the second run() didn't start
    expect(robot.motors.left.setSpeed).toHaveBeenCalledOnce()
  })

  // ── sequence of blocks ────────────────────────────────────────────────────

  it('executes a sequence: drive_forward → motor_stop in order', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)

    const stopBlock  = makeBlock('motor_stop')
    const driveBlock = makeBlock('drive_forward', { SPEED: '200', DURATION: '1' }, stopBlock)
    const ws = makeWorkspace([driveBlock])

    const callOrder: string[] = []
    ;(robot.motors.left.setSpeed as ReturnType<typeof vi.fn>).mockImplementation(
      () => callOrder.push('setSpeed'),
    )
    ;(robot.motors.left.stop as ReturnType<typeof vi.fn>).mockImplementation(
      () => callOrder.push('stop'),
    )

    const runPromise = interpreter.run(ws as Workspace)
    await vi.runAllTimersAsync()
    await runPromise

    // setSpeed from drive_forward, then auto-stop at end of drive, then motor_stop block
    expect(callOrder).toEqual(['setSpeed', 'stop', 'stop'])
  })

  // ── unknown blocks ────────────────────────────────────────────────────────

  it('silently skips unknown block types without throwing', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const ws = makeWorkspace([makeBlock('future_unknown_block')])

    await expect(interpreter.run(ws as Workspace)).resolves.toBeUndefined()
  })

  // ── acceptance criterion ──────────────────────────────────────────────────

  it('acceptance: adelante 2s → parar responds to the robot', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const driveBlock = makeBlock('drive_forward', { SPEED: '360', DURATION: '2' })
    const ws = makeWorkspace([driveBlock])

    const runPromise = interpreter.run(ws as Workspace)

    // Physics loop advances; after 2 simulated seconds the motors should stop
    await vi.advanceTimersByTimeAsync(2000)
    await runPromise

    expect(robot.motors.left.setSpeed).toHaveBeenCalledWith(360)
    expect(robot.motors.right.setSpeed).toHaveBeenCalledWith(360)
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
    expect(robot.motors.right.stop).toHaveBeenCalledOnce()
    expect(interpreter.isRunning()).toBe(false)
  })
})
