/**
 * T3.5: AES-128-CBC decryption using WebCrypto.
 * IV from playlist or computed from media sequence number.
 */

import { fetchBuffer } from '../net/fetch-retry';

// Cache imported keys by URI to avoid re-importing
const keyCache = new Map<string, CryptoKey>();

/**
 * Decrypt a segment encrypted with AES-128-CBC.
 * @param data - Encrypted segment data
 * @param keyUri - URI of the key (used for caching)
 * @param keyData - Raw 16-byte key
 * @param iv - 16-byte IV, or computed from mediaSequence if not provided
 * @param mediaSequence - Segment's media sequence number (for IV fallback)
 */
export async function decryptAes128(
  data: ArrayBuffer,
  keyUri: string,
  keyData: ArrayBuffer,
  iv?: Uint8Array,
  mediaSequence?: number,
): Promise<ArrayBuffer> {
  const cryptoKey = await getOrImportKey(keyUri, keyData);
  const actualIv = iv ?? sequenceToIv(mediaSequence ?? 0);

  return crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: actualIv.buffer as ArrayBuffer },
    cryptoKey,
    data,
  );
}

/**
 * Fetch and cache a key from a URI. Returns raw key bytes.
 */
export async function fetchKey(
  keyUri: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  try {
    return await fetchBuffer(keyUri, {
      signal,
      credentials: 'include',
    });
  } catch (err) {
    throw new Error(`Failed to fetch key from ${keyUri}: ${(err as Error).message}`);
  }
}

// --- Internal ---

async function getOrImportKey(
  keyUri: string,
  keyData: ArrayBuffer,
): Promise<CryptoKey> {
  const cached = keyCache.get(keyUri);
  if (cached) return cached;

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  keyCache.set(keyUri, key);
  return key;
}

/**
 * Convert a media sequence number to a 16-byte IV (big-endian).
 * Per HLS spec, default IV = media sequence number as 128-bit big-endian.
 */
function sequenceToIv(seq: number): Uint8Array {
  const iv = new Uint8Array(16);
  // Write as big-endian 32-bit at the end (sequence numbers fit in 32 bits)
  const view = new DataView(iv.buffer);
  view.setUint32(12, seq, false); // big-endian
  return iv;
}

/** Clear key cache (for testing or cleanup) */
export function clearKeyCache(): void {
  keyCache.clear();
}
