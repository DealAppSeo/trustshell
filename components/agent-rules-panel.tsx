'use client';
import { useState } from 'react';
import { appendCorrection, checkRules, countRuleLines, MAX_CORRECTION_CHARS, MAX_RULES_CHARS } from '@/lib/agent-rules';

/**
 * The agent's rules, editable by its owner, sent with every question on /run.
 * Says "sent", never "enforced": nothing checks an answer against them.
 */
export function RulesPanel({ rules, onSave }: { rules: string | undefined; onSave: (rules: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rules ?? '');
  const [error, setError] = useState('');
  const n = countRuleLines(rules);

  const save = async () => {
    const checked = checkRules(draft);
    if (!checked.ok) return setError(checked.reason);
    setError('');
    await onSave(checked.rules);
    setEditing(false);
  };

  return (
    <section aria-labelledby="rules-h" className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 id="rules-h" className="text-lg font-bold text-white">Its rules</h3>
          <p className="text-xs text-[#94a3b8] mt-1">
            {n === 0
              ? 'No rules yet. Add some, and they are sent with every question you ask it.'
              : `${n} ${n === 1 ? 'line' : 'lines'}, sent with every question you ask it. Nothing checks the answer against them yet.`}
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => { setDraft(rules ?? ''); setEditing(true); }} className="shrink-0 text-sm text-amber-500 hover:underline">
            {n === 0 ? 'Add rules' : 'Edit'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <label htmlFor="rules-edit" className="sr-only">Rules</label>
          <textarea
            id="rules-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_RULES_CHARS}
            placeholder="e.g. Always cite a source. Never give financial advice. Say when you are not sure."
            className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 h-40 text-white text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[#64748b]">{draft.length} / {MAX_RULES_CHARS}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-white">Cancel</button>
              <button type="button" onClick={save} className="px-4 py-1.5 text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white rounded">Save rules</button>
            </span>
          </div>
          {error && <p role="alert" className="text-sm text-[#ff6b6b]">{error}</p>}
        </div>
      ) : (
        n > 0 && <pre className="whitespace-pre-wrap text-sm text-[#cbd5e1] bg-[#0a0f1a] p-3 rounded max-h-48 overflow-y-auto">{rules}</pre>
      )}
    </section>
  );
}

/**
 * "Teach it" under one answer: the owner writes what to do differently, and it is added to the
 * rules as a dated correction the agent gets from the next question on.
 */
export function TeachIt({ rules, onSave }: { rules: string | undefined; onSave: (rules: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const next = appendCorrection(rules, text);
    if (!next.ok) return setError(next.reason);
    setError('');
    await onSave(next.rules);
    setSaved(true);
    setOpen(false);
    setText('');
  };

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => { setOpen(true); setSaved(false); }} className="text-sm text-amber-500 hover:underline">
          Teach it
        </button>
        {saved && <span className="text-xs text-green-400" role="status">Added to its rules. It gets this from the next question.</span>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm text-white">
        What should it do differently next time?
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CORRECTION_CHARS}
          placeholder="e.g. Give the source for every number."
          className="mt-1 w-full bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={save} className="px-4 py-1.5 text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white rounded">Add to its rules</button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-white">Cancel</button>
      </div>
      {error && <p role="alert" className="text-sm text-[#ff6b6b]">{error}</p>}
    </div>
  );
}
