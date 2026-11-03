import { useColorScheme } from 'react-native';

const light = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  surfaceAlt: '#eef0f3',
  border: '#dfe2e7',
  text: '#14181f',
  muted: '#5f6b7a',
  primary: '#059669',
  onPrimary: '#ffffff',
  success: '#16803c',
  successBg: '#e3f5ea',
  warning: '#a15c07',
  warningBg: '#fdf0d8',
  danger: '#c62828',
  dangerBg: '#fde7e7',
  neutralBg: '#e4e7ec',
  overlay: 'rgba(15,23,42,0.5)',
};

const dark: typeof light = {
  bg: '#0d1117',
  surface: '#131a23',
  surfaceAlt: '#212733',
  border: '#2b3341',
  text: '#eef1f5',
  muted: '#9aa6b6',
  primary: '#10b981',
  onPrimary: '#04130d',
  success: '#5ed38a',
  successBg: '#12301e',
  warning: '#f0b958',
  warningBg: '#35280e',
  danger: '#ff8a80',
  dangerBg: '#3a1616',
  neutralBg: '#2a313d',
  overlay: 'rgba(0,0,0,0.65)',
};

export type Theme = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
