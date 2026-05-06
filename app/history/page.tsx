'use client';
import { useState, useEffect } from 'react';
import { localDb, HistoryRow } from '@/lib/db';

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    localDb.getHistory().then(setHistory);
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
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">Decision History</h2>
        <button onClick={handleExport} className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
          Export to JSON
        </button>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] overflow-hidden">
        {history.length === 0 ? (
          <div className="p-8 text-center text-[#94a3b8]">
            Run your first prompt to see decisions here.
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
