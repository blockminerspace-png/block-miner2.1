import express from "express";
import * as depositTicketController from "../controllers/depositTicketController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const depositTicketRouter = express.Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

depositTicketRouter.get("/", requireAuth, limiter, depositTicketController.listMyTickets);
depositTicketRouter.post("/", requireAuth, limiter, depositTicketController.createTicket);

export { depositTicketRouter };
