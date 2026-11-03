import { getItemAsync, setItemAsync } from 'expo-secure-store';

export interface Settings {
  url: string;
  user: string;
  token: string;
}

const KEY = 'fieldsync.settings';

export async function loadSettings(defaults: Settings): Promise<Settings> {
  try {
    const raw = await getItemAsync(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export async function saveSettings(s: Settings) {
  await setItemAsync(KEY, JSON.stringify(s));
}
