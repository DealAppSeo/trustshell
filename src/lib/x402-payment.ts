import { ethers } from 'ethers';

export interface OutboundPaymentPayload {
    v?: number;
    r?: string;
    s?: string;
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    is_simulated?: boolean;
    txHash: string;
}

export async function constructPaymentAndSign(
    challenge: any,
    privateKey: string,
    rpcUrl?: string
): Promise<OutboundPaymentPayload> {
    const offer = challenge.accepts?.find((a: any) => a.network === 'base-sepolia' && a.scheme === 'exact');
    if (!offer) {
        throw new Error('No compatible base-sepolia exact offer found');
    }

    // Handle simulated challenge bypass
    if (challenge.is_simulated || !privateKey) {
        return {
            is_simulated: true,
            txHash: '0xSimulatedPaymentHash',
            from: '0x0000000000000000000000000000000000000000',
            to: offer.payTo,
            value: offer.amount || offer.maxAmountRequired || '0',
            validAfter: '0',
            validBefore: '0',
            nonce: '0x0'
        };
    }

    const wallet = new ethers.Wallet(privateKey);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
    const amountVal = offer.amount || offer.maxAmountRequired || '0';
    const value = BigInt(amountVal);

    const domain = {
        name: "USD Coin",
        version: "2",
        chainId: 84532,
        verifyingContract: offer.asset
    };

    const types = {
        TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' }
        ]
    };

    const message = {
        from: wallet.address,
        to: offer.payTo,
        value: value,
        validAfter: validAfter,
        validBefore: validBefore,
        nonce: nonce
    };

    const signature = await wallet.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);

    return {
        v: sig.v,
        r: sig.r,
        s: sig.s,
        from: wallet.address,
        to: offer.payTo,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
        txHash: signature
    };
}
