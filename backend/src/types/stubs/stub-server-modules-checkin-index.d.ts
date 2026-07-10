import type { Router } from "express";
export declare const checkinRouter: Router;
export declare function resolveCheckinReceiverFromEnv(): string | null;
export declare function checkinBalance(...args: unknown[]): Promise<unknown>;
export declare function processStalePendingCheckins(...args: unknown[]): Promise<unknown>;
