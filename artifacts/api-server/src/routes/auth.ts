import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import type { AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.post("/register", (_req, res) => {
  res.status(410).json({ error: "Registration is now handled via Clerk auth" });
});

router.post("/login", (_req, res) => {
  res.status(410).json({ error: "Login is now handled via Clerk auth" });
});

router.put("/password", requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (!user.passwordHash) {
      res.status(400).json({ error: "This account does not have a password set" });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, userId));
    res.json({ message: "Password updated successfully" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

async function sendResetEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#1F2937;margin-bottom:8px">Reset your TallyBill password</h2>
      <p style="color:#6B7280;margin-bottom:24px">Use the code below to reset your password. It expires in 15 minutes.</p>
      <div style="background:#F3F4F6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:bold;color:#1F2937">
        ${code}
      </div>
      <p style="color:#6B7280;margin-top:24px;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TallyBill <onboarding@resend.dev>",
      to: [to],
      subject: "Your TallyBill password reset code",
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user) {
      res.json({ message: "If that email is registered, a reset code has been sent." });
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await db
      .update(usersTable)
      .set({ resetToken: tokenHash, resetTokenExpiry: expiry })
      .where(eq(usersTable.id, user.id));

    await sendResetEmail(normalizedEmail, code);

    res.json({ message: "If that email is registered, a reset code has been sent." });
  } catch (err) {
    console.error("[forgot-password]", err);
    res.status(500).json({ error: "Failed to send reset code. Please try again." });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "email, code, and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const normalizedEmail = (email as string).trim().toLowerCase();

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    if (new Date() > user.resetTokenExpiry) {
      res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      return;
    }

    const validCode = await bcrypt.compare(String(code).trim(), user.resetToken);
    if (!validCode) {
      res.status(400).json({ error: "Incorrect reset code. Please check your email." });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(usersTable)
      .set({ passwordHash: newHash, resetToken: null, resetTokenExpiry: null })
      .where(eq(usersTable.id, user.id));

    if (user.clerkId) {
      const clerkRes = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword, skip_password_checks: true }),
      });
      if (!clerkRes.ok) {
        console.warn("[reset-password] Clerk password update failed:", await clerkRes.text());
      }
    }

    res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("[reset-password]", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

export default router;
