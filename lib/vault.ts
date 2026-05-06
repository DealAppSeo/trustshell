import { get, set, del } from 'idb-keyval';

export type ProviderKeys = {
  openai?: string;
  anthropic?: string;
  groq?: string;
  gemini?: string;
  cerebras?: string;
  deepseek?: string;
  cohere?: string;
};

export class WrongPassphrase extends Error {
  constructor() {
    super('Wrong passphrase');
    this.name = 'WrongPassphrase';
  }
}

const VAULT_KEY = 'trustshell_vault_v1';
let unlockedKeys: ProviderKeys | null = null;
let lockTimer: any = null;

async function getCryptoKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export const vault = {
  async exists(): Promise<boolean> {
    const data = await get(VAULT_KEY);
    return !!data;
  },

  async create(passphrase: string, keys: ProviderKeys): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getCryptoKey(passphrase, salt);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(keys))
    );

    await set(VAULT_KEY, {
      salt: Array.from(salt),
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    });

    unlockedKeys = keys;
    this._resetTimer();
  },

  async unlock(passphrase: string): Promise<ProviderKeys> {
    const data = await get(VAULT_KEY);
    if (!data) throw new Error('Vault does not exist');

    const salt = new Uint8Array(data.salt);
    const iv = new Uint8Array(data.iv);
    const ciphertext = new Uint8Array(data.ciphertext);
    const key = await getCryptoKey(passphrase, salt);

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      unlockedKeys = JSON.parse(new TextDecoder().decode(plaintext));
      this._resetTimer();
      return unlockedKeys!;
    } catch (e) {
      throw new WrongPassphrase();
    }
  },

  async update(passphrase: string, partialKeys: Partial<ProviderKeys>): Promise<void> {
    const current = await this.unlock(passphrase);
    const merged = { ...current, ...partialKeys };
    await this.create(passphrase, merged);
  },

  lock(): void {
    unlockedKeys = null;
    if (lockTimer) clearTimeout(lockTimer);
  },

  getKeys(): ProviderKeys | null {
    this._resetTimer();
    return unlockedKeys;
  },

  async export(): Promise<Blob> {
    const data = await get(VAULT_KEY);
    if (!data) throw new Error('No vault to export');
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  },

  async import(blob: Blob, passphrase: string): Promise<void> {
    const text = await blob.text();
    const data = JSON.parse(text);
    if (!data.salt || !data.iv || !data.ciphertext) throw new Error('Invalid vault file');
    
    const salt = new Uint8Array(data.salt);
    const iv = new Uint8Array(data.iv);
    const ciphertext = new Uint8Array(data.ciphertext);
    const key = await getCryptoKey(passphrase, salt);

    try {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      JSON.parse(new TextDecoder().decode(plaintext));
    } catch (e) {
      throw new WrongPassphrase();
    }

    await set(VAULT_KEY, data);
    this.lock();
  },

  async wipe(): Promise<void> {
    await del(VAULT_KEY);
    this.lock();
  },

  _resetTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    if (unlockedKeys) {
      lockTimer = setTimeout(() => this.lock(), 30 * 60 * 1000);
    }
  }
};
