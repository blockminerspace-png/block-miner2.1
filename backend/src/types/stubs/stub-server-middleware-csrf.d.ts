import type { RequestHandler } from "express";

export const CSRF_COOKIE_NAME: string;
export function buildCsrfCookie(token: string): string;
export function rotateCsrfCookie(res: import("express").Response): string;
export function createCsrfMiddleware(): RequestHandler;
