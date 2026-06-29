import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import pool from "./db.js";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return;
  }

  const hash = hashApiKey(apiKey);
  const result = await pool.query(
    "SELECT id, name FROM integrators WHERE api_key_hash = $1",
    [hash],
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  (req as any).integrator = result.rows[0];
  next();
}

export async function optionalApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    const hash = hashApiKey(apiKey);
    const result = await pool.query(
      "SELECT id, name FROM integrators WHERE api_key_hash = $1",
      [hash],
    );
    if (result.rows.length > 0) {
      (req as any).integrator = result.rows[0];
    }
  }
  next();
}
