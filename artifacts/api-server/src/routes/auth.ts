import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import type { AuthRequest } from "../middlewares/auth.js";
import { sendEmail } from "../lib/resend.js";
import { validateClerkSecretKey } from "../lib/clerkKeyValidation.js";

/**
 * Resolves and validates the Clerk secret key once at module load so any
 * misconfiguration (e.g. a publishable key pasted into the wrong slot) is
 * immediately visible in startup logs.
 */
function getClerkSecretKey(): string | undefined {
  const key =
    process.env.TALLYBILL_CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY;
  const envVarName = process.env.TALLYBILL_CLERK_SECRET_KEY
    ? "TALLYBILL_CLERK_SECRET_KEY"
    : "CLERK_SECRET_KEY";
  // validateClerkSecretKey logs an error on mismatch; callers still see
  // the (wrong) key, but the proxy middleware will already be disabled so
  // Clerk API calls will fail with a clear auth error rather than silently.
  validateClerkSecretKey(key, envVarName);
  return key;
}

const clerkSecretKey = getClerkSecretKey();

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

    let valid = false;

    if (user.clerkId) {
      const clerkVerifyRes = await fetch(
        `https://api.clerk.com/v1/users/${user.clerkId}/verify_password`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: currentPassword }),
        }
      );
      if (clerkVerifyRes.ok) {
        valid = true;
      } else {
        const body = await clerkVerifyRes.json().catch(() => ({})) as { errors?: Array<{ code?: string }> };
        const clerkErrors: Array<{ code?: string }> = body?.errors ?? [];
        const isWrongPassword = clerkErrors.some(
          (e) => e.code === "form_password_incorrect" || e.code === "form_password_validation_failed"
        );
        if (isWrongPassword || clerkVerifyRes.status === 422 || clerkVerifyRes.status === 400) {
          res.status(401).json({ error: "Current password is incorrect" });
          return;
        }
        console.warn("[change-password] Clerk verify_password failed:", clerkVerifyRes.status, body);
        res.status(500).json({ error: "Server error" });
        return;
      }
    } else {
      if (!user.passwordHash) {
        res.status(400).json({ error: "This account does not have a password set" });
        return;
      }
      valid = await bcrypt.compare(currentPassword, user.passwordHash);
    }

    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    if (user.clerkId) {
      const clerkUpdateRes = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword, skip_password_checks: true }),
      });
      if (!clerkUpdateRes.ok) {
        console.error("[change-password] Clerk password update failed:", await clerkUpdateRes.text());
        res.status(502).json({ error: "Failed to update password. Please try again." });
        return;
      }
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, userId));

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("[change-password]", err);
    res.status(500).json({ error: "Server error" });
  }
});

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

    if (user.clerkId) {
      const clerkRes = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      });
      if (clerkRes.ok) {
        const clerkUser = (await clerkRes.json()) as {
          external_accounts?: { provider: string }[];
        };
        if (clerkUser.external_accounts && clerkUser.external_accounts.length > 0) {
          const provider = clerkUser.external_accounts.some((a: { provider: string }) =>
            a.provider === "oauth_apple"
          ) ? "Apple" : "Google";
          res.status(400).json({
            error: `This account uses ${provider} sign-in. Please use the "Continue with ${provider}" button on the login screen instead.`,
            code: "OAUTH_ACCOUNT",
          });
          return;
        }
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await db
      .update(usersTable)
      .set({ resetToken: tokenHash, resetTokenExpiry: expiry })
      .where(eq(usersTable.id, user.id));

    await sendEmail({
      to: normalizedEmail,
      subject: "Your TallyBill password reset code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1F2937;margin-bottom:8px">Reset your TallyBill password</h2>
          <p style="color:#6B7280;margin-bottom:24px">Use the code below to reset your password. It expires in 15 minutes.</p>
          <div style="background:#F3F4F6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:bold;color:#1F2937">
            ${code}
          </div>
          <p style="color:#6B7280;margin-top:24px;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

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
          Authorization: `Bearer ${clerkSecretKey}`,
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
