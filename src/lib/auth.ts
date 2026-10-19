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
  if (!user) return null;
  return {
    ...user,
    role: user.role === "ADMIN" || isAdminEmail(user.email) ? "ADMIN" : "USER",
  };
}

export function isAdminEmail(email: string) {
  const configured = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.toLowerCase());
}

export function isAdmin(user: { role: string } | null | undefined) {
  return user?.role === "ADMIN";
}

export { COOKIE_NAME };
