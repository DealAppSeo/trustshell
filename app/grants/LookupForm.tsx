'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LookupForm() {
  const [value, setValue] = useState('');
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) router.push(`/grants/${encodeURIComponent(trimmed)}`);
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your agent name (e.g. pai-ceo, agent-cfo)"
        className="flex-1 rounded-md border border-neutral-700 bg-transparent px-4 py-2 text-sm outline-none focus:border-amber-500"
        aria-label="Principal identifier"
      />
      <button
        type="submit"
        className="rounded-md bg-amber-500 px-6 py-2 text-sm font-semibold text-black hover:bg-amber-400"
      >
        View grants
      </button>
    </form>
  );
}
