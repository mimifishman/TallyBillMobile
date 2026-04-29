import { Router } from "express";

const router = Router();

router.post("/register", (_req, res) => {
  res.status(410).json({ error: "Registration is now handled via Clerk auth" });
});

router.post("/login", (_req, res) => {
  res.status(410).json({ error: "Login is now handled via Clerk auth" });
});

export default router;
