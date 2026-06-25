import { ethers } from 'ethers';

const REG = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const ABI = [
  'function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getClients(uint256 agentId) view returns (address[] memory)',
];
const AGENTS = [
  { name: 'sophia', tokenId: 3747 },
  { name: 'apm', tokenId: 6655 },
  { name: 'veritas', tokenId: 5864 },
  { name: 'shofet', tokenId: 5863 },
];

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const contract = new ethers.Contract(REG, ABI, provider);

for (const a of AGENTS) {
  const clients = await contract.getClients(a.tokenId);
  if (!clients.length) {
    console.log(`${a.name}: token ${a.tokenId} — minted, no on-chain writes`);
    continue;
  }
  const [count, value, decimals] = await contract.getSummary(a.tokenId, [...clients], 'hyperdag_repid', '');
  const score = Number(value) / 10 ** Number(decimals);
  console.log(`${a.name}: token ${a.tokenId} — RepID ${score} (${count} writes)`);
}