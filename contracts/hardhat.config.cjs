require("@nomicfoundation/hardhat-toolbox");

const pk = process.env.PRIVATE_KEY_OWNER
  ? String(process.env.PRIVATE_KEY_OWNER).replace(/^0x/i, "")
  : "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  paths: {
    tests: "./hardhat-tests"
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {
      chainId: 137
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com",
      accounts: pk && /^[0-9a-fA-F]{64}$/.test(pk) ? [`0x${pk}`] : []
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: pk && /^[0-9a-fA-F]{64}$/.test(pk) ? [`0x${pk}`] : []
    }
  }
};
