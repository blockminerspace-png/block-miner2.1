import { Router } from "express";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./publicSupport.controller.js";

export const publicSupportRouter = Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

publicSupportRouter.post("/ticket", writeLimiter, ctrl.createTicket);
publicSupportRouter.get("/tickets", readLimiter, ctrl.listTicketsByEmail);
publicSupportRouter.get("/ticket/:id", readLimiter, ctrl.getTicket);
publicSupportRouter.post("/ticket/:id/message", writeLimiter, ctrl.addGuestMessage);
