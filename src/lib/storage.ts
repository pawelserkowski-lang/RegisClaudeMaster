import { openDB, type IDBPDatabase } from 'idb';
import type { Message } from './types';

const DB_NAME = 'regis-matrix-db';
const STORE_NAME = 'chat-backups';
const KEY_STORE_NAME = 'crypto-keys';
const MAX_BACKUPS = 10;

function logCrypto(action: string) {
  if (import.meta.env.DEV) {
    console.info(`[crypto] ${action}`);
  }
}

// Cache key in memory (non-extractable after generation)
let cachedKey: CryptoKey | null = null;

async function getKeyDb() {
  return openDB(DB_NAME, 2, {
    upgrade(db: IDBPDatabase, oldVersion: number) {
      if (oldVersion < 1 && !db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

async function getKey(): Promise<CryptoKey> {
  // Return cached key if available (fastest path)
  if (cachedKey) {
    return cachedKey;
  }

  const db = await getKeyDb();

  // Try to load existing key from IndexedDB (non-extractable)
  const stored = await db.get(KEY_STORE_NAME, 'master') as { key: CryptoKey } | undefined;
  if (stored?.key) {
    cachedKey = stored.key;
    logCrypto('Loaded existing AES-256 key from IndexedDB');
    return cachedKey as CryptoKey;
  }

  // Generate new non-extractable key (cannot be exported/stolen via XSS)
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // NON-EXTRACTABLE - key cannot be exported
    ['encrypt', 'decrypt']
  );

  // Store in IndexedDB (secure, not accessible via simple XSS)
  await db.put(KEY_STORE_NAME, { id: 'master', key });
  cachedKey = key;
  logCrypto('Generated new non-extractable AES-256 key');
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
  return getKeyDb();
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

/**
 * Migrate from old localStorage key storage to secure IndexedDB
 * Call this on app initialization to clean up legacy data
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const OLD_KEY_STORAGE = 'regis-matrix-aes-key';
  const oldKey = localStorage.getItem(OLD_KEY_STORAGE);

  if (oldKey) {
    // Remove insecure localStorage key
    localStorage.removeItem(OLD_KEY_STORAGE);
    logCrypto('Migrated: removed old localStorage key (new secure key will be generated)');

    // Note: Old backups encrypted with the old key will be lost
    // This is acceptable for security - new backups will use the secure key
  }
}

/**
 * Initialize storage system (call on app start)
 */
export async function initializeStorage(): Promise<void> {
  await migrateFromLocalStorage();
  await getKey(); // Pre-warm key cache
}
