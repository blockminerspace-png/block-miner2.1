/**
 * Minimal ABI for BlockMinerDeposit (Polygon POL). Keep in sync with contracts/contracts/BlockMinerDeposit.sol.
 */
export const BLOCK_MINER_DEPOSIT_ABI = [
  "event DepositReceived(address indexed userId, address indexed sender, uint256 amount, uint256 timestamp)",
  "function deposit(address userId) payable",
  "function MIN_DEPOSIT() view returns (uint256)"
];
