/**
 * Dispute Email Templates
 *
 * HTML templates for dispute lifecycle notifications:
 * 1. Dispute Raised — sent to customer when they file a dispute
 * 2. Dispute Resolved — sent to customer when admin resolves
 */

// ── Types ──

export interface DisputeRaisedTemplateData {
  disputeId: string;
  paymentIntentId: string;
  reason: string;
  deadline: string;
  merchantName?: string;
  amount?: string;
  currency?: string;
}

export interface DisputeResolvedTemplateData {
  disputeId: string;
  paymentIntentId: string;
  winner: 'MERCHANT' | 'CUSTOMER';
  merchantName?: string;
  amount?: string;
  currency?: string;
  resolvedAt: string;
}

// ── Dispute Raised ──

export function renderDisputeRaisedEmail(data: DisputeRaisedTemplateData): string {
  const deadlineDate = new Date(data.deadline).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

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
            <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Dispute Notification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background-color:#fef3c7;border:2px solid #f59e0b;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
                <span style="font-size:28px;">⚠️</span>
              </div>
            </div>

            <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:600;text-align:center;">
              Dispute Filed Successfully
            </h2>

            <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
              Your dispute has been submitted and is now under review by the platform administrator.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;width:120px;">Dispute ID</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-family:monospace;word-break:break-all;">${data.disputeId}</td>
                    </tr>
                    ${data.amount ? `<tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Amount</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">$${data.amount} ${data.currency ?? 'USD'}</td>
                    </tr>` : ''}
                    ${data.merchantName ? `<tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Merchant</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.merchantName}</td>
                    </tr>` : ''}
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Review Deadline</td>
                      <td style="padding:4px 0;color:#dc2626;font-size:13px;font-weight:600;">${deadlineDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="margin:0 0 4px;color:#0369a1;font-size:12px;font-weight:600;">Your Reason</p>
              <p style="margin:0;color:#0c4a6e;font-size:13px;line-height:1.5;">${data.reason}</p>
            </div>

            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
              You will receive another email once the dispute has been reviewed and resolved.
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

// ── Dispute Resolved ──

export function renderDisputeResolvedEmail(data: DisputeResolvedTemplateData): string {
  const isMerchantWin = data.winner === 'MERCHANT';
  const resolvedDate = new Date(data.resolvedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const outcomeColor = isMerchantWin ? '#dc2626' : '#16a34a';
  const outcomeBg = isMerchantWin ? '#fef2f2' : '#f0fdf4';
  const outcomeBorder = isMerchantWin ? '#fecaca' : '#bbf7d0';
  const outcomeIcon = isMerchantWin ? '❌' : '✅';
  const outcomeText = isMerchantWin
    ? 'The dispute was resolved in favor of the merchant. The payment will be settled to the merchant.'
    : 'The dispute was resolved in your favor. The payment has been refunded to your wallet.';

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
            <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Dispute Resolution</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:48px;">${outcomeIcon}</span>
            </div>

            <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:600;text-align:center;">
              Dispute Resolved
            </h2>

            <div style="background-color:${outcomeBg};border:1px solid ${outcomeBorder};border-radius:8px;padding:16px;margin-bottom:20px;">
              <p style="margin:0;color:${outcomeColor};font-size:14px;line-height:1.6;text-align:center;">
                ${outcomeText}
              </p>
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;width:120px;">Dispute ID</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-family:monospace;word-break:break-all;">${data.disputeId}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Outcome</td>
                      <td style="padding:4px 0;color:${outcomeColor};font-size:13px;font-weight:600;">${isMerchantWin ? 'Merchant Wins' : 'Customer Wins (Refunded)'}</td>
                    </tr>
                    ${data.amount ? `<tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Amount</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">$${data.amount} ${data.currency ?? 'USD'}</td>
                    </tr>` : ''}
                    ${data.merchantName ? `<tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Merchant</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.merchantName}</td>
                    </tr>` : ''}
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;font-size:12px;">Resolved At</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;">${resolvedDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
              If you have questions about this resolution, please contact the merchant directly.
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
