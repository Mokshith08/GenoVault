const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

/**
 * createTransporter
 * Builds a Nodemailer transporter using Gmail OAuth2.
 */
const createTransporter = async () => {
  const oauth2Client = new OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const { token: accessToken } = await oauth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken,
    },
  });
};

/**
 * sendOTPEmail
 * Sends a professional OTP email with both HTML and plain-text parts.
 * Including plain-text is one of the biggest spam-score reducers.
 */
const sendOTPEmail = async (toEmail, otp, name = "User") => {
  const transporter = await createTransporter();

  const year = new Date().getFullYear();

  // ── Plain text version (critical for inbox delivery) ──────
  const textBody = `
Hi ${name},

Your GenoVault login verification code is:

  ${otp}

This code expires in 10 minutes.
Do not share this code with anyone.

If you did not request this, please ignore this email.

— The GenoVault Team
  `.trim();

  // ── HTML version ──────────────────────────────────────────
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>GenoVault OTP</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);padding:36px 48px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="width:52px;height:52px;background:rgba(255,255,255,0.2);
                                border-radius:14px;display:inline-block;line-height:52px;
                                font-size:26px;margin-bottom:14px;">🔬</div>
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;
                                letter-spacing:-0.5px;">GenoVault</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;
                               font-weight:400;">Secure Genomic Data Platform</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:44px 48px 32px;">
              <p style="margin:0 0 6px;font-size:16px;color:#1e293b;font-weight:600;">
                Hi ${name},
              </p>
              <p style="margin:0 0 32px;font-size:14px;color:#64748b;line-height:1.7;">
                Use the verification code below to complete your sign-in to GenoVault.
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;margin-bottom:32px;">
                <tr>
                  <td align="center" style="padding:28px 24px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94a3b8;
                               text-transform:uppercase;letter-spacing:1.5px;">
                      Your verification code
                    </p>
                    <p style="margin:0;font-size:44px;font-weight:800;color:#0d9488;
                               letter-spacing:14px;font-family:'Courier New',monospace;">
                      ${otp}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#92400e;">
                      ⏱ &nbsp;This code is valid for <strong>10 minutes</strong> only.
                      Do not share it with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                If you didn't try to sign in, you can safely ignore this email.
                Your account remains secure.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 48px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 48px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
                © ${year} GenoVault · Secure Genomic Collaboration
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1;">
                This is an automated security notification from GenoVault.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const mailOptions = {
    from: {
      name: "GenoVault Security",
      address: process.env.GMAIL_USER,
    },
    replyTo: process.env.GMAIL_USER,
    to: toEmail,
    subject: `${otp} is your GenoVault verification code`,
    text: textBody,   // ← Plain text (major inbox factor)
    html: htmlBody,
    headers: {
      // Prevents "via" label in Gmail which triggers spam
      "X-Mailer": "GenoVault Mailer 1.0",
      // Helps Gmail categorise as transactional, not promotional
      "X-Entity-Ref-ID": `genovault-otp-${Date.now()}`,
      "Precedence": "bulk",
      // Required by modern spam filters for automated mail
      "List-Unsubscribe": `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOTPEmail };
