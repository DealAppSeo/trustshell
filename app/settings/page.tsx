'use client';
import { useState } from 'react';
import { vault } from '@/lib/vault';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleWipe = async () => {
    if (!window.confirm('Are you absolutely sure? This will delete all your encrypted keys from this browser.')) return;
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
      setError('Failed to export. Have you created a vault?');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const passphrase = window.prompt('Enter the passphrase for this vault file:');
    if (!passphrase) return;
    try {
      await vault.import(file, passphrase);
      setMsg('Vault imported successfully. Please unlock it in /connect.');
    } catch (err) {
      setError('Failed to import. Wrong passphrase or invalid file.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12">
      <h2 className="text-3xl font-bold text-white">Settings</h2>

      {error && <div className="p-4 bg-red-900/20 border border-red-900 text-red-500 rounded">{error}</div>}
      {msg && <div className="p-4 bg-green-900/20 border border-green-900 text-green-400 rounded">{msg}</div>}

      <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-6">
        <h3 className="text-xl font-bold text-white">Vault Management</h3>
        <p className="text-[#94a3b8] text-sm">
          Your keys are securely encrypted in your browser's IndexedDB using AES-GCM. 
          Exporting downloads the encrypted blob (you still need the passphrase to use it).
        </p>

        <div className="flex flex-wrap gap-4">
          <button onClick={handleExport} className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
            Export Encrypted Vault
          </button>
          
          <label className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded cursor-pointer">
            Import Vault
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          <button onClick={() => router.push('/connect')} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded">
            Update Keys
          </button>
        </div>

        <div className="pt-8 border-t border-[#1e293b]">
          <h4 className="text-red-500 font-bold mb-4">Danger Zone</h4>
          <button onClick={handleWipe} className="px-6 py-2 bg-red-900/50 hover:bg-red-900 text-red-500 font-bold rounded border border-red-900">
            Wipe Everything
          </button>
        </div>
      </div>

      <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
        <h3 className="text-xl font-bold text-white">About TrustShell</h3>
        <p className="text-[#94a3b8]">
          TrustShell is an open-source router that prioritizes free-tier LLM inferences (Groq, Cerebras, Gemini Flash) and falls back to paid APIs (OpenAI, Anthropic) using your own keys. Your paid keys never leave your browser unencrypted—they are sent in memory per-request and redacted from server logs.
        </p>
        <p className="text-[#94a3b8]">
          Every prompt and answer is scored by the HAL Benchmark, updating your Agent's RepID score to objectively measure trustworthiness over time.
        </p>
        <a href="https://github.com/DealAppSeo/trustshell-app" target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">
          View source on GitHub
        </a>
      </div>
    </div>
  );
}
