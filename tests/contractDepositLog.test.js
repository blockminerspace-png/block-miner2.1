import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  contractDepositMatchesLinkedWallet,
  extractDepositReceivedFromReceipt
} from "../server/services/contractDepositLog.js";
import { BLOCK_MINER_DEPOSIT_ABI } from "../server/services/blockMinerDepositAbi.js";

test("extractDepositReceivedFromReceipt parses event amount and addresses", () => {
  const iface = new ethers.Interface(BLOCK_MINER_DEPOSIT_ABI);
  const contract = "0x1111111111111111111111111111111111111111";
  const user = "0x2222222222222222222222222222222222222222";
  const amount = ethers.parseEther("0.05");
  const log = iface.encodeEventLog("DepositReceived", [user, user, amount, 12345n]);
  const receipt = {
    logs: [
      {
        address: contract,
        topics: log.topics,
        data: log.data
      }
    ]
  };
  const parsed = extractDepositReceivedFromReceipt(receipt, contract.toLowerCase());
  assert.ok(parsed);
  assert.equal(parsed.userId, user.toLowerCase());
  assert.equal(parsed.sender, user.toLowerCase());
  assert.equal(parsed.amount, amount);
});

test("contractDepositMatchesLinkedWallet requires linked == userId == from", () => {
  const linked = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ok = contractDepositMatchesLinkedWallet(
    linked.toLowerCase(),
    linked,
    linked.toLowerCase()
  );
  assert.equal(ok, true);
  assert.equal(contractDepositMatchesLinkedWallet("", linked, linked), false);
  assert.equal(contractDepositMatchesLinkedWallet(linked.toLowerCase(), linked, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), false);
});
