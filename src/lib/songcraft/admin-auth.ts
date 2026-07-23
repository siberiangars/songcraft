import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const SONGCRAFT_ADMIN_COOKIE = "songcraft_admin_session";

function adminSecret() {
  return process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || "";
}

function sessionToken() {
  const secret = adminSecret();
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update("songcraft-admin-session:v1")
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminConfigured() {
  return adminSecret().length >= 12;
}

export function verifyAdminPassword(password: string) {
  const secret = adminSecret();
  return Boolean(secret) && safeEqual(password, secret);
}

export function verifyAdminSession(token?: string) {
  const expected = sessionToken();
  return Boolean(token && expected) && safeEqual(token || "", expected);
}

export function adminSessionValue() {
  return sessionToken();
}

export function requestHasAdminSession(req: NextRequest) {
  return verifyAdminSession(req.cookies.get(SONGCRAFT_ADMIN_COOKIE)?.value);
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(SONGCRAFT_ADMIN_COOKIE)?.value);
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};
