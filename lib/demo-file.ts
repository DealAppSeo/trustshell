import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Public URL for the 20s demo. The file is optional; the player stays hidden until it is on disk. */
export const DEMO_PUBLIC_PATH = '/trustshell-demo-20s.mp4';

export function demoFileExists(): boolean {
  return existsSync(join(process.cwd(), 'public', 'trustshell-demo-20s.mp4'));
}
