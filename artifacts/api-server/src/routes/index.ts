import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(adminRouter);

export default router;
