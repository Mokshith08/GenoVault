const nodemailer = require("nodemailer");
const { google }  = require("googleapis");

const OAuth2 = google.auth.OAuth2;

/**
 * createTransporter
 *
 * Priority:
 *   1. Gmail OAuth2  → inbox delivery ✅  (regenerate at developers.google.com/oauthplayground)
 *   2. App Password  → fallback, may go to spam ⚠️
 */
const createTransporter = async () => {
  // ── Method 1: OAuth2 (primary — inbox delivery) ──────────────────────
  if (
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  ) {
    try {
      const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
      );
      oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
      const { token: accessToken } = await oauth2Client.getAccessToken();

      if (accessToken) {
        return nodemailer.createTransport({
          service: "gmail",
          auth: {
            type:         "OAuth2",
            user:         process.env.GMAIL_USER,
            clientId:     process.env.GMAIL_CLIENT_ID,
            clientSecret: process.env.GMAIL_CLIENT_SECRET,
            refreshToken: process.env.GMAIL_REFRESH_TOKEN,
            accessToken,
          },
        });
      }
    } catch (err) {
      console.warn("[emailService] OAuth2 token invalid — using App Password fallback:", err.message);
    }
  }

  // ── Method 2: App Password (fallback) ────────────────────────────────
  if (process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  throw new Error("No Gmail credentials found. Set GMAIL_REFRESH_TOKEN or GMAIL_APP_PASSWORD in .env");
};

/* ──────────────────────────────────────────────────────────────────────────────
   sendOTPEmail
   Clean minimal transactional template — modelled on GitHub / Vercel / Google.
   Simple HTML = low spam score. Complex gradient tables = high spam score.
   ────────────────────────────────────────────────────────────────────────────── */
const sendOTPEmail = async (toEmail, otp, name = "User") => {
  const transporter = await createTransporter();

  // ── Plain text (required — penalised if missing) ────────────────────
  const textBody = [
    `Hi ${name},`,
    ``,
    `Your GenoVault verification code is:`,
    ``,
    `    ${otp}`,
    ``,
    `This code expires in 10 minutes.`,
    `Do not share it with anyone.`,
    ``,
    `If you did not request this, you can safely ignore this email.`,
    ``,
    `Thanks,`,
    `The GenoVault Team`,
  ].join("\n");

  // ── HTML: clean single-column, no gradients, no shadows ────────────
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your GenoVault code</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
             color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:500px;">

          <!-- Brand -->
          <tr>
            <td style="padding-bottom:28px;font-size:20px;font-weight:700;color:#0d9488;">
              GenoVault
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:12px;font-size:22px;font-weight:700;color:#111827;
                        line-height:1.3;">
              Your sign-in code
            </td>
          </tr>

          <!-- Greeting + message -->
          <tr>
            <td style="padding-bottom:28px;font-size:15px;line-height:1.7;color:#374151;">
              Hi ${name},<br><br>
              Use the code below to verify your identity and sign in to GenoVault.
              This code is valid for <strong>10 minutes</strong>.
            </td>
          </tr>

          <!-- OTP box — simple, no shadows/gradients -->
          <tr>
            <td style="padding-bottom:28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#f9fafb;border:1px solid #d1d5db;
                              border-radius:8px;padding:20px 36px;text-align:center;">
                    <span style="font-size:38px;font-weight:800;letter-spacing:12px;
                                 color:#0d9488;font-family:'Courier New',monospace;">
                      ${otp}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding-bottom:32px;font-size:13px;line-height:1.6;color:#6b7280;">
              If you didn't request this code, you can safely ignore this email —
              your account is secure.
            </td>
          </tr>

          <!-- Divider + footer -->
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding-top:24px;
                        font-size:12px;color:#9ca3af;line-height:1.6;">
              This is an automated message from GenoVault.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    { name: "GenoVault", address: process.env.GMAIL_USER },
    to:      toEmail,
    subject: `${otp} is your GenoVault verification code`,
    text:    textBody,
    html:    htmlBody,
  });
};

module.exports = { sendOTPEmail };
