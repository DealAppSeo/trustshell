'use client';
import { useState } from 'react';
import { vault } from '@/lib/vault';
import { AgentPortability } from '@/components/agent-portability';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleWipe = async () => {
    if (!window.confirm("This deletes all your encrypted keys from this browser and can't be undone. Continue?")) return;
    await vault.wipe();
    router.push('/');
  };

  const handleExport = async () => {
    try {
      const blob = await vault.export();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trustshell_vault_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Couldn't export — you don't have a vault yet. Create one in /connect first.");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const passphrase = window.prompt('Enter the passphrase for this vault file:');
    if (!passphrase) return;
    try {
      await vault.import(file, passphrase);
      setMsg('Vault imported. Unlock it in /connect to start using it.');
    } catch (err) {
      setError("Couldn't import — check the passphrase and file, then try again.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Settings</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          Your agents and your model API keys both live in this browser and nowhere else. Back them
          up here, move them to another device, or get an agent back after clearing site data.
          Changes take effect immediately and are always reversible except where noted below.
        </p>
      </div>

      {error && <div className="p-4 bg-red-900/20 border border-red-900 text-red-400 rounded text-sm">{error}</div>}
      {msg && <div className="p-4 bg-green-900/20 border border-green-900 text-green-400 rounded text-sm">{msg}</div>}

      <AgentPortability />

      <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-6">
        <h3 className="text-xl font-bold text-white">Vault management</h3>
        <p className="text-[#94a3b8] text-sm">
          A separate backup, for your <span className="text-white">model provider</span>{' '}
          keys —
          OpenAI, Anthropic and the rest — not your agents. They are encrypted in your browser&apos;s
          IndexedDB using AES-GCM, and exporting downloads the encrypted blob, so you&apos;ll still
          need the passphrase to use it.
        </p>

        <div className="flex flex-wrap gap-4">
          <button onClick={handleExport} className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
            Export encrypted vault
          </button>

          <label className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded cursor-pointer">
            Import vault
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          <button onClick={() => router.push('/connect')} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded">
            Update keys
          </button>
        </div>

        <div className="pt-8 border-t border-[#1e293b] space-y-3">
          <div>
            <h4 className="text-red-500 font-bold">Danger zone</h4>
            <p className="text-xs text-[#64748b] mt-1">
              This deletes your encrypted keys from this browser and can&apos;t be undone. Export a
              backup above first if you might need these keys again.
            </p>
          </div>
          <button onClick={handleWipe} className="px-6 py-2 bg-red-900/50 hover:bg-red-900 text-red-500 font-bold rounded border border-red-900">
            Wipe everything
          </button>
        </div>
      </div>

      <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
        <h3 className="text-xl font-bold text-white">About TrustShell</h3>
        <p className="text-[#94a3b8]">
          TrustShell is the portable agentic trust harness. Under the hood it routes prompts free-tier first (Groq, Cerebras, Gemini Flash) and falls back to paid APIs (OpenAI, Anthropic) using your own keys. Your keys live encrypted in this browser (AES-GCM, IndexedDB); when a paid model runs, the key is sent with that one request — used in memory, never stored, redacted from server logs.
        </p>
        <p className="text-[#94a3b8]">
          Every prompt and answer is scored by the HAL Benchmark, updating your Agent's RepID score to objectively measure trustworthiness over time.
        </p>
        <a href="https://github.com/DealAppSeo/trustshell" target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">
          View source on GitHub
        </a>
      </div>
    </div>
  );
}
