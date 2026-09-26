import { demoFileExists } from '@/lib/demo-file';

/** No video element unless public/trustshell-demo-20s.mp4 is on disk. */
export function DemoVideo() {
  if (!demoFileExists()) return null;
  return (
    <video
      className="aspect-video w-full rounded-2xl border border-slate-800 bg-slate-900"
      controls
      playsInline
      preload="metadata"
      src="/trustshell-demo-20s.mp4"
      aria-label="TrustShell 20 second demo"
    />
  );
}
