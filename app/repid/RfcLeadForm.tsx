'use client';

import { useState } from 'react';
import { Send, Check, AlertCircle } from 'lucide-react';
import { submitLead } from '@/app/actions/leads';

export default function RfcLeadForm() {
  const [email, setEmail] = useState('');
  const [github, setGithub] = useState('');
  const [role, setRole] = useState('Developer');
  const [interest, setInterest] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await submitLead({
        email,
        github,
        role,
        preferred_ecosystem: 'Base',
        interest,
        source: 'repid-rfc'
      });

      if (res.success) {
        setSubmitted(true);
      } else {
        setError(res.error || 'Failed to submit profile. Please try again.');
      }
    } catch (err: any) {
      setError('A connection error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl max-w-xl mx-auto">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-bold text-white">Join the RepID Design Task Force</h3>
        <p className="text-xs text-slate-400">Collaborate with us on refining the weights, decay parameters, and ZK templates.</p>
      </div>

      {submitted ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
          <Check className="w-8 h-8 text-emerald-400 mx-auto" />
          <h4 className="font-bold text-white">Application Received</h4>
          <p className="text-slate-400 text-xs">Your profile has been written to the trinity_leads registry. We will contact you regarding upcoming RFC sessions.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-slate-500 block">Email Address *</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-slate-500 block">Role / Specialty</label>
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Developer">Developer</option>
                <option value="Creator">ZK Architect</option>
                <option value="Validator">Validator Swarm Node</option>
                <option value="Staker">Liquidity / Staking Pool</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono text-slate-500 block">GitHub Username</label>
            <input 
              type="text" 
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="github-handle"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono text-slate-500 block">Preferred contribution focus</label>
            <textarea 
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="I am interested in designing the decay schedules and cross-dimensional penalty triggers..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none"
            />
          </div>

          <button 
            type="submit" 
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3 rounded-xl transition-all duration-200 disabled:opacity-50 text-xs flex items-center justify-center gap-1.5"
          >
            {submitting ? 'Submitting...' : (
              <>
                Register as Contributor <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
