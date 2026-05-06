import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto space-y-16 py-12">
      <header className="text-center space-y-6">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white">
          TrustShell. <span className="text-amber-500">AI agents that earn your trust.</span>
        </h1>
        <p className="text-xl text-[#94a3b8] max-w-3xl mx-auto leading-relaxed">
          Free Groq + Gemini + Cerebras. Bring your own paid keys when you need premium models. Your keys never leave your browser.
        </p>
        <div className="pt-8">
          <Link href="/connect" className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors text-lg inline-block">
            Get Started
          </Link>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-8 pt-12 border-t border-[#1e293b]">
        <div className="space-y-4">
          <div className="w-12 h-12 bg-[#1e293b] rounded-lg flex items-center justify-center text-2xl">⚡</div>
          <h3 className="text-xl font-bold text-white">Free first</h3>
          <p className="text-[#94a3b8]">Start immediately with our free tier router pointing to the best open models on Groq, Cerebras, and Gemini Flash. No credit card required.</p>
        </div>
        <div className="space-y-4">
          <div className="w-12 h-12 bg-[#1e293b] rounded-lg flex items-center justify-center text-2xl">🔐</div>
          <h3 className="text-xl font-bold text-white">Your keys, your control</h3>
          <p className="text-[#94a3b8]">When you need OpenAI or Anthropic, your keys are AES-GCM encrypted in your browser vault. They are only sent in memory during the request.</p>
        </div>
        <div className="space-y-4">
          <div className="w-12 h-12 bg-[#1e293b] rounded-lg flex items-center justify-center text-2xl">📊</div>
          <h3 className="text-xl font-bold text-white">Real reputation</h3>
          <p className="text-[#94a3b8]">Every decision your agent makes is scored and verified by the RepID protocol. Track your agent's trust score transparently over time.</p>
        </div>
      </div>
    </div>
  );
}
