/** Mirrors server/services/blockMinerDepositAbi.js — BlockMinerDeposit on Polygon. */
export const BLOCK_MINER_DEPOSIT_ABI = [
  "function deposit(address userId) payable",
  "event DepositReceived(address indexed userId, address indexed sender, uint256 amount, uint256 timestamp)"
];
