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
const ALLOWED = new Set([
  '0xb24268884472E7613aA58D38C8813f7Af1667382',
  '0xf6eE1768868c3266868edcA78bC41C50309cb22A',
].map((a) => a.toLowerCase()));

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const contract = new ethers.Contract(REG, ABI, provider);

for (const a of AGENTS) {
  const clients = await contract.getClients(a.tokenId);
  if (!clients.length) {
    console.log(`${a.name}: token ${a.tokenId} — minted, no on-chain writes`);
    continue;
  }
  const summaryClients = clients.filter((c) => ALLOWED.has(String(c).toLowerCase()));
  if (!summaryClients.length) {
    console.log(`${a.name}: token ${a.tokenId} — minted, no allowlisted on-chain writes`);
    continue;
  }
  const [count, value, decimals] = await contract.getSummary(a.tokenId, summaryClients, 'hyperdag_repid', '');
  const score = Number(value) / 10 ** Number(decimals);
  console.log(`${a.name}: token ${a.tokenId} — RepID ${score} (${count} writes)`);
}