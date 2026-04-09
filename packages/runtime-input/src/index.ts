export interface NormalizedGamepadState {
  connected: boolean
  left_stick_x: number
  left_stick_y: number
  right_stick_x: number
  right_stick_y: number
  dpad_up: boolean
  dpad_down: boolean
  dpad_left: boolean
  dpad_right: boolean
  south: boolean
  east: boolean
  west: boolean
  north: boolean
  left_bumper: boolean
  right_bumper: boolean
  left_trigger: number
  right_trigger: number
  start: boolean
  select: boolean
}

export interface GamepadNavigatorLike {
  getGamepads?: () => ArrayLike<Gamepad | null> | null
}

const DEFAULT_GAMEPAD_STATE: NormalizedGamepadState = {
  connected: false,
  left_stick_x: 0,
  left_stick_y: 0,
  right_stick_x: 0,
  right_stick_y: 0,
  dpad_up: false,
  dpad_down: false,
  dpad_left: false,
  dpad_right: false,
  south: false,
  east: false,
  west: false,
  north: false,
  left_bumper: false,
  right_bumper: false,
  left_trigger: 0,
  right_trigger: 0,
  start: false,
  select: false,
}

export function sampleNormalizedGamepad(options: {
  navigatorLike?: GamepadNavigatorLike | null
  stickDeadZone?: number
  triggerDeadZone?: number
} = {}): NormalizedGamepadState {
  const navigatorLike =
    options.navigatorLike ?? (typeof navigator !== "undefined" ? (navigator as GamepadNavigatorLike) : null)
  const gamepads = navigatorLike?.getGamepads?.()
  if (!gamepads) {
    return { ...DEFAULT_GAMEPAD_STATE }
  }

  const primaryPad = [...Array.from(gamepads)].find((pad): pad is Gamepad => Boolean(pad && pad.connected))
  if (!primaryPad) {
    return { ...DEFAULT_GAMEPAD_STATE }
  }

  const stickDeadZone = options.stickDeadZone ?? 0.22
  const triggerDeadZone = options.triggerDeadZone ?? 0.12
  const buttons = primaryPad.buttons ?? []

  return {
    connected: true,
    left_stick_x: applyDeadZone(primaryPad.axes?.[0] ?? 0, stickDeadZone),
    left_stick_y: applyDeadZone(primaryPad.axes?.[1] ?? 0, stickDeadZone),
    right_stick_x: applyDeadZone(primaryPad.axes?.[2] ?? 0, stickDeadZone),
    right_stick_y: applyDeadZone(primaryPad.axes?.[3] ?? 0, stickDeadZone),
    dpad_up: isPressed(buttons[12]),
    dpad_down: isPressed(buttons[13]),
    dpad_left: isPressed(buttons[14]),
    dpad_right: isPressed(buttons[15]),
    south: isPressed(buttons[0]),
    east: isPressed(buttons[1]),
    west: isPressed(buttons[2]),
    north: isPressed(buttons[3]),
    left_bumper: isPressed(buttons[4]),
    right_bumper: isPressed(buttons[5]),
    left_trigger: normalizeTrigger(buttons[6], triggerDeadZone),
    right_trigger: normalizeTrigger(buttons[7], triggerDeadZone),
    start: isPressed(buttons[9]),
    select: isPressed(buttons[8]),
  }
}

function applyDeadZone(value: number, deadZone: number) {
  if (Math.abs(value) <= deadZone) return 0
  const direction = Math.sign(value)
  return direction * ((Math.abs(value) - deadZone) / (1 - deadZone))
}

function normalizeTrigger(button: GamepadButton | undefined, deadZone: number) {
  const value = button?.value ?? 0
  if (value <= deadZone) return 0
  return (value - deadZone) / (1 - deadZone)
}

function isPressed(button: GamepadButton | undefined) {
  return Boolean(button?.pressed || (button?.value ?? 0) >= 0.5)
}
