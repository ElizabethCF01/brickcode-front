import * as Blockly from 'blockly'

// LEGO brand colours used across all robot blocks.
const LEGO_RED    = '#DA291C'
const LEGO_YELLOW = '#FFD700'
const LEGO_BLUE   = '#006CB7'

// ---------------------------------------------------------------------------
// Block JSON definitions
// ---------------------------------------------------------------------------

// Defined inline via defineBlocksWithJsonArray — typed as any[] matches the
// Blockly JSON array API (BlockDefinition union is complex; JSON is fine here).
const blockJsonArray: object[] = [
  {
    type: 'robot_drive_forward',
    message0: 'Mover adelante %1 por %2 segundos',
    args0: [
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
    message0: 'Mover atrás %1 por %2 segundos',
    args0: [
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
    message0: 'Girar %1 %2 grados',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['izquierda ◀', 'LEFT'],
          ['derecha ▶',  'RIGHT'],
        ],
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
    message0: 'Parar motores',
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
    message0: 'Esperar %1 segundos',
    args0: [
      { type: 'field_number', name: 'SECONDS', value: 1, min: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: LEGO_YELLOW,
    tooltip: 'Pausa el programa durante N segundos.',
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

/** Blockly JSON toolbox config for the "Mi Robot 🤖" category. */
export const ROBOT_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Mi Robot',
      colour: LEGO_RED,
      contents: [
        { kind: 'label', text: 'Movimiento' },
        { kind: 'block', type: 'robot_drive_forward' },
        { kind: 'block', type: 'robot_drive_backward' },
        { kind: 'block', type: 'robot_turn' },
        { kind: 'block', type: 'robot_stop' },
        { kind: 'label', text: 'Sensores' },
        { kind: 'block', type: 'sensor_distance' },
        { kind: 'label', text: 'Tiempo' },
        { kind: 'block', type: 'wait_seconds' },
      ],
    },
  ],
}
