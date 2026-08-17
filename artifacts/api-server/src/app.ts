import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import { validateClerkPublishableKey } from "./lib/clerkKeyValidation";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));

const clerkPublishableKey =
  process.env.TALLYBILL_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;

const publishableKeyEnvVar = process.env.TALLYBILL_CLERK_PUBLISHABLE_KEY
  ? "TALLYBILL_CLERK_PUBLISHABLE_KEY"
  : "CLERK_PUBLISHABLE_KEY";

validateClerkPublishableKey(clerkPublishableKey, publishableKeyEnvVar);

app.use(
  clerkMiddleware({
    publishableKey: clerkPublishableKey,
  }),
);

// Receipt images sent as base64 can easily exceed the default 1 MB limit.
// Apply a larger limit for the OCR route before the global parser runs.
app.use("/api/ocr", express.json({ limit: "20mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Universal Links / App Links verification files ───────────────────────────
//
// iOS fetches /.well-known/apple-app-site-association to verify that this
// domain is authorised to open the app via Universal Links.
//
// The appID format is: <TeamID>.<BundleIdentifier>
//   - TeamID:           10-character Apple Developer Team ID (find it at
//                       developer.apple.com → Membership → Team ID).
//   - BundleIdentifier: must match ios.bundleIdentifier in app.config.ts,
//                       currently "com.tallybill.mobile".
//
// Update APPLE_TEAM_ID below (or set the env var) before submitting to the
// App Store — the OS will silently reject the file if the Team ID is wrong.
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "XXXXXXXXXX";
const IOS_BUNDLE_ID = "com.tallybill.mobile";

app.get(
  "/.well-known/apple-app-site-association",
  (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`,
            paths: ["/b/*"],
          },
        ],
      },
    });
  },
);

// Android fetches /.well-known/assetlinks.json to verify App Links.
//
// sha256_cert_fingerprints must list the SHA-256 fingerprint of the signing
// certificate used for release builds.  Obtain it from:
//   • EAS build:  eas credentials  (select Android → Keystore → show)
//   • Local:      keytool -list -v -keystore <your.keystore>
//
// The fingerprint format is colon-separated hex bytes, e.g.:
//   "AB:CD:EF:..."
//
// Set ANDROID_SHA256_CERT env var before publishing to the Play Store.
// Multiple fingerprints can be listed (upload key + app signing key).
const ANDROID_PACKAGE = "com.tallybill.mobile";
const ANDROID_SHA256_CERT = process.env.ANDROID_SHA256_CERT ?? "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

app.get(
  "/.well-known/assetlinks.json",
  (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: [ANDROID_SHA256_CERT],
        },
      },
    ]);
  },
);

app.use("/api", router);

export default app;
