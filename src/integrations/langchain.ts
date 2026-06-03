/**
 * TrustShell LangChain Callback (S-BUILD Phase 3 stub)
 * 
 * Usage (when integrated):
 *   import { TrustShellCallback } from '@hyperdag/trustshell/langchain';
 *   const chain = new LLMChain({ llm, callbacks: [new TrustShellCallback()] });
 * 
 * On LLM end, it will call TrustShell.score and attach _trustshell to output.
 */

import { TrustShell, TrustShellConfig } from '../lib/trustshell';

export class TrustShellCallback {
  private shell: TrustShell;

  constructor(config?: TrustShellConfig) {
    this.shell = new TrustShell(config);
  }

  async handleLLMEnd(output: any, _runId: string): Promise<void> {
    const text = output.generations?.[0]?.[0]?.text || output.text || '';
    if (!text) return;

    try {
      const result = await this.shell.score(text);
      output._trustshell = result;

      if (result.verdict === 'VETO') {
        console.warn(`[TrustShell] HAL VETO (trustScore=${result.trustScore})`);
      }
    } catch (e) {
      console.warn('[TrustShell] callback error (non-fatal)', (e as Error).message);
    }
  }
}
