// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BlockMinerDeposit
 * @notice Accepts native POL deposits on Polygon. Credits are applied off-chain after confirmations.
 * @dev beneficiary must equal msg.sender so users cannot attribute deposits to another account on-chain.
 *      Owner can be a Gnosis Safe (transfer ownership to the Safe multisig).
 */
contract BlockMinerDeposit is ReentrancyGuard, Ownable, Pausable {
    uint256 public constant MIN_DEPOSIT = 0.01 ether;
    uint256 public totalDeposits;

    struct DepositRecord {
        address sender;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => DepositRecord[]) private _userDeposits;

    event DepositReceived(
        address indexed userId,
        address indexed sender,
        uint256 amount,
        uint256 timestamp
    );

    event Withdrawn(address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function deposit(address userId) external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT, "Below minimum");
        require(userId != address(0), "Invalid user");
        require(userId == msg.sender, "userId must equal sender");

        totalDeposits += msg.value;
        _userDeposits[userId].push(
            DepositRecord({sender: msg.sender, amount: msg.value, timestamp: block.timestamp})
        );

        emit DepositReceived(userId, msg.sender, msg.value, block.timestamp);
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "Empty");
        address to = owner();
        (bool ok, ) = payable(to).call{value: bal}("");
        require(ok, "Withdraw failed");
        emit Withdrawn(to, bal);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getUserDeposits(address userId) external view returns (DepositRecord[] memory) {
        return _userDeposits[userId];
    }

    /// @notice Sum of deposit amounts recorded at an exact block timestamp for `user`.
    function getDepositAmount(address user, uint256 timestamp) external view returns (uint256 total) {
        DepositRecord[] storage arr = _userDeposits[user];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i].timestamp == timestamp) {
                total += arr[i].amount;
            }
        }
    }

    receive() external payable {
        revert("Use deposit");
    }
}
