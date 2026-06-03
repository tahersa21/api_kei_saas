import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use("/api", router);

// Serve frontend static files in production (Docker / Cloud Run).
// The public/ directory sits next to dist/ in the container.
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(join(publicDir, "index.html"));
  });
  logger.info({ publicDir }, "Serving frontend static files");
}

// ── Global safety nets ────────────────────────────────────────────────────────
// Catch promise rejections that escape route handlers (e.g. fire-and-forget ops).
// Without this, an unhandled rejection in Node 15+ terminates the process.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — check for missing .catch()");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server will continue but inspect immediately");
});

export default app;
