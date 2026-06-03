import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const agent = searchParams.get('agent');

    if (!hash && !agent) {
      return NextResponse.json({
        success: false,
        error: 'Missing query parameters: must provide either ?hash= or ?agent='
      }, { status: 400 });
    }

    let foundProof: any = null;
    let sourceTable = '';

    // 1. Search by hash
    if (hash) {
      // Check repid_zkp_proofs by zk_commitment
      const p1 = await sbSelect<any>('repid_zkp_proofs', {
        filter: `zk_commitment=eq.${hash}`,
        limit: 1
      });
      if (p1 && p1.length > 0) {
        foundProof = p1[0];
        sourceTable = 'repid_zkp_proofs';
      }

      // Check repid_zkp_proofs by merkle_root
      if (!foundProof) {
        const p2 = await sbSelect<any>('repid_zkp_proofs', {
          filter: `merkle_root=eq.${hash}`,
          limit: 1
        });
        if (p2 && p2.length > 0) {
          foundProof = p2[0];
          sourceTable = 'repid_zkp_proofs';
        }
      }

      // Check zkp_proofs_staged by proof_hash
      if (!foundProof) {
        const p3 = await sbSelect<any>('zkp_proofs_staged', {
          filter: `proof_hash=eq.${hash}`,
          limit: 1
        });
        if (p3 && p3.length > 0) {
          foundProof = p3[0];
          sourceTable = 'zkp_proofs_staged';
        }
      }
    }

    // 2. Search by agent
    if (!foundProof && agent) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agent);
      if (isUuid) {
        const p1 = await sbSelect<any>('repid_zkp_proofs', {
          filter: `agent_id=eq.${agent}`,
          limit: 1
        });
        if (p1 && p1.length > 0) {
          foundProof = p1[0];
          sourceTable = 'repid_zkp_proofs';
        }
      }

      if (!foundProof) {
        const p2 = await sbSelect<any>('zkp_proofs_staged', {
          filter: `agent_name=eq.${agent}`,
          limit: 1
        });
        if (p2 && p2.length > 0) {
          foundProof = p2[0];
          sourceTable = 'zkp_proofs_staged';
        }
      }
    }

    if (!foundProof) {
      return NextResponse.json({
        success: false,
        error: 'Proof not found'
      }, { status: 404 });
    }

    // Return the proof in a standardized format, ensuring null-safety for eas_attestation_uid
    if (sourceTable === 'repid_zkp_proofs') {
      return NextResponse.json({
        success: true,
        source: 'repid_zkp_proofs',
        proof: {
          id: foundProof.id,
          agent_id: foundProof.agent_id,
          proof_type: foundProof.proof_type,
          tier_proven: foundProof.tier_proven,
          merkle_root: foundProof.merkle_root,
          zk_commitment: foundProof.zk_commitment,
          eas_schema: foundProof.eas_schema,
          eas_attestation_uid: foundProof.eas_attestation_uid ?? null, // Null-safety check
          created_at: foundProof.created_at,
          expires_at: foundProof.expires_at ?? null,
          verified: true
        }
      });
    } else {
      return NextResponse.json({
        success: true,
        source: 'zkp_proofs_staged',
        proof: {
          id: foundProof.id,
          proof_type: foundProof.proof_type,
          agent_name: foundProof.agent_name,
          proof_hash: foundProof.proof_hash,
          merkle_root: foundProof.merkle_root,
          anchor_tx_hash: foundProof.anchor_tx_hash,
          eas_attestation_uid: null, // Null-safety check
          computed_at: foundProof.computed_at,
          expires_at: foundProof.expires_at ?? null,
          status: foundProof.status,
          verified: foundProof.status === 'valid' || foundProof.status === 'active'
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to verify proof'
    }, { status: 500 });
  }
}
