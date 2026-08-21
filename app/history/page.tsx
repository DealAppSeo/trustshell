'use client';
import { useState, useEffect } from 'react';
import { localDb, HistoryRow } from '@/lib/db';

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localDb.getHistory().then((h) => {
      setHistory(h);
      setLoaded(true);
    });
  }, []);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trustshell_history_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white">Decision history</h2>
          <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
            Your audit trail: every prompt you run is logged here with the model that answered, the HAL verdict,
            and the resulting <span className="text-white font-medium">RepID</span> change. This table is stored in
            this browser&apos;s IndexedDB and nowhere else — no server-side copy, unencrypted, erased if you clear
            site data. Export it any time.
          </p>
          <p className="text-[#94a3b8] max-w-2xl leading-relaxed text-sm">
            To be exact about what that does <em>not</em> mean: running a prompt sends it to our router and on to
            the model provider that answers it, and scoring happens on our server. We retain a 200-character prompt
            preview for routing quality — never the full prompt or answer. The privacy property here is
            &ldquo;your history is yours&rdquo;, not &ldquo;nothing left your machine&rdquo;.
          </p>
        </div>
        <button onClick={handleExport} className="shrink-0 px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
          Export to JSON
        </button>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] overflow-hidden">
        {!loaded ? (
          <div className="p-8 text-center text-[#94a3b8]">
            Loading your history…
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-[#94a3b8]">
            No runs yet — run a prompt to see decisions appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1e293b] text-[#94a3b8] text-sm">
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">Agent ID</th>
                  <th className="p-4 font-medium">Provider</th>
                  <th className="p-4 font-medium">Tier</th>
                  <th className="p-4 font-medium">Prompt Snippet</th>
                  <th className="p-4 font-medium">RepID Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-[#1e293b]/50 text-white text-sm">
                    <td className="p-4 whitespace-nowrap">{new Date(h.timestamp).toLocaleString()}</td>
                    <td className="p-4 font-mono text-xs text-[#94a3b8]">{h.agentId.substring(0, 8)}...</td>
                    <td className="p-4 capitalize">{h.provider}</td>
                    <td className="p-4">{h.tier}</td>
                    <td className="p-4 truncate max-w-[200px]">{h.prompt}</td>
                    <td className="p-4">
                      <span className={h.repidDelta >= 0 ? "text-green-500" : "text-red-500"}>
                        {h.repidDelta > 0 ? '+' : ''}{h.repidDelta.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
