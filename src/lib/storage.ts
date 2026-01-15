import { openDB } from 'idb';
import type { Message } from './types';

const DB_NAME = 'regis-matrix-db';
const STORE_NAME = 'chat-backups';
const KEY_STORAGE = 'regis-matrix-aes-key';
const MAX_BACKUPS = 10;

function logCrypto(action: string) {
  console.info(`[crypto] ${action}`);
}

async function getKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  localStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...raw)));
  logCrypto('Generated new AES-256 key');
  return key;
}

async function encryptPayload(payload: string): Promise<{ iv: string; data: string }> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(payload);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  logCrypto('Encrypted payload');
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  };
}

async function decryptPayload(payload: { iv: string; data: string }): Promise<string> {
  const key = await getKey();
  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  logCrypto('Decrypted payload');
  return new TextDecoder().decode(decrypted);
}

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function saveBackup(messages: Message[]): Promise<void> {
  const db = await getDb();
  const payload = JSON.stringify({ messages, createdAt: new Date().toISOString() });
  const encrypted = await encryptPayload(payload);

  const id = Date.now();
  await db.put(STORE_NAME, { id, ...encrypted });

  const keys = await db.getAllKeys(STORE_NAME);
  const excess = keys.length - MAX_BACKUPS;
  if (excess > 0) {
    const sorted = keys.sort();
    await Promise.all(sorted.slice(0, excess).map((key) => db.delete(STORE_NAME, key)));
  }
}

export async function loadLatestBackup(): Promise<Message[] | null> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE_NAME);
  if (keys.length === 0) return null;
  const sortedKeys = keys.sort();
  const latestKey = sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : undefined;
  if (latestKey === undefined) return null;
  const record = await db.get(STORE_NAME, latestKey);
  if (!record) return null;
  const decrypted = await decryptPayload({ iv: record.iv, data: record.data });
  const parsed = JSON.parse(decrypted) as { messages: Message[] };
  return parsed.messages.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
  }));
}
