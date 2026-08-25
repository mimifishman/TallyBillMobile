import { createClerkClient } from "@clerk/express";

export const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
