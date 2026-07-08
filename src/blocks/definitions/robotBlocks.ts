import * as Blockly from 'blockly'
import {
  ICON_ROTATE_CW, ICON_ROTATE_CCW, ICON_ARROW_LEFT, ICON_ARROW_RIGHT, imageOption,
  ICON_EVENT, ICON_MOVE, ICON_MOTOR, ICON_LIGHT, ICON_SOUND, ICON_TIME, ICON_SENSOR,
  blockIcon, colorCircle,
} from './blockIcons'
// Side-effect import: registers the official Apache-2.0 `field_bitmap` custom
// field (a drawable pixel grid) and its CSS in Blockly's global registry.
// Used by `light_display_matrix` so kids "draw" the 3×3 hub icon on the block,
// like the LEGO SPIKE app.
import '@blockly/field-bitmap'

// Default 3×3 heart drawn on the matrix editor (rows of 0/1, row 0 = top).
const HEART_3X3 = [
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 0],
]

// LEGO brand colours used across all robot blocks.
const LEGO_RED    = '#DA291C'
const LEGO_YELLOW = '#FFD700'
const LEGO_BLUE   = '#006CB7'

// SPIKE Essential palette — mirrors the official LEGO SPIKE block categories
// so the toolbox feels familiar to anyone coming from the LEGO Education app.
const SPIKE_EVENT = '#F5C402'   // Events (yellow)
const SPIKE_MOVE  = '#FF4CCD'   // Movement (pink/magenta)
const SPIKE_LIGHT = '#9B6AF6'   // Light / 3×3 matrix (purple)
const SPIKE_MOTOR = '#0090F5'   // Motor (blue)
const SPIKE_SOUND = '#C061F1'   // Sound (magenta)
const SPIKE_OP    = '#59C059'   // Operators (green)
const SPIKE_SENSOR = '#3FCCF1'  // Sensors (cyan — matches the SPIKE app palette)
// Matches the Control category colour in BlocklyWorkspace's toolbox.
const CONTROL_ORANGE = '#FF8C00'

// Colour-picker swatches for `sensor_sees_color`. Hexes mirror SensorPanel's
// COLOR_DISPLAY so the block swatch and the live readout chip look identical.
const COLOR_OPTIONS = [
  imageOption(colorCircle('#DA291C'), 'red',    'RED'),
  imageOption(colorCircle('#2E7D32'), 'green',  'GREEN'),
  imageOption(colorCircle('#006CB7'), 'blue',   'BLUE'),
  imageOption(colorCircle('#FFD700'), 'yellow', 'YELLOW'),
  imageOption(colorCircle('#F5F5F5'), 'white',  'WHITE'),
  imageOption(colorCircle('#1a1a1a'), 'black',  'BLACK'),
]

// Shared dropdown option lists.
const PORT_OPTIONS = [['A', 'A'], ['B', 'B']]
// Motor spin direction shown as rotation-arrow icons (SPIKE-style).
const SPIN_OPTIONS = [
  imageOption(ICON_ROTATE_CW,  'clockwise',        'CW'),
  imageOption(ICON_ROTATE_CCW, 'counterclockwise', 'CCW'),
]
// Turn direction shown as left/right arrow icons.
const TURN_OPTIONS = [
  imageOption(ICON_ARROW_LEFT,  'left',  'LEFT'),
  imageOption(ICON_ARROW_RIGHT, 'right', 'RIGHT'),
]

// ---------------------------------------------------------------------------
// Block JSON definitions
// ---------------------------------------------------------------------------

// Defined inline via defineBlocksWithJsonArray — typed as any[] matches the
// Blockly JSON array API (BlockDefinition union is complex; JSON is fine here).
const blockJsonArray: object[] = [
  // ── Events ────────────────────────────────────────────────────────────────
  {
    // Hat block: a stack header with no previous connection. Blocks attached
    // below it run when the program starts. The interpreter treats it as a
    // cosmetic no-op and executes the blocks connected beneath.
    type: 'event_when_started',
    message0: '%1 When the program starts',
    args0: [blockIcon(ICON_EVENT, 'event')],
    nextStatement: null,
    colour: SPIKE_EVENT,
    tooltip: 'Starts the program. Connect the blocks you want to run below.',
  },
  {
    type: 'robot_drive_forward',
    message0: '%1 Move forward %2 for %3 seconds',
    args0: [
      blockIcon(ICON_MOVE, 'move'),
      { type: 'field_number', name: 'SPEED',    value: 50, min: 0, max: 100 },
      { type: 'field_number', name: 'DURATION', value: 1,  min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Moves the robot forward for N seconds.',
  },
  {
    type: 'robot_drive_backward',
    message0: '%1 Move backward %2 for %3 seconds',
    args0: [
      blockIcon(ICON_MOVE, 'move'),
      { type: 'field_number', name: 'SPEED',    value: 50, min: 0, max: 100 },
      { type: 'field_number', name: 'DURATION', value: 1,  min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Moves the robot backward for N seconds.',
  },
  {
    type: 'robot_turn',
    message0: '%1 Turn %2 %3 degrees',
    args0: [
      blockIcon(ICON_MOVE, 'turn'),
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: TURN_OPTIONS,
      },
      { type: 'field_number', name: 'DEGREES', value: 90, min: 0, max: 360 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_BLUE,
    tooltip: 'Turns the robot left or right by the given number of degrees.',
  },
  {
    type: 'robot_stop',
    message0: '%1 Stop motors',
    args0: [blockIcon(ICON_MOVE, 'stop')],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Stops the robot\'s motors immediately.',
  },
  {
    // Value block — no previousStatement/nextStatement; has output instead.
    // Sensor blocks carry the leading sensor glyph like the SPIKE app (the
    // reference sim puts SensorLight.svg inside its sensor reporters too).
    type: 'sensor_distance',
    message0: '%1 Front distance (cm)',
    args0: [blockIcon(ICON_SENSOR, 'sensor')],
    output: 'Number',
    colour: SPIKE_SENSOR,
    tooltip: 'Returns the distance in centimeters to the nearest obstacle.',
  },
  {
    // Boolean reporter for the colour sensor — plugs into "si… entonces" /
    // "repetir hasta que". SPIKE-style: sensor glyph + a picker of real colour
    // circles (not text). Codes must match `DetectableColor` (colorRegistry).
    type: 'sensor_sees_color',
    message0: '%1 Sees the color %2?',
    args0: [
      blockIcon(ICON_SENSOR, 'sensor'),
      {
        type: 'field_dropdown',
        name: 'COLOR',
        options: COLOR_OPTIONS,
      },
    ],
    output: 'Boolean',
    colour: SPIKE_SENSOR,
    tooltip: 'True when the color sensor sees the chosen color (up close).',
  },
  {
    type: 'wait_seconds',
    message0: '%1 Wait %2 seconds',
    args0: [
      blockIcon(ICON_TIME, 'time'),
      { type: 'field_number', name: 'SECONDS', value: 1, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_YELLOW,
    tooltip: 'Pauses the program for N seconds.',
  },

  // ── Movement: SPIKE-style "move for N rotations / degrees / seconds" ───────
  {
    type: 'robot_move_for',
    message0: '%1 Move %2 for %3 %4',
    args0: [
      blockIcon(ICON_MOVE, 'move'),
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['forward',  'FORWARD'],
          ['backward', 'BACKWARD'],
        ],
      },
      { type: 'field_number', name: 'AMOUNT', value: 1, min: 0 },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['rotations', 'ROTATIONS'],
          ['degrees',   'DEGREES'],
          ['seconds',   'SECONDS'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOVE,
    tooltip: 'Moves the robot a number of rotations, degrees, or seconds.',
  },

  // ── Hub 3×3 light matrix ───────────────────────────────────────────────────
  {
    // Drawable 3×3 editor (SPIKE-style): the kid clicks pixels on the block.
    type: 'light_display_matrix',
    message0: '%1 Show %2',
    args0: [
      blockIcon(ICON_LIGHT, 'light'),
      {
        type: 'field_bitmap',
        name: 'MATRIX',
        width: 3,
        height: 3,
        value: HEART_3X3,
        buttons: { randomize: false, clear: true },
        fieldHeight: 54,
        // LED model: a filled (1) pixel is one that *lights up* on the hub, so
        // draw it lit (green, like HubMatrixPanel) and empty (0) dark. The
        // plugin's defaults are the opposite (filled = dark, empty = white),
        // which read backwards next to the hub card.
        colours: { filled: '#7CFF6B', empty: '#2b2540' },
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Draws an image on the 3×3 light matrix.',
  },
  {
    type: 'light_display_image',
    message0: '%1 Show image %2',
    args0: [
      blockIcon(ICON_LIGHT, 'light'),
      {
        type: 'field_dropdown',
        name: 'IMAGE',
        options: [
          ['heart ♥',   'CORAZON'],
          ['face 🙂',   'CARA'],
          ['square ⬜',  'CUADRADO'],
          ['cross ✖',   'EQUIS'],
          ['arrow ↑',   'FLECHA'],
          ['all on',    'LLENO'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Shows an image on the 3×3 light matrix.',
  },
  {
    type: 'light_set_pixel',
    message0: '%1 Turn on row %2 column %3 brightness %4',
    args0: [
      blockIcon(ICON_LIGHT, 'light'),
      { type: 'field_number', name: 'ROW',        value: 1, min: 1, max: 3 },
      { type: 'field_number', name: 'COL',        value: 1, min: 1, max: 3 },
      { type: 'field_number', name: 'BRIGHTNESS', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Turns on a pixel of the 3×3 matrix (row and column from 1 to 3).',
  },
  {
    type: 'light_off',
    message0: '%1 Turn off display',
    args0: [blockIcon(ICON_LIGHT, 'light')],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Turns off the entire light matrix.',
  },

  // ── Motors addressed by port (SPIKE Essential ports A / B) ─────────────────
  {
    type: 'motor_run_for',
    message0: '%1 Motor %2 spin %3 for %4 %5',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT',      options: PORT_OPTIONS },
      { type: 'field_dropdown', name: 'DIRECTION', options: SPIN_OPTIONS },
      { type: 'field_number',   name: 'AMOUNT',    value: 1, min: 0 },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['rotations', 'ROTATIONS'],
          ['degrees',   'DEGREES'],
          ['seconds',   'SECONDS'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Spins a motor (port A or B) an amount, then stops it.',
  },
  {
    type: 'motor_start',
    message0: '%1 Start motor %2 spinning %3',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT',      options: PORT_OPTIONS },
      { type: 'field_dropdown', name: 'DIRECTION', options: SPIN_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Starts spinning a motor continuously (it does not stop on its own).',
  },
  {
    type: 'motor_stop_port',
    message0: '%1 Stop motor %2',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT', options: PORT_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Stops the motor on the given port.',
  },
  {
    // Reporter (value block) — outputs the motor angle in degrees.
    type: 'motor_position',
    message0: 'Motor %1 position (degrees)',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: PORT_OPTIONS },
    ],
    output: 'Number',
    colour: SPIKE_MOTOR,
    tooltip: 'Returns the angle the motor has turned, in degrees.',
  },

  // ── Sound (hub speaker) ────────────────────────────────────────────────────
  {
    type: 'sound_beep',
    message0: '%1 Beep for %2 seconds',
    args0: [
      blockIcon(ICON_SOUND, 'sound'),
      { type: 'field_number', name: 'DURATION', value: 0.5, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_SOUND,
    tooltip: 'Plays a beep for N seconds.',
  },
  {
    type: 'sound_play_note',
    message0: '%1 Play note %2 for %3 seconds',
    args0: [
      blockIcon(ICON_SOUND, 'sound'),
      {
        type: 'field_dropdown',
        name: 'NOTE',
        options: [
          ['Do',  'DO'],  ['Re', 'RE'], ['Mi', 'MI'], ['Fa', 'FA'],
          ['Sol', 'SOL'], ['La', 'LA'], ['Si', 'SI'],
        ],
      },
      { type: 'field_number', name: 'DURATION', value: 0.5, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_SOUND,
    tooltip: 'Plays a musical note for N seconds.',
  },
  {
    type: 'sound_stop',
    message0: '%1 Stop sound',
    args0: [blockIcon(ICON_SOUND, 'sound')],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_SOUND,
    tooltip: 'Stops any sound that is playing.',
  },

  // ── Control (SPIKE-style additions next to the native controls_*) ──────────
  {
    // Scratch/SPIKE "forever". Runs its body until the program stops. No
    // nextStatement on purpose — like SPIKE, nothing can follow a forever loop.
    type: 'control_forever',
    message0: 'forever %1',
    args0: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    colour: CONTROL_ORANGE,
    tooltip: 'Repeats the blocks inside without stopping (the "watch and react" pattern).',
  },
  {
    type: 'control_wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL_ORANGE,
    tooltip: 'Pauses the program until the condition is true.',
  },
  {
    // Terminal block: stops program + motors. No nextStatement — nothing can
    // run after it.
    type: 'control_stop',
    message0: 'stop the program',
    previousStatement: null,
    colour: CONTROL_ORANGE,
    tooltip: 'Stops the program and brakes the motors.',
  },

  // ── Operators ───────────────────────────────────────────────────────────────
  {
    // Reporter (value block) — random integer between FROM and TO inclusive.
    type: 'operator_random',
    message0: 'random number between %1 and %2',
    args0: [
      { type: 'field_number', name: 'FROM', value: 1 },
      { type: 'field_number', name: 'TO',   value: 10 },
    ],
    output: 'Number',
    colour: SPIKE_OP,
    tooltip: 'Returns a random integer between the two values (inclusive).',
  },
]

/**
 * Registers all BrickCode robot blocks with the Blockly runtime.
 * Call once at app startup before mounting BlocklyWorkspace.
 */
export function registerRobotBlocks(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Blockly.defineBlocksWithJsonArray(blockJsonArray as any[])
  patchRemoveTopBlock()
}

/**
 * Workaround for a Blockly v12 bug: when the flyout disposes a block whose
 * shadow children get unplugged before disposal, the shadow's `dispose()`
 * calls `workspace.removeTopBlock()` for a block that was never top-level,
 * which throws and aborts the flyout's `clearOldBlocks` loop. After that the
 * flyout gets stuck and the panel stops re-rendering when switching toolbox
 * categories. We make `removeTopBlock` a no-op when the block is missing.
 *
 * Symptom: "Block not present in workspace's list of top-most blocks." in
 * the console after switching between Mi Robot / Control / Matemáticas tabs.
 */
function patchRemoveTopBlock(): void {
  const w = globalThis as unknown as { __brickcodeRemoveTopPatched?: boolean }
  if (w.__brickcodeRemoveTopPatched) return
  w.__brickcodeRemoveTopPatched = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto: any = (Blockly.Workspace as any).prototype
  const original = proto.removeTopBlock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.removeTopBlock = function (this: any, block: any): void {
    try {
      return original.call(this, block)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("top-most blocks")) return
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Toolbox configuration (Blockly v9+ JSON format)
// ---------------------------------------------------------------------------

/**
 * Build the BrickCode toolbox categories, mirroring the LEGO SPIKE Essential
 * palette structure (Eventos · Movimiento · Luz · Sensores · Tiempo).
 *
 * `includeSensor` is data-driven from the active robot: motors-only robots
 * (e.g. an imported `.ldr` with no sensor part) omit the "Sensores" category
 * and the `sensor_distance` block, so kids only see blocks their robot can run.
 *
 * `BlocklyWorkspace` appends the built-in Control and Matemáticas categories.
 */
export function buildRobotToolbox(
  includeSensor: boolean,
  includeColorSensor = false,
): Blockly.utils.toolbox.ToolboxDefinition {
  type Cat = Blockly.utils.toolbox.ToolboxItemInfo

  const categories: Cat[] = [
    {
      kind: 'category',
      name: 'Events',
      colour: SPIKE_EVENT,
      contents: [{ kind: 'block', type: 'event_when_started' }],
    },
    {
      kind: 'category',
      name: 'Movement',
      colour: LEGO_RED,
      contents: [
        { kind: 'block', type: 'robot_move_for' },
        { kind: 'block', type: 'robot_drive_forward' },
        { kind: 'block', type: 'robot_drive_backward' },
        { kind: 'block', type: 'robot_turn' },
        { kind: 'block', type: 'robot_stop' },
      ],
    },
    {
      kind: 'category',
      name: 'Motors',
      colour: SPIKE_MOTOR,
      contents: [
        { kind: 'block', type: 'motor_run_for' },
        { kind: 'block', type: 'motor_start' },
        { kind: 'block', type: 'motor_stop_port' },
        { kind: 'block', type: 'motor_position' },
      ],
    },
    {
      kind: 'category',
      name: 'Light',
      colour: SPIKE_LIGHT,
      contents: [
        { kind: 'block', type: 'light_display_matrix' },
        { kind: 'block', type: 'light_display_image' },
        { kind: 'block', type: 'light_set_pixel' },
        { kind: 'block', type: 'light_off' },
      ],
    },
    {
      kind: 'category',
      name: 'Sound',
      colour: SPIKE_SOUND,
      contents: [
        { kind: 'block', type: 'sound_beep' },
        { kind: 'block', type: 'sound_play_note' },
        { kind: 'block', type: 'sound_stop' },
      ],
    },
  ]

  // Sensores category is data-driven per sensor kind: distance-only robots
  // don't see the colour block and vice versa.
  const sensorBlocks: Blockly.utils.toolbox.ToolboxItemInfo[] = []
  if (includeSensor)      sensorBlocks.push({ kind: 'block', type: 'sensor_distance' })
  if (includeColorSensor) sensorBlocks.push({ kind: 'block', type: 'sensor_sees_color' })
  if (sensorBlocks.length > 0) {
    categories.push({
      kind: 'category',
      name: 'Sensors',
      colour: SPIKE_SENSOR,
      contents: sensorBlocks,
    })
  }

  categories.push({
    kind: 'category',
    name: 'Time',
    colour: LEGO_YELLOW,
    contents: [{ kind: 'block', type: 'wait_seconds' }],
  })

  return { kind: 'categoryToolbox', contents: categories }
}

/**
 * Drop the named categories from a category toolbox — used by levels that
 * declare `hiddenCategories` (e.g. the scenario drives the robot itself, so
 * Movimiento/Motores would only mislead). Pure: returns a new definition,
 * no-ops when `hidden` is empty or the definition has no `contents`.
 */
export function filterToolboxCategories(
  toolbox: Blockly.utils.toolbox.ToolboxDefinition,
  hidden?: string[],
): Blockly.utils.toolbox.ToolboxDefinition {
  if (!hidden || hidden.length === 0) return toolbox
  const def = toolbox as { kind?: string; contents?: Array<{ name?: string }> }
  if (!Array.isArray(def.contents)) return toolbox
  return {
    ...def,
    contents: def.contents.filter((item) => !(item.name && hidden.includes(item.name))),
  } as Blockly.utils.toolbox.ToolboxDefinition
}

/**
 * Ready-to-use toolbox including the sensor block. Kept for backward
 * compatibility; prefer `buildRobotToolbox(hasSensor)` where the robot's
 * sensor presence is known.
 */
export const ROBOT_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition =
  buildRobotToolbox(true)
