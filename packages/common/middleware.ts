import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

// Rebuilds the Clerk PEM key however it was pasted into .env: with line breaks, with \n, or all on one line
function toPem(key: string) {
  const body = key
    .replace(/\\n/g, "")
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

const JWT_PUBLIC_KEY = toPem(process.env.JWT_PUBLIC_KEY ?? "");

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization; // Bearer token
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  let userId: string | undefined;
  try {
    // Throws on a bad signature or an expired token
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY, {
      algorithms: ["RS256"],
    });
    userId = typeof decoded === "string" ? undefined : decoded.sub;
  } catch {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  req.userId = userId;
  next();
}

// For calls between our own services, which send a shared secret instead of a user token
export function secretAuthMiddleware(secretEnvName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = Buffer.from(process.env[secretEnvName] ?? "");
    const token = Buffer.from(req.headers.authorization?.split(" ")[1] ?? "");

    if (secret.length === 0 || token.length !== secret.length || !timingSafeEqual(token, secret)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    next();
  };
}
