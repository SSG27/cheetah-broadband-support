import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { logger } from "./logger";

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret";
const COOKIE_NAME = "session";

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      sub: string;
      iat: number;
      exp: number;
    };
  } catch (e) {
    logger.error({ err: e }, "Failed to verify token");
    return null;
  }
}

export async function getUserFromToken(token?: string) {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  return user ?? null;
}

export { COOKIE_NAME };
