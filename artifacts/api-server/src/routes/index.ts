import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import billsRouter from "./bills.js";
import billLinesRouter from "./bill-lines.js";
import billUsersRouter from "./bill-users.js";
import totalsRouter from "./totals.js";
import ocrRouter from "./ocr.js";
import currencyRouter from "./currency.js";
import meRouter from "./me.js";
import globalStorageRouter from "./globalStorage.js";
import { requireBillAccess } from "../middlewares/billAccess.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/me", meRouter);
router.use("/bills", billsRouter);
router.use("/bills/:billId/lines", requireBillAccess, billLinesRouter);
router.use("/bills/:billId/users", requireBillAccess, billUsersRouter);
router.use("/bills/:billId/totals", requireBillAccess, totalsRouter);
router.use("/storage", globalStorageRouter);
router.use("/ocr", ocrRouter);
router.use("/currency", currencyRouter);

export default router;
