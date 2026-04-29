import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["JWT_SECRET"] || "tallybill-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "30d";

export interface JwtPayload {
  userId: number;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function revSentenceWord(text: string): string {
  const words = text.split(" ");
  return words.reverse().join(" ");
}

export function isHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}
