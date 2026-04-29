import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import billsRouter from "./bills.js";
import billLinesRouter from "./bill-lines.js";
import billUsersRouter from "./bill-users.js";
import totalsRouter from "./totals.js";
import ocrRouter from "./ocr.js";
import currencyRouter from "./currency.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/bills", billsRouter);
router.use("/bills/:billId/lines", billLinesRouter);
router.use("/bills/:billId/users", billUsersRouter);
router.use("/bills/:billId/totals", totalsRouter);
router.use("/ocr", ocrRouter);
router.use("/currency", currencyRouter);

export default router;
