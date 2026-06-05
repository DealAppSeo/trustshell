import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const agent = searchParams.get('agent');

    if (!hash && !agent) {
      const [allProofs, anchoredProofsAll, latestHallucination, anchoredProofs, allAgents] = await Promise.all([
        sbSelect<any>('repid_zkp_proofs', { select: 'id' }),
        sbSelect<any>('repid_zkp_proofs', {
          select: 'id,agent_id,proof_type,tier_proven,merkle_root,zk_commitment,eas_schema,eas_attestation_uid,created_at',
          filter: 'eas_attestation_uid=not.is.null',
          orderBy: 'created_at.desc'
        }),
        sbSelect<any>('trinity_hallucination_logs', {
          orderBy: 'timestamp.desc',
          limit: 1
        }),
        sbSelect<any>('repid_zkp_proofs', {
          filter: 'eas_attestation_uid=not.is.null',
          orderBy: 'created_at.desc',
          limit: 1
        }),
        sbSelect<any>('repid_agents', { select: 'id,agent_name' })
      ]);

      const eas_anchored = anchoredProofs && anchoredProofs.length > 0;

      const agentMap = new Map<string, string>();
      if (allAgents) {
        allAgents.forEach((a: any) => {
          if (a.id && a.agent_name) agentMap.set(a.id, a.agent_name);
        });
      }

      const mappedReceipts = (anchoredProofsAll || []).map((p: any) => ({
        id: p.id,
        agent_id: p.agent_id,
        agent_name: agentMap.get(p.agent_id) || 'Unknown Agent',
        proof_type: p.proof_type,
        tier_proven: p.tier_proven,
        merkle_root: p.merkle_root,
        zk_commitment: p.zk_commitment,
        eas_schema: p.eas_schema,
        eas_attestation_uid: p.eas_attestation_uid,
        created_at: p.created_at
      }));

      return NextResponse.json({
        success: true,
        summary: true,
        registry: {
          identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
          reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
          reputationWriteTx: '0x3990a1988c44ff674c8732c022b68d0575d1082a52337ea1bba8a08751f9c5a2',
          x402SettlementTx: '0xmock3c511d52795541779bc7e5968e9bf65f'
        },
        eas_anchored: eas_anchored ? 1 : 0,
        total_proofs: allProofs.length,
        total_eas_attestations: anchoredProofsAll.length,
        latest_anchored: anchoredProofs && anchoredProofs.length > 0 ? anchoredProofs[0] : null,
        latest_hallucination: latestHallucination && latestHallucination.length > 0 ? latestHallucination[0] : null,
        eas_receipts: mappedReceipts
      });
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
          orderBy: 'created_at.desc',
          limit: 1
        });
        if (p1 && p1.length > 0) {
          foundProof = p1[0];
          sourceTable = 'repid_zkp_proofs';
        }
      } else {
        // Resolve agent name to UUID using repid_agents table
        const matchingAgents = await sbSelect<any>('repid_agents', {
          filter: `agent_name=eq.${agent}`,
          limit: 1
        });
        if (matchingAgents && matchingAgents.length > 0) {
          const agentId = matchingAgents[0].id;
          const p1 = await sbSelect<any>('repid_zkp_proofs', {
            filter: `agent_id=eq.${agentId}`,
            orderBy: 'created_at.desc',
            limit: 1
          });
          if (p1 && p1.length > 0) {
            foundProof = p1[0];
            sourceTable = 'repid_zkp_proofs';
          }
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

    // Return the proof in a standardized format, ensuring null-safety for eas_attestation_uid (R4: until eas_anchored>0 from XC, then real on-chain EAS explorer links)
    // Wires to repid_zkp_proofs + eas uid (see ga4 /demo/proofs + health.ts for backend equiv). Explorer: base-sepolia.easscan.org
    if (sourceTable === 'repid_zkp_proofs') {
      const agents = await sbSelect<any>('repid_agents', {
        filter: `id=eq.${foundProof.agent_id}`,
        limit: 1
      });
      const agentName = agents && agents.length > 0 ? agents[0].agent_name : null;
      return NextResponse.json({
        success: true,
        source: 'repid_zkp_proofs',
        proof: {
          id: foundProof.id,
          agent_id: foundProof.agent_id,
          agent_name: agentName,
          proof_type: foundProof.proof_type,
          tier_proven: foundProof.tier_proven,
          merkle_root: foundProof.merkle_root,
          zk_commitment: foundProof.zk_commitment,
          eas_schema: foundProof.eas_schema,
          eas_attestation_uid: foundProof.eas_attestation_uid ?? null, // Null-safety check
          eas_anchored: foundProof.eas_attestation_uid ? 1 : 0, // Computed field based on active anchoring status
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
          eas_anchored: 0, // Computed field based on active anchoring status
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
