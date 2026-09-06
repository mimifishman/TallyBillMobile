/**
 * Read-only check: are the receipt photos of the pruned users still sitting in
 * object storage? Deletes nothing, touches no database.
 *
 * Needs PRIVATE_OBJECT_DIR of the instance whose bucket you want to inspect.
 *
 *   PRIVATE_OBJECT_DIR=... node --experimental-strip-types --no-warnings \
 *     ./scripts/check-receipt-objects.ts
 *
 * Extra object paths can be passed as arguments; otherwise the four paths
 * recorded in the prune backup are checked.
 */
import { Storage } from "@google-cloud/storage";

const DEFAULT_PATHS = [
  "/objects/uploads/103/10a6fd7b-f1d8-4b29-81f4-fb5ee99b7d0b",
  "/objects/uploads/104/c2c5113d-c696-43d7-9651-b63d59039231",
  "/objects/uploads/108/ce2d72bf-2a99-4bb7-9571-2ee9da1ffad6",
  "/objects/uploads/110/57a788c3-2dd7-4eec-a8a5-a5566de098fe",
];

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const dir = process.env.PRIVATE_OBJECT_DIR;
if (!dir) throw new Error("PRIVATE_OBJECT_DIR must be set");
const entityDir = dir.endsWith("/") ? dir : `${dir}/`;

const args = process.argv.slice(2).filter((a) => a.startsWith("/objects/"));
const paths = args.length > 0 ? args : DEFAULT_PATHS;

console.log(`Object dir: ${dir}`);
console.log(`Checking ${paths.length} object(s)\n`);

let stillThere = 0;

for (const objectPath of paths) {
  const parts = objectPath.slice(1).split("/");
  const full = `${entityDir}${parts.slice(1).join("/")}`;
  const withSlash = full.startsWith("/") ? full : `/${full}`;
  const pathParts = withSlash.split("/");
  const bucketName = pathParts[1]!;
  const objectName = pathParts.slice(2).join("/");

  try {
    const [exists] = await storageClient.bucket(bucketName).file(objectName).exists();
    if (exists) stillThere += 1;
    console.log(`${exists ? "STILL THERE" : "gone       "}  ${objectPath}`);
  } catch (err) {
    console.log(`ERROR       ${objectPath}`);
    console.error(`  ${(err as Error).message}`);
  }
}

console.log(
  stillThere === 0
    ? "\nAll clear — none of these objects remain."
    : `\n${stillThere} object(s) still in the bucket. They need removing.`,
);
