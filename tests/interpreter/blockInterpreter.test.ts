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

function mockHub() {
  return {
    setPixel:     vi.fn(),
    displayImage: vi.fn(),
    clearDisplay: vi.fn(),
  }
}

function mockSound() {
  return {
    playTone: vi.fn(),
    stop:     vi.fn(),
  }
}

function mockPortMotor(angle = 0) {
  return {
    setSpeed: vi.fn(),
    stop:     vi.fn(),
    getAngle: vi.fn(() => angle),
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
  inputs: Record<string, MockBlock> = {},
): MockBlock {
  return {
    type,
    getFieldValue:        (name) => fields[name] ?? null,
    getInputTargetBlock:  (name) => inputs[name] ?? null,
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

  // ── robot_move_for (SPIKE-style rotations / degrees / seconds) ─────────────

  it('move_for 1 rotation drives both motors then stops after 2 s (180 deg/s)', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const block = makeBlock('robot_move_for', { DIRECTION: 'FORWARD', AMOUNT: '1', UNIT: 'ROTATIONS' })
    const ws = makeWorkspace([block])

    const runPromise = interpreter.run(ws as Workspace)
    // 1 rotation = 360 wheel-deg at 180 deg/s ⇒ 2 s.
    expect(robot.motors.left.setSpeed).toHaveBeenCalledWith(180)
    expect(robot.motors.right.setSpeed).toHaveBeenCalledWith(180)
    expect(robot.motors.left.stop).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    await runPromise
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
    expect(robot.motors.right.stop).toHaveBeenCalledOnce()
  })

  it('move_for backward drives motors negative', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const block = makeBlock('robot_move_for', { DIRECTION: 'BACKWARD', AMOUNT: '0.5', UNIT: 'ROTATIONS' })
    const ws = makeWorkspace([block])

    const runPromise = interpreter.run(ws as Workspace)
    expect(robot.motors.left.setSpeed).toHaveBeenCalledWith(-180)
    await vi.runAllTimersAsync()
    await runPromise
  })

  it('move_for with SECONDS uses the amount directly as the duration', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const block = makeBlock('robot_move_for', { DIRECTION: 'FORWARD', AMOUNT: '3', UNIT: 'SECONDS' })
    const ws = makeWorkspace([block])

    const runPromise = interpreter.run(ws as Workspace)
    await vi.advanceTimersByTimeAsync(2999)
    expect(robot.motors.left.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await runPromise
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
  })

  // ── Hub 3×3 light matrix ───────────────────────────────────────────────────

  it('light_display_image sends a 9-value pattern to the hub', async () => {
    const robot = makeRobot()
    const hub = mockHub()
    const interpreter = new BlockInterpreter(robot, hub)
    const ws = makeWorkspace([makeBlock('light_display_image', { IMAGE: 'CORAZON' })])

    await interpreter.run(ws as Workspace)

    expect(hub.displayImage).toHaveBeenCalledOnce()
    expect(hub.displayImage.mock.calls[0][0]).toHaveLength(9)
  })

  it('light_display_matrix converts the bitmap grid (0/1) to a brightness pattern', async () => {
    const robot = makeRobot()
    const hub = mockHub()
    const interpreter = new BlockInterpreter(robot, hub)
    // field_bitmap value: a number[][] of 0/1 (heart), returned by getFieldValue.
    const heart = [[1, 0, 1], [1, 1, 1], [0, 1, 0]]
    const block: MockBlock = {
      type: 'light_display_matrix',
      getFieldValue:       () => heart as unknown as string,
      getInputTargetBlock: () => null,
      getNextBlock:        () => null,
    }
    await interpreter.run(makeWorkspace([block]) as Workspace)

    expect(hub.displayImage).toHaveBeenCalledWith([100, 0, 100, 100, 100, 100, 0, 100, 0])
  })

  it('light_display_matrix is safe (all-off) when the grid is missing', async () => {
    const hub = mockHub()
    const interpreter = new BlockInterpreter(makeRobot(), hub)
    await interpreter.run(makeWorkspace([makeBlock('light_display_matrix')]) as Workspace)
    expect(hub.displayImage).toHaveBeenCalledWith([0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('light_set_pixel converts 1-based fields to 0-based hub coordinates', async () => {
    const robot = makeRobot()
    const hub = mockHub()
    const interpreter = new BlockInterpreter(robot, hub)
    const ws = makeWorkspace([makeBlock('light_set_pixel', { ROW: '2', COL: '3', BRIGHTNESS: '75' })])

    await interpreter.run(ws as Workspace)

    expect(hub.setPixel).toHaveBeenCalledWith(1, 2, 75)
  })

  it('light_off clears the hub display', async () => {
    const robot = makeRobot()
    const hub = mockHub()
    const interpreter = new BlockInterpreter(robot, hub)
    const ws = makeWorkspace([makeBlock('light_off')])

    await interpreter.run(ws as Workspace)

    expect(hub.clearDisplay).toHaveBeenCalledOnce()
  })

  it('light blocks are a no-op (no throw) when no hub is supplied', async () => {
    const interpreter = new BlockInterpreter(makeRobot())
    const ws = makeWorkspace([makeBlock('light_off')])
    await expect(interpreter.run(ws as Workspace)).resolves.toBeUndefined()
  })

  // ── event_when_started (hat block) ─────────────────────────────────────────

  it('event_when_started runs the blocks connected beneath it', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const stopBlock = makeBlock('motor_stop')
    const hat = makeBlock('event_when_started', {}, stopBlock)
    const ws = makeWorkspace([hat])

    await interpreter.run(ws as Workspace)

    expect(robot.motors.left.stop).toHaveBeenCalledOnce()
  })

  // ── Motors by port (A / B) ─────────────────────────────────────────────────

  function robotWithPorts(ports: Record<string, ReturnType<typeof mockPortMotor>>): SimpleRobot {
    const robot = makeRobot()
    robot.motorsByPort = ports as unknown as SimpleRobot['motorsByPort']
    return robot
  }

  it('motor_run_for spins the addressed port then stops after the computed time', async () => {
    const portA = mockPortMotor()
    const interpreter = new BlockInterpreter(robotWithPorts({ A: portA }))
    const block = makeBlock('motor_run_for', { PORT: 'A', DIRECTION: 'CW', AMOUNT: '1', UNIT: 'ROTATIONS' })

    const runPromise = interpreter.run(makeWorkspace([block]) as Workspace)
    expect(portA.setSpeed).toHaveBeenCalledWith(180)   // 1 rotation @ 180 deg/s ⇒ 2 s
    expect(portA.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    await runPromise
    expect(portA.stop).toHaveBeenCalledOnce()
  })

  it('motor_run_for counter-clockwise drives the port negative', async () => {
    const portB = mockPortMotor()
    const interpreter = new BlockInterpreter(robotWithPorts({ B: portB }))
    const block = makeBlock('motor_run_for', { PORT: 'B', DIRECTION: 'CCW', AMOUNT: '1', UNIT: 'SECONDS' })

    const runPromise = interpreter.run(makeWorkspace([block]) as Workspace)
    expect(portB.setSpeed).toHaveBeenCalledWith(-180)
    await vi.runAllTimersAsync()
    await runPromise
  })

  it('motor_stop_port stops only the addressed motor', async () => {
    const portA = mockPortMotor()
    const portB = mockPortMotor()
    const interpreter = new BlockInterpreter(robotWithPorts({ A: portA, B: portB }))
    await interpreter.run(makeWorkspace([makeBlock('motor_stop_port', { PORT: 'B' })]) as Workspace)
    expect(portB.stop).toHaveBeenCalledOnce()
    expect(portA.stop).not.toHaveBeenCalled()
  })

  it('motor blocks are a no-op (no throw) when the robot has no port map', async () => {
    const interpreter = new BlockInterpreter(makeRobot())
    const ws = makeWorkspace([makeBlock('motor_start', { PORT: 'A', DIRECTION: 'CW' })])
    await expect(interpreter.run(ws as Workspace)).resolves.toBeUndefined()
  })

  it('motor_position reporter reads the port angle (via repeat count)', async () => {
    const robot = robotWithPorts({ A: mockPortMotor(3) })
    const interpreter = new BlockInterpreter(robot)
    const pos = makeBlock('motor_position', { PORT: 'A' })
    const repeat = makeBlock('controls_repeat_ext', {}, null, { TIMES: pos, DO: makeBlock('motor_stop') })

    await interpreter.run(makeWorkspace([repeat]) as Workspace)
    // getAngle() === 3 ⇒ the body runs 3 times.
    expect(robot.motors.left.stop).toHaveBeenCalledTimes(3)
  })

  // ── Sound ───────────────────────────────────────────────────────────────────

  it('sound_beep plays the beep tone for the given duration', async () => {
    const sound = mockSound()
    const interpreter = new BlockInterpreter(makeRobot(), undefined, sound)
    const block = makeBlock('sound_beep', { DURATION: '0.5' })

    const runPromise = interpreter.run(makeWorkspace([block]) as Workspace)
    expect(sound.playTone).toHaveBeenCalledWith(880, 500)
    await vi.advanceTimersByTimeAsync(500)
    await runPromise
  })

  it('sound_play_note maps the note name to a frequency', async () => {
    const sound = mockSound()
    const interpreter = new BlockInterpreter(makeRobot(), undefined, sound)
    const block = makeBlock('sound_play_note', { NOTE: 'LA', DURATION: '0.25' })

    const runPromise = interpreter.run(makeWorkspace([block]) as Workspace)
    expect(sound.playTone).toHaveBeenCalledWith(440, 250)
    await vi.runAllTimersAsync()
    await runPromise
  })

  it('sound_stop stops playback', async () => {
    const sound = mockSound()
    const interpreter = new BlockInterpreter(makeRobot(), undefined, sound)
    await interpreter.run(makeWorkspace([makeBlock('sound_stop')]) as Workspace)
    expect(sound.stop).toHaveBeenCalledOnce()
  })

  it('sound blocks are a no-op (no throw) when no sound is supplied', async () => {
    const interpreter = new BlockInterpreter(makeRobot())
    const runPromise = interpreter.run(makeWorkspace([makeBlock('sound_beep', { DURATION: '0' })]) as Workspace)
    await vi.runAllTimersAsync()
    await expect(runPromise).resolves.toBeUndefined()
  })

  // ── operator_random + controls_if / else ───────────────────────────────────

  it('operator_random with FROM === TO returns that exact value (via repeat count)', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const rnd = makeBlock('operator_random', { FROM: '5', TO: '5' })
    const repeat = makeBlock('controls_repeat_ext', {}, null, { TIMES: rnd, DO: makeBlock('motor_stop') })

    await interpreter.run(makeWorkspace([repeat]) as Workspace)
    expect(robot.motors.left.stop).toHaveBeenCalledTimes(5)
  })

  it('controls_if runs the ELSE branch when the condition is false', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const cond = makeBlock('math_number', { NUM: '0' })          // falsy
    const doBranch = makeBlock('robot_drive_forward', { SPEED: '50', DURATION: '1' })
    const elseBranch = makeBlock('motor_stop')
    const ifBlock = makeBlock('controls_if', {}, null, { IF0: cond, DO0: doBranch, ELSE: elseBranch })

    await interpreter.run(makeWorkspace([ifBlock]) as Workspace)
    expect(robot.motors.left.setSpeed).not.toHaveBeenCalled()  // DO0 skipped
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()      // ELSE ran
  })

  it('controls_if runs the DO branch when the condition is true', async () => {
    const robot = makeRobot()
    const interpreter = new BlockInterpreter(robot)
    const cond = makeBlock('math_number', { NUM: '1' })          // truthy
    const doBranch = makeBlock('motor_stop')
    const elseBranch = makeBlock('robot_drive_forward', { SPEED: '50', DURATION: '1' })
    const ifBlock = makeBlock('controls_if', {}, null, { IF0: cond, DO0: doBranch, ELSE: elseBranch })

    await interpreter.run(makeWorkspace([ifBlock]) as Workspace)
    expect(robot.motors.left.stop).toHaveBeenCalledOnce()      // DO0 ran
    expect(robot.motors.left.setSpeed).not.toHaveBeenCalled()  // ELSE skipped
  })
})
