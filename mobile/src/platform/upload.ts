import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { ApiError } from '../core/errors';

/** Native binary upload: streams the file itself (a fetch() with an RN Blob body does not send the bytes). */
export async function uploadFile(url: string, uri: string, headers: Record<string, string>) {
  let res;
  try {
    res = await uploadAsync(url, uri, { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers });
  } catch (e) {
    throw new TypeError(`Network request failed: ${(e as Error).message}`);
  }
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, `photo upload HTTP ${res.status}`);
}
