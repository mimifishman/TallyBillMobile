import { Resend } from "resend";

async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (hostname && xReplitToken) {
    const data = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    )
      .then((r) => r.json())
      .then((d) => d.items?.[0]);

    if (data?.settings?.api_key) {
      return {
        client: new Resend(data.settings.api_key),
        fromEmail: data.settings.from_email || "onboarding@resend.dev",
      };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return { client: new Resend(apiKey), fromEmail: "onboarding@resend.dev" };
  }

  throw new Error("Resend not configured — set RESEND_API_KEY or connect via Replit integrations");
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const result = await client.emails.send({
    from: `TallyBill <${fromEmail}>`,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
}
