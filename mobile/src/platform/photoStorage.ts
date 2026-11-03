import { copyAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';

/** Picker/camera files live in a cache the OS may purge; copy to durable app storage so queued photos survive. */
export async function persistPhoto(uri: string, mime: string): Promise<string> {
  const dir = `${documentDirectory}photos/`;
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const to = `${dir}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  await copyAsync({ from: uri, to });
  return to;
}
