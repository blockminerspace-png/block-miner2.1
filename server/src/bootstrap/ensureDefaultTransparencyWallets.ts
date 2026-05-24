import prisma from "../db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("TransparencyWalletBootstrap");

type DefaultTrackedWallet = {
  label: string;
  address: string;
  chain: string;
  assetSymbol: string;
  explorerBaseUrl: string;
  isActive: boolean;
  isPublic: boolean;
  includeInTotals: boolean;
  displayMode: string;
  sortOrder: number;
};

const DEFAULT_TRACKED_WALLETS: readonly DefaultTrackedWallet[] = [
  {
    label: "Old Withdrawal Wallet",
    address: "0x404CBeC8eC6F59e28C5F3D9e5b6080DA344792E7",
    chain: "polygon",
    assetSymbol: "POL",
    explorerBaseUrl: "https://polygonscan.com/address",
    isActive: false,
    isPublic: true,
    includeInTotals: true,
    displayMode: "total_sent",
    sortOrder: 120,
  },
];

export async function ensureDefaultTransparencyWallets(): Promise<void> {
  for (const wallet of DEFAULT_TRACKED_WALLETS) {
    const existing = await prisma.transparencyTrackedWallet.findUnique({
      where: {
        chain_address: {
          chain: wallet.chain,
          address: wallet.address,
        },
      },
    });

    if (existing) continue;

    await prisma.transparencyTrackedWallet.create({
      data: wallet,
    });

    logger.info("Created default tracked transparency wallet", {
      label: wallet.label,
      address: wallet.address,
      displayMode: wallet.displayMode,
      isActive: wallet.isActive,
    });
  }
}
