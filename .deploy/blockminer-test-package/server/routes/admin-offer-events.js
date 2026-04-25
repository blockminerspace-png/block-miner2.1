import express from "express";
import * as adminOffer from "../controllers/adminOfferEventController.js";

export const adminOfferEventsRouter = express.Router();

adminOfferEventsRouter.get("/offer-events", adminOffer.adminListOfferEvents);
adminOfferEventsRouter.post("/offer-events", adminOffer.adminCreateOfferEvent);
adminOfferEventsRouter.get("/offer-events/:id", adminOffer.adminGetOfferEvent);
adminOfferEventsRouter.put("/offer-events/:id", adminOffer.adminUpdateOfferEvent);
adminOfferEventsRouter.delete("/offer-events/:id", adminOffer.adminSoftDeleteOfferEvent);

adminOfferEventsRouter.get("/offer-events/:eventId/miners", adminOffer.adminListEventMiners);
adminOfferEventsRouter.post("/offer-events/:eventId/miners", adminOffer.adminCreateEventMiner);
adminOfferEventsRouter.put("/offer-events/:eventId/miners/:minerId", adminOffer.adminUpdateEventMiner);
adminOfferEventsRouter.delete("/offer-events/:eventId/miners/:minerId", adminOffer.adminRemoveEventMiner);

adminOfferEventsRouter.get("/offer-events/:id/purchases", adminOffer.adminListEventPurchases);

adminOfferEventsRouter.get("/offer-events/:id/purchases", adminOffer.adminListEventPurchases);
