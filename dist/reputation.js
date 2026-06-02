"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPUTATION_REGISTRY_ABI = exports.IDENTITY_REGISTRY_ABI = void 0;
exports.resolveAgentId = resolveAgentId;
exports.getRepID = getRepID;
exports.getReputationHistory = getReputationHistory;
exports.getAttestation = getAttestation;
const ethers_1 = require("ethers");
exports.IDENTITY_REGISTRY_ABI = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function getAgentWallet(uint256 agentId) view returns (address)",
    "function getMetadata(uint256 agentId, string memory metadataKey) view returns (bytes)"
];
exports.REPUTATION_REGISTRY_ABI = [
    "function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
    "function readAllFeedback(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2, bool includeRevoked) view returns (address[] memory clients, uint64[] memory feedbackIndexes, int128[] memory values, uint8[] memory valueDecimals, string[] memory tag1s, string[] memory tag2s, bool[] memory revokedStatuses)",
    "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)",
    "function getClients(uint256 agentId) view returns (address[] memory)",
    "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
];
async function resolveAgentId(agentAddressOrId, provider, options) {
    if (typeof agentAddressOrId === 'number' || typeof agentAddressOrId === 'bigint') {
        return BigInt(agentAddressOrId);
    }
    if (typeof agentAddressOrId === 'string' && /^\d+$/.test(agentAddressOrId)) {
        return BigInt(agentAddressOrId);
    }
    const address = String(agentAddressOrId).toLowerCase();
    // Try to query the backend to resolve the address/UUID to token ID
    const engineUrl = options?.engineUrl || 'https://repid-engine-production.up.railway.app';
    try {
        const res = await fetch(`${engineUrl}/api/v1/agents`);
        if (res.ok) {
            const agents = await res.json();
            const matched = agents.find((a) => (a.erc8004_address && a.erc8004_address.toLowerCase() === address) ||
                (a.id && a.id.toLowerCase() === address));
            if (matched && matched.erc8004_token_id) {
                return BigInt(matched.erc8004_token_id);
            }
        }
    }
    catch (e) {
        // Fallback on error
    }
    try {
        return BigInt(agentAddressOrId);
    }
    catch {
        throw new Error(`Could not resolve agent address/ID: ${agentAddressOrId}`);
    }
}
async function getRepID(agentAddressOrId, options) {
    const provider = options?.provider || new ethers_1.ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
    const agentId = await resolveAgentId(agentAddressOrId, provider, options);
    const reputationAddress = options?.reputationRegistryAddress || '0x8004B663056A597Dffe9eCcC1965A193B7388713';
    const contract = new ethers_1.ethers.Contract(reputationAddress, exports.REPUTATION_REGISTRY_ABI, provider);
    let clients = [];
    try {
        clients = await contract.getClients(agentId);
    }
    catch (e) {
        // ignore
    }
    if (clients.length === 0) {
        return { count: 0, value: 0n, decimals: 0 };
    }
    const clientsList = [...clients];
    const result = await contract.getSummary(agentId, clientsList, 'hyperdag_repid', '');
    return {
        count: Number(result[0]),
        value: BigInt(result[1]),
        decimals: Number(result[2])
    };
}
async function getReputationHistory(agentAddressOrId, options) {
    const provider = options?.provider || new ethers_1.ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
    const agentId = await resolveAgentId(agentAddressOrId, provider, options);
    const reputationAddress = options?.reputationRegistryAddress || '0x8004B663056A597Dffe9eCcC1965A193B7388713';
    const contract = new ethers_1.ethers.Contract(reputationAddress, exports.REPUTATION_REGISTRY_ABI, provider);
    const clientsFilter = options?.clientAddresses ? [...options.clientAddresses] : [];
    const tag1 = options?.tag1 || '';
    const tag2 = options?.tag2 || '';
    const includeRevoked = options?.includeRevoked !== false;
    const result = await contract.readAllFeedback(agentId, clientsFilter, tag1, tag2, includeRevoked);
    const [clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses] = result;
    const list = [];
    const len = clients.length;
    for (let i = 0; i < len; i++) {
        list.push({
            clientAddress: clients[i],
            feedbackIndex: Number(feedbackIndexes[i]),
            value: BigInt(values[i]),
            decimals: Number(valueDecimals[i]),
            tag1: tag1s[i],
            tag2: tag2s[i],
            isRevoked: revokedStatuses[i]
        });
    }
    if (options?.limit && options.limit > 0) {
        return list.slice(-options.limit);
    }
    return list;
}
async function getAttestation(txHash, options) {
    const provider = options?.provider || new ethers_1.ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
        throw new Error(`Transaction receipt not found for hash: ${txHash}`);
    }
    const reputationInterface = new ethers_1.ethers.Interface(exports.REPUTATION_REGISTRY_ABI);
    const newFeedbackTopic = reputationInterface.getEvent('NewFeedback').topicHash;
    for (const log of receipt.logs) {
        if (log.topics[0] === newFeedbackTopic) {
            const parsedLog = reputationInterface.parseLog({
                topics: log.topics,
                data: log.data
            });
            if (parsedLog) {
                return {
                    txHash,
                    blockNumber: receipt.blockNumber,
                    agentId: parsedLog.args.agentId.toString(),
                    clientAddress: parsedLog.args.clientAddress,
                    feedbackIndex: Number(parsedLog.args.feedbackIndex),
                    value: BigInt(parsedLog.args.value),
                    decimals: Number(parsedLog.args.valueDecimals),
                    tag1: parsedLog.args.tag1,
                    tag2: parsedLog.args.tag2,
                    endpoint: parsedLog.args.endpoint,
                    feedbackURI: parsedLog.args.feedbackURI,
                    feedbackHash: parsedLog.args.feedbackHash
                };
            }
        }
    }
    throw new Error(`NewFeedback event not found in transaction: ${txHash}`);
}
//# sourceMappingURL=reputation.js.map