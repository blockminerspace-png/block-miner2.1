import type { Request, Response } from "express";
export declare function getPublicEntries(req: Request, res: Response): Promise<void>;
export declare function getPublicWalletStats(req: Request, res: Response): Promise<void>;
export declare function getPublicWithdrawalStats(req: Request, res: Response): Promise<void>;
export declare function getPublicTrackedWalletsLive(req: Request, res: Response): Promise<void>;
