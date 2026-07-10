import type { RequestHandler } from "express";
export declare const requireAdminAuth: RequestHandler;
export declare function verifyAdminJwtToken(token: string | null | undefined): import("jsonwebtoken").JwtPayload | null;
