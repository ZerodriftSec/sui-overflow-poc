/**
 * OTP Email HTML Template
 *
 * Clean, inline-styled email for sending 6-digit verification codes.
 * Compatible with all major email clients.
 */

export interface OtpTemplateData {
  code: string;
  expiresInMinutes: number;
}

export function renderOtpEmail(data: OtpTemplateData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">NodeRails</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Email Verification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              Enter the following verification code to confirm your email address:
            </p>
            <!-- OTP Code -->
            <div style="text-align:center;margin:32px 0;">
              <div style="display:inline-block;background-color:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:20px 40px;">
                <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#15803d;font-family:'Courier New',monospace;">${data.code}</span>
              </div>
            </div>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-align:center;">
              This code expires in <strong>${data.expiresInMinutes} minutes</strong>.
            </p>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
              If you didn't create a NodeRails account, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
              &copy; ${new Date().getFullYear()} NodeRails | Crypto Payment Infrastructure
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
