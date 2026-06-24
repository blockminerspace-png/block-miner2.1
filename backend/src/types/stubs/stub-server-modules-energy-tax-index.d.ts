import type { Router } from "express";
export declare const energyTaxRouter: Router;
export declare function runWeeklySweep(now?: Date): Promise<{ touched: number; chargesCreated: number }>;
