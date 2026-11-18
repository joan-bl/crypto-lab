// La "caja fuerte": las 12 palabras se guardan cifradas en este navegador.
// AES-GCM 256 con una clave derivada de tu contraseña (PBKDF2-SHA256, 600 000 vueltas).
// Nunca salen del navegador. Si olvidas la contraseña, solo te salvan las 12 palabras apuntadas.

import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const KEY = "cryptolab.vault.v1";
const ITER = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const newMnemonic = () => generateMnemonic(wordlist, 128);
export const isValidMnemonic = (m) => validateMnemonic(normalize(m), wordlist);
export const seedFrom = (m) => mnemonicToSeedSync(normalize(m));
export const normalize = (m) => m.trim().toLowerCase().split(/\s+/).join(" ");
export { wordlist };

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password, salt, iterations = ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMnemonic(mnemonic, password, iterations = ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(normalize(mnemonic))));
  return { v: 1, kdf: "PBKDF2-SHA256", iter: iterations, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function decryptMnemonic(box, password) {
  const key = await keyFrom(password, unb64(box.salt), box.iter);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
    return dec.decode(pt);
  } catch {
    throw new Error("Contraseña incorrecta.");
  }
}

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadBox() {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBox(box) {
  storage()?.setItem(KEY, JSON.stringify(box));
}

export function deleteBox() {
  storage()?.removeItem(KEY);
}
