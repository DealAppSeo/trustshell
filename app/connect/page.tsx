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
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        {/* Context BEFORE the warning: what a Vault is, why it exists, and reassurance. */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold">Create your Vault</h2>
          <p className="text-[#94a3b8] max-w-xl leading-relaxed">
            A <span className="text-white font-medium">Vault</span> is an encrypted, browser-only store for the
            model API keys you&apos;ll connect next. It&apos;s locked with a passphrase only you know, and it&apos;s{' '}
            <span className="text-white font-medium">stored on your device — never on our servers</span>. Free-tier
            prompts send no keys at all; when you run a paid model, your key rides along with that one request so
            the engine can call the provider on your behalf — used in memory, never stored, redacted from logs.
          </p>

          <ProgressStrip />

          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-2">
            <p className="text-sm text-[#e2e8f0] font-medium">You&apos;re not losing anything yet.</p>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              Nothing valuable is stored here yet — this step just sets the passphrase that will protect the keys
              you add on the next screen. You can export and back up your Vault at any time from{' '}
              <span className="text-[#94a3b8] underline decoration-dotted">Settings</span>.
            </p>
          </div>
        </div>

        <div className="max-w-md p-6 bg-[#0f172a] rounded-xl border border-[#1e293b]">
          <h3 className="text-lg font-bold mb-1">Set your passphrase</h3>
          <p className="text-[#94a3b8] mb-4 text-sm leading-relaxed">
            <span className="text-amber-500 font-medium">Choose it carefully — there is no recovery.</span> Because
            the Vault is encrypted on your device only, no one (not even us) can reset this passphrase. If you
            forget it, you simply wipe and start fresh. That&apos;s the security guarantee: only you can ever unlock
            your keys.
          </p>
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
      <div className="space-y-2">
        <p className="text-xs font-mono text-amber-400">STEP 2 OF 4 · CONNECT A MODEL</p>
        <h2 className="text-3xl font-bold">Your API Keys</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          Each key you add is encrypted straight into your Vault — stored only in this browser, never sent to a
          server. Connect at least one LLM provider to run your own models, or skip it: the free tier works
          without any keys. Next up: <span className="text-white font-medium">Run</span> a prompt.
        </p>
      </div>
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

// The Create→Connect→Run→Earn journey strip, matching the treatment on /agents.
// `current` highlights where the user is right now (Connect = step 2).
function ProgressStrip({ current = 2 }: { current?: number }) {
  const steps = [
    { n: 1, t: 'Create an agent', d: 'Name a TrustShell-wrapped identity.' },
    { n: 2, t: 'Connect a model', d: 'Add your keys to this Vault. You are here.' },
    { n: 3, t: 'Run prompts', d: 'HAL scores every response in real time.' },
    { n: 4, t: 'Earn RepID', d: 'Honest agents climb the leaderboard.' },
  ];
  return (
    <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
      {steps.map((s) => {
        const here = s.n === current;
        return (
          <li
            key={s.n}
            className={`p-4 rounded-xl border ${here ? 'border-amber-600/50 bg-amber-600/10' : 'border-[#1e293b] bg-[#0f172a]'}`}
          >
            <div className={`text-xs font-mono ${here ? 'text-amber-400' : 'text-[#475569]'}`}>STEP {s.n}</div>
            <div className="font-semibold text-white mt-1">{s.t}</div>
            <div className="text-xs text-[#94a3b8] mt-1 leading-snug">{s.d}</div>
          </li>
        );
      })}
    </ol>
  );
}
