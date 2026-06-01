import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-change-me";
}

export function signAdminToken(): string {
  const expires = Date.now() + TOKEN_TTL_MS;
  const hmac = createHmac("sha256", getSecret()).update(String(expires)).digest("hex");
  return `${expires}.${hmac}`;
}

export function verifyAdminToken(token: string): boolean {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expiresStr = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  if (Date.now() > Number(expiresStr)) return false;
  const expected = createHmac("sha256", getSecret()).update(expiresStr).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!verifyAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
