import * as Blockly from 'blockly'
import {
  ICON_ROTATE_CW, ICON_ROTATE_CCW, ICON_ARROW_LEFT, ICON_ARROW_RIGHT, imageOption,
  ICON_EVENT, ICON_MOVE, ICON_MOTOR, ICON_LIGHT, ICON_SOUND, ICON_TIME, blockIcon,
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

// Shared dropdown option lists.
const PORT_OPTIONS = [['A', 'A'], ['B', 'B']]
// Motor spin direction shown as rotation-arrow icons (SPIKE-style).
const SPIN_OPTIONS = [
  imageOption(ICON_ROTATE_CW,  'horario',     'CW'),
  imageOption(ICON_ROTATE_CCW, 'antihorario', 'CCW'),
]
// Turn direction shown as left/right arrow icons.
const TURN_OPTIONS = [
  imageOption(ICON_ARROW_LEFT,  'izquierda', 'LEFT'),
  imageOption(ICON_ARROW_RIGHT, 'derecha',   'RIGHT'),
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
    message0: '%1 Al empezar el programa',
    args0: [blockIcon(ICON_EVENT, 'evento')],
    nextStatement: null,
    colour: SPIKE_EVENT,
    tooltip: 'Inicia el programa. Conecta los bloques que quieras ejecutar debajo.',
  },
  {
    type: 'robot_drive_forward',
    message0: '%1 Mover adelante %2 por %3 segundos',
    args0: [
      blockIcon(ICON_MOVE, 'mover'),
      { type: 'field_number', name: 'SPEED',    value: 50, min: 0, max: 100 },
      { type: 'field_number', name: 'DURATION', value: 1,  min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Mueve el robot hacia adelante durante N segundos.',
  },
  {
    type: 'robot_drive_backward',
    message0: '%1 Mover atrás %2 por %3 segundos',
    args0: [
      blockIcon(ICON_MOVE, 'mover'),
      { type: 'field_number', name: 'SPEED',    value: 50, min: 0, max: 100 },
      { type: 'field_number', name: 'DURATION', value: 1,  min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Mueve el robot hacia atrás durante N segundos.',
  },
  {
    type: 'robot_turn',
    message0: '%1 Girar %2 %3 grados',
    args0: [
      blockIcon(ICON_MOVE, 'girar'),
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
    tooltip: 'Gira el robot a la izquierda o derecha el número de grados indicado.',
  },
  {
    type: 'robot_stop',
    message0: '%1 Parar motores',
    args0: [blockIcon(ICON_MOVE, 'parar')],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_RED,
    tooltip: 'Detiene los motores del robot inmediatamente.',
  },
  {
    // Value block — no previousStatement/nextStatement; has output instead.
    type: 'sensor_distance',
    message0: 'Distancia frontal (cm)',
    output: 'Number',
    colour: LEGO_YELLOW,
    tooltip: 'Devuelve la distancia en centímetros al obstáculo más cercano.',
  },
  {
    type: 'wait_seconds',
    message0: '%1 Esperar %2 segundos',
    args0: [
      blockIcon(ICON_TIME, 'tiempo'),
      { type: 'field_number', name: 'SECONDS', value: 1, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_YELLOW,
    tooltip: 'Pausa el programa durante N segundos.',
  },

  // ── Movement: SPIKE-style "move for N rotations / degrees / seconds" ───────
  {
    type: 'robot_move_for',
    message0: '%1 Mover %2 por %3 %4',
    args0: [
      blockIcon(ICON_MOVE, 'mover'),
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['adelante', 'FORWARD'],
          ['atrás',    'BACKWARD'],
        ],
      },
      { type: 'field_number', name: 'AMOUNT', value: 1, min: 0 },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['rotaciones', 'ROTATIONS'],
          ['grados',     'DEGREES'],
          ['segundos',   'SECONDS'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOVE,
    tooltip: 'Mueve el robot una cantidad de rotaciones, grados o segundos.',
  },

  // ── Hub 3×3 light matrix ───────────────────────────────────────────────────
  {
    // Drawable 3×3 editor (SPIKE-style): the kid clicks pixels on the block.
    type: 'light_display_matrix',
    message0: '%1 Mostrar %2',
    args0: [
      blockIcon(ICON_LIGHT, 'luz'),
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
    tooltip: 'Dibuja una imagen en la matriz de luces 3×3 del hub.',
  },
  {
    type: 'light_display_image',
    message0: '%1 Mostrar imagen %2',
    args0: [
      blockIcon(ICON_LIGHT, 'luz'),
      {
        type: 'field_dropdown',
        name: 'IMAGE',
        options: [
          ['corazón ♥',  'CORAZON'],
          ['cara 🙂',    'CARA'],
          ['cuadrado ⬜', 'CUADRADO'],
          ['equis ✖',    'EQUIS'],
          ['flecha ↑',   'FLECHA'],
          ['todo encendido', 'LLENO'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Muestra una imagen en la matriz de luces 3×3 del hub.',
  },
  {
    type: 'light_set_pixel',
    message0: '%1 Encender fila %2 columna %3 brillo %4',
    args0: [
      blockIcon(ICON_LIGHT, 'luz'),
      { type: 'field_number', name: 'ROW',        value: 1, min: 1, max: 3 },
      { type: 'field_number', name: 'COL',        value: 1, min: 1, max: 3 },
      { type: 'field_number', name: 'BRIGHTNESS', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Enciende un píxel de la matriz 3×3 (fila y columna de 1 a 3).',
  },
  {
    type: 'light_off',
    message0: '%1 Apagar pantalla',
    args0: [blockIcon(ICON_LIGHT, 'luz')],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_LIGHT,
    tooltip: 'Apaga toda la matriz de luces del hub.',
  },

  // ── Motors addressed by port (SPIKE Essential ports A / B) ─────────────────
  {
    type: 'motor_run_for',
    message0: '%1 Motor %2 girar %3 por %4 %5',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT',      options: PORT_OPTIONS },
      { type: 'field_dropdown', name: 'DIRECTION', options: SPIN_OPTIONS },
      { type: 'field_number',   name: 'AMOUNT',    value: 1, min: 0 },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['rotaciones', 'ROTATIONS'],
          ['grados',     'DEGREES'],
          ['segundos',   'SECONDS'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Gira un motor (puerto A o B) una cantidad y luego lo detiene.',
  },
  {
    type: 'motor_start',
    message0: '%1 Encender motor %2 girando %3',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT',      options: PORT_OPTIONS },
      { type: 'field_dropdown', name: 'DIRECTION', options: SPIN_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Empieza a girar un motor de forma continua (no se detiene solo).',
  },
  {
    type: 'motor_stop_port',
    message0: '%1 Parar motor %2',
    args0: [
      blockIcon(ICON_MOTOR, 'motor'),
      { type: 'field_dropdown', name: 'PORT', options: PORT_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_MOTOR,
    tooltip: 'Detiene el motor del puerto indicado.',
  },
  {
    // Reporter (value block) — outputs the motor angle in degrees.
    type: 'motor_position',
    message0: 'Posición del motor %1 (grados)',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: PORT_OPTIONS },
    ],
    output: 'Number',
    colour: SPIKE_MOTOR,
    tooltip: 'Devuelve el ángulo girado por el motor, en grados.',
  },

  // ── Sound (hub speaker) ────────────────────────────────────────────────────
  {
    type: 'sound_beep',
    message0: '%1 Pitar por %2 segundos',
    args0: [
      blockIcon(ICON_SOUND, 'sonido'),
      { type: 'field_number', name: 'DURATION', value: 0.5, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_SOUND,
    tooltip: 'Emite un pitido durante N segundos.',
  },
  {
    type: 'sound_play_note',
    message0: '%1 Tocar nota %2 por %3 segundos',
    args0: [
      blockIcon(ICON_SOUND, 'sonido'),
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
    tooltip: 'Toca una nota musical durante N segundos.',
  },
  {
    type: 'sound_stop',
    message0: '%1 Parar sonido',
    args0: [blockIcon(ICON_SOUND, 'sonido')],
    previousStatement: null,
    nextStatement: null,
    colour: SPIKE_SOUND,
    tooltip: 'Detiene cualquier sonido que esté sonando.',
  },

  // ── Operators ───────────────────────────────────────────────────────────────
  {
    // Reporter (value block) — random integer between FROM and TO inclusive.
    type: 'operator_random',
    message0: 'número aleatorio entre %1 y %2',
    args0: [
      { type: 'field_number', name: 'FROM', value: 1 },
      { type: 'field_number', name: 'TO',   value: 10 },
    ],
    output: 'Number',
    colour: SPIKE_OP,
    tooltip: 'Devuelve un número entero al azar entre los dos valores (incluidos).',
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
): Blockly.utils.toolbox.ToolboxDefinition {
  type Cat = Blockly.utils.toolbox.ToolboxItemInfo

  const categories: Cat[] = [
    {
      kind: 'category',
      name: 'Eventos',
      colour: SPIKE_EVENT,
      contents: [{ kind: 'block', type: 'event_when_started' }],
    },
    {
      kind: 'category',
      name: 'Movimiento',
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
      name: 'Motores',
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
      name: 'Luz',
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
      name: 'Sonido',
      colour: SPIKE_SOUND,
      contents: [
        { kind: 'block', type: 'sound_beep' },
        { kind: 'block', type: 'sound_play_note' },
        { kind: 'block', type: 'sound_stop' },
      ],
    },
  ]

  if (includeSensor) {
    categories.push({
      kind: 'category',
      name: 'Sensores',
      colour: LEGO_YELLOW,
      contents: [{ kind: 'block', type: 'sensor_distance' }],
    })
  }

  categories.push({
    kind: 'category',
    name: 'Tiempo',
    colour: LEGO_YELLOW,
    contents: [{ kind: 'block', type: 'wait_seconds' }],
  })

  return { kind: 'categoryToolbox', contents: categories }
}

/**
 * Ready-to-use toolbox including the sensor block. Kept for backward
 * compatibility; prefer `buildRobotToolbox(hasSensor)` where the robot's
 * sensor presence is known.
 */
export const ROBOT_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition =
  buildRobotToolbox(true)
