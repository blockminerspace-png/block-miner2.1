const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer. Set PRIVATE_KEY_OWNER for this network.");
  }
  const BlockMinerDeposit = await hre.ethers.getContractFactory("BlockMinerDeposit");
  const contract = await BlockMinerDeposit.deploy(deployer.address);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  // eslint-disable-next-line no-console
  console.log("BlockMinerDeposit deployed to", addr, "owner", deployer.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
