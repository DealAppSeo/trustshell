'use client';
import { useState, useEffect } from 'react';
import { vault, ProviderKeys } from '@/lib/vault';
import { useRouter } from 'next/navigation';

export default function ConnectPage() {
  const router = useRouter();
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [keys, setKeys] = useState<ProviderKeys>({});
  const [testing, setTesting] = useState<Record<string, string>>({});

  useEffect(() => {
    vault.exists().then(setHasVault);
    const curr = vault.getKeys();
    if (curr) {
      setUnlocked(true);
      setKeys(curr);
    }
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase !== confirmPass) return setError('Passphrases do not match');
    if (passphrase.length < 8) return setError('Passphrase must be at least 8 characters');
    await vault.create(passphrase, {});
    setHasVault(true);
    setUnlocked(true);
    setError('');
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const k = await vault.unlock(passphrase);
      setUnlocked(true);
      setKeys(k);
      setError('');
    } catch (e) {
      setError('Passphrase incorrect. There is no recovery — if you\'ve forgotten it, you can wipe and start fresh from /settings.');
    }
  };

  const saveKeys = async () => {
    await vault.update(passphrase, keys);
    router.push('/agents');
  };

  const testKey = async (provider: string) => {
    setTesting(prev => ({ ...prev, [provider]: '⏳ testing' }));
    try {
      const API_URL = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
      const res = await fetch(`${API_URL}/api/v1/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Hi',
          tier_preference: 'tier1_only',
          user_paid_keys: { [provider]: (keys as any)[provider] }
        })
      });
      if (res.ok) {
        setTesting(prev => ({ ...prev, [provider]: '✓ valid' }));
      } else {
        const errData = await res.json().catch(()=>({}));
        setTesting(prev => ({ ...prev, [provider]: `✗ invalid (${res.status})` }));
        if (res.status === 401) {
          setError(`${provider} rejected the key (401). Check the key in your dashboard.`);
        }
      }
    } catch (e) {
      setTesting(prev => ({ ...prev, [provider]: '✗ error' }));
      setError('Backend unavailable. Try again in a moment.');
    }
  };

  if (hasVault === null) return null;

  if (!hasVault) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-[#0f172a] rounded-xl border border-[#1e293b]">
        <h2 className="text-2xl font-bold mb-4">Create your Vault</h2>
        <p className="text-[#94a3b8] mb-6 text-sm">There is no recovery. If you forget this passphrase, you wipe and start fresh.</p>
        <form onSubmit={handleCreate} className="space-y-4">
          <input type="password" required placeholder="Passphrase" value={passphrase} onChange={e=>setPassphrase(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
          <input type="password" required placeholder="Confirm Passphrase" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <label className="flex items-center gap-2 text-sm text-[#94a3b8]">
            <input type="checkbox" required /> I understand there is no recovery
          </label>
          <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded">Create Vault</button>
        </form>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-[#0f172a] rounded-xl border border-[#1e293b]">
        <h2 className="text-2xl font-bold mb-6">Unlock Vault</h2>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input type="password" required placeholder="Passphrase" value={passphrase} onChange={e=>setPassphrase(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded">Unlock</button>
        </form>
      </div>
    );
  }

  const providers = ['openai', 'anthropic', 'groq', 'gemini', 'cerebras', 'deepseek', 'cohere'];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold">Your API Keys</h2>
      <p className="text-[#94a3b8]">Connect at least one LLM provider to start. Free tier works without any keys.</p>
      {error && <p className="text-red-500 text-sm bg-red-900/20 p-3 rounded border border-red-900">{error}</p>}
      
      <div className="space-y-4">
        {providers.map(p => (
          <div key={p} className="flex gap-4 items-center bg-[#0f172a] p-4 rounded-xl border border-[#1e293b]">
            <div className="w-24 font-bold capitalize text-white">{p}</div>
            <input 
              type="password" 
              placeholder={`${p} key`}
              value={(keys as any)[p] || ''}
              onChange={e => setKeys({...keys, [p]: e.target.value})}
              className="flex-1 bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white"
            />
            <button onClick={() => testKey(p)} className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] rounded font-medium text-sm text-white">Test</button>
            <div className="w-24 text-sm text-center text-[#94a3b8]">{testing[p]}</div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-[#1e293b] flex justify-end">
        <button onClick={saveKeys} className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded">Save and continue</button>
      </div>
    </div>
  );
}
