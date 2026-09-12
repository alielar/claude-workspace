"use client";

/**
 * Vault cryptography · runs ONLY in the browser (2026-09-12).
 *
 * The server never sees the passphrase, the key or any plaintext. What it stores:
 *   - per user: a random salt, the PBKDF2 iteration count and a "verifier"
 *     (the constant VERIFIER encrypted with the vault key · lets the phone tell a wrong
 *     passphrase from a right one without the server knowing the passphrase);
 *   - per item: one opaque blob = base64( 12-byte IV ‖ AES-256-GCM ciphertext ).
 *
 * Key = PBKDF2-SHA-256(passphrase, salt, 600 000 rounds) → AES-256-GCM. 600k is the
 * OWASP 2023 figure for PBKDF2-SHA-256 · about a second on an iPhone, once per unlock.
 * Argon2 would be nicer but is not in WebCrypto and the app takes no crypto dependency.
 *
 * The derived CryptoKey is non-extractable and lives in a JS variable in the vault page
 * only · never in localStorage, never in the service-worker cache. Lock = drop it.
 */

export const KDF_ITERATIONS = 600_000;
export const VERIFIER = "ali-vault-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
}

export async function deriveKey(passphrase: string, saltB64: string, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return toB64(out);
}

/** Throws on a wrong key or a tampered blob (GCM authenticates). */
export async function decryptJson<T>(key: CryptoKey, blob: string): Promise<T> {
  const bytes = fromB64(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  return JSON.parse(dec.decode(pt)) as T;
}

/** A strong, typeable password: letters, digits and a few symbols, no look-alikes. */
export function generatePassword(length = 20): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_.!?#";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    const b = bytes[i];
    if (b < 256 - (256 % alphabet.length)) out += alphabet[b % alphabet.length]; // rejection sampling · no modulo bias
  }
  return out.length === length ? out : generatePassword(length);
}

/** Rough strength for the setup screen · 0 weak … 4 strong. Length matters most. */
export function passphraseStrength(p: string): number {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) || /[^\w\s]/.test(p)) score++;
  if (/\s/.test(p) && p.length >= 20) score = Math.max(score, 3); // a spaced sentence is a fine passphrase
  return Math.min(4, score);
}
