import express from "express";
import { offerwallMePostback } from "./offerwallme.controller.js";

export const offerwallMeRouter = express.Router();

// offerwall.me sends GET or POST — support both
offerwallMeRouter.get("/postback", offerwallMePostback);
offerwallMeRouter.post("/postback", offerwallMePostback);
