import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    sections: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        slug: 'getting-started',
        description: 'How to install and initialize the TrustShell SDK.',
        steps: [
          'Installation',
          'Initialization',
          'Basic Usage',
          'Timeout & Safety Configuration'
        ]
      },
      {
        id: 'api-reference',
        title: 'API Reference',
        slug: 'api-reference',
        description: 'Detailed documentation of the TrustShell class and methods.',
        methods: [
          { name: 'constructor(config?: TrustConfig)', description: 'Initialize TrustShell client.' },
          { name: 'score(response: string): Promise<TrustScoreResult>', description: 'Evaluate response risk/trust score.' },
          { name: 'verify(agentId: string): Promise<AgentIdentity>', description: 'Retrieve RepID reputation/tier status.' },
          { name: 'audit(proofHash: string): Promise<AuditResult>', description: 'Verify cryptographic proof chain.' }
        ]
      },
      {
        id: 'architecture-overview',
        title: 'Architecture Overview',
        slug: 'architecture-overview',
        description: 'Under the hood of the TrustShell protocol and gates.',
        components: [
          'HAL scoring system',
          'x402 settlement layer',
          'RepID ledger and SBT integration',
          'Zero-Knowledge selectively disclosable proofs'
        ]
      }
    ]
  });
}
