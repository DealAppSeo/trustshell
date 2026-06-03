const { ethers } = require('ethers');

async function main() {
  const apiKey = 'test-key-123';
  const engineUrl = 'http://localhost:3000';
  
  const requestorAgentId = 'a83cc9eb-43b0-49ee-9e45-2ecbb0d35067';
  const veritasPrivateKey = '83e177c927ff08170300053cb9670a3bae7e225277c7f9251f8da463eab0bbd3';
  const providerAgentId = '32e0e809-c1c4-4405-913f-135c8a2d6626';

  // 1. request
  const requestUrl = `${engineUrl}/api/v1/tip/request`;
  const requestBody = {
    requestor_agent_id: requestorAgentId,
    provider_agent_id: providerAgentId,
    prediction_topic: 'test_topic_node_e2e'
  };

  const requestRes = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
  });

  console.log('Request Status:', requestRes.status);
  const challenge = await requestRes.json();
  console.log('Challenge:', challenge);

  if (requestRes.status !== 402 && !requestRes.ok) {
    throw new Error('Request failed');
  }

  const accepts = challenge.accepts || [];
  const offer = accepts.find((a) => a.scheme === 'exact');
  if (!offer) {
    throw new Error('No exact offer');
  }

  // 2. sign
  const wallet = new ethers.Wallet(veritasPrivateKey);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;
  const value = BigInt(offer.amount);

  const domain = {
    name: 'USD Coin',
    version: '2',
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

  const paymentPayload = {
    v: sig.v,
    r: sig.r,
    s: sig.s,
    from: wallet.address,
    to: offer.payTo,
    value: value.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce: nonce
  };

  const paymentB64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  // 3. deliver
  const deliverUrl = `${engineUrl}/api/v1/tip/deliver/${challenge.tip_id}`;
  console.log('Delivering to:', deliverUrl);
  const deliverRes = await fetch(deliverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-PAYMENT': paymentB64,
    },
    body: JSON.stringify({
      payer_address: wallet.address
    }),
  });

  console.log('Deliver Status:', deliverRes.status);
  console.log('Deliver Body:', await deliverRes.text());
}

main().catch(console.error);
