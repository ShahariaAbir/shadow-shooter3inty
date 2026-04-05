export interface GameSettings {
  username: string;
  joystickSize: number; // 80-140
  abilityButtonSize: number;
  gameFieldScale: number;
  swapJoysticks: boolean;
  aimAssist: boolean;
  moveJoystickOffsetX: number;
  moveJoystickOffsetY: number;
  aimJoystickOffsetX: number;
  aimJoystickOffsetY: number;
  leftButtonsOffsetX: number;
  leftButtonsOffsetY: number;
  rightButtonsOffsetX: number;
  rightButtonsOffsetY: number;
  moveControlX: number | null;
  moveControlY: number | null;
  aimControlX: number | null;
  aimControlY: number | null;
  leftButtonsX: number | null;
  leftButtonsY: number | null;
  rightButtonsX: number | null;
  rightButtonsY: number | null;
}

const STORAGE_KEY = 'shadow-shooter-settings';

const DEFAULT_SETTINGS: GameSettings = {
  username: '',
  joystickSize: 100,
  abilityButtonSize: 36,
  gameFieldScale: 100,
  swapJoysticks: false,
  aimAssist: true,
  moveJoystickOffsetX: 0,
  moveJoystickOffsetY: 0,
  aimJoystickOffsetX: 0,
  aimJoystickOffsetY: 0,
  leftButtonsOffsetX: 0,
  leftButtonsOffsetY: 0,
  rightButtonsOffsetX: 0,
  rightButtonsOffsetY: 0,
  moveControlX: null,
  moveControlY: null,
  aimControlX: null,
  aimControlY: null,
  leftButtonsX: null,
  leftButtonsY: null,
  rightButtonsX: null,
  rightButtonsY: null,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GameSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
