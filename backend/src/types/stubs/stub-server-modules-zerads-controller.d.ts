import type { Request, Response } from "express";
export declare function zeradsCallbackHandler(req: Request, res: Response): Promise<void>;
export declare function getUserZeradsLink(req: Request, res: Response): Promise<void>;
export declare function getZeradsHistory(req: Request, res: Response): Promise<void>;
export declare function getZeradsStats(req: Request, res: Response): Promise<void>;
