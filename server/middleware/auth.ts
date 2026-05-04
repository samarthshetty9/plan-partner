import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

/** Test token format: Bearer test:doctor:<uuid> or Bearer test:patient:<uuid> (only when NODE_ENV=test) */
function getTestUserId(token: string): string | null {
  if (process.env.NODE_ENV !== "test") return null;
  const match = token.match(/^test:(?:doctor|patient):([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || (req.headers["x-authorization"] as string);
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Missing or invalid authorization" });
    return;
  }

  const testId = getTestUserId(token);
  if (testId) {
    (req as Request & { user: { id: string } }).user = { id: testId };
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as Request & { user: { id: string } }).user = { id: decoded.sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Optional auth: sets req.user if token present, does not 401. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || (req.headers["x-authorization"] as string);
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  const testId = getTestUserId(token);
  if (testId) {
    (req as Request & { user?: { id: string } }).user = { id: testId };
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as Request & { user?: { id: string } }).user = { id: decoded.sub };
  } catch {
    // ignore
  }
  next();
}
