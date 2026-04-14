const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("BlockMinerDeposit", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const BlockMinerDeposit = await ethers.getContractFactory("BlockMinerDeposit");
    const contract = await BlockMinerDeposit.deploy(owner.address);
    await contract.waitForDeployment();
    return { contract, owner, alice, bob };
  }

  it("accepts deposit at or above minimum", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await expect(contract.connect(alice).deposit(alice.address, { value: min })).to.emit(
      contract,
      "DepositReceived"
    );

    expect(await contract.totalDeposits()).to.equal(min);
    const rows = await contract.getUserDeposits(alice.address);
    expect(rows.length).to.equal(1);
    expect(rows[0].amount).to.equal(min);
  });

  it("reverts below minimum", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    const low = min - 1n;
    await expect(contract.connect(alice).deposit(alice.address, { value: low })).to.be.revertedWith(
      "Below minimum"
    );
  });

  it("reverts when userId is not sender", async function () {
    const { contract, alice, bob } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await expect(contract.connect(alice).deposit(bob.address, { value: min })).to.be.revertedWith(
      "userId must equal sender"
    );
  });

  it("reverts on zero userId", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await expect(
      contract.connect(alice).deposit(ethers.ZeroAddress, { value: min })
    ).to.be.revertedWith("Invalid user");
  });

  it("allows multiple deposits from same user", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await contract.connect(alice).deposit(alice.address, { value: min });
    await contract.connect(alice).deposit(alice.address, { value: min });
    const rows = await contract.getUserDeposits(alice.address);
    expect(rows.length).to.equal(2);
  });

  it("withdraw sends balance to owner", async function () {
    const { contract, owner, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await contract.connect(alice).deposit(alice.address, { value: min });
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await contract.withdraw();
    const receipt = await tx.wait();
    const gasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n;
    const gas = receipt.gasUsed * gasPrice;
    const after = await ethers.provider.getBalance(owner.address);
    expect(after + gas - before).to.be.greaterThan(0n);
    expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0n);
  });

  it("reverts withdraw for non-owner", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await contract.connect(alice).deposit(alice.address, { value: min });
    await expect(contract.connect(alice).withdraw()).to.be.revertedWithCustomError(
      contract,
      "OwnableUnauthorizedAccount"
    );
  });

  it("pause blocks deposit", async function () {
    const { contract, owner, alice } = await deployFixture();
    await contract.connect(owner).pause();
    const min = await contract.MIN_DEPOSIT();
    await expect(contract.connect(alice).deposit(alice.address, { value: min })).to.be.revertedWithCustomError(
      contract,
      "EnforcedPause"
    );
  });

  it("reverts plain receive", async function () {
    const { contract, alice } = await deployFixture();
    await expect(
      alice.sendTransaction({ to: await contract.getAddress(), value: 1n })
    ).to.be.revertedWith("Use deposit");
  });

  it("getDepositAmount sums matching timestamps", async function () {
    const { contract, alice } = await deployFixture();
    const min = await contract.MIN_DEPOSIT();
    await contract.connect(alice).deposit(alice.address, { value: min });
    const rows = await contract.getUserDeposits(alice.address);
    const ts = rows[0].timestamp;
    const sum = await contract.getDepositAmount(alice.address, ts);
    expect(sum).to.equal(min);
  });
});
