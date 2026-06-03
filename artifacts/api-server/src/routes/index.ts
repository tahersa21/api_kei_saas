import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import adminRouter from "./admin";
import userRouter from "./user";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(adminRouter);
router.use(userRouter);

export default router;
