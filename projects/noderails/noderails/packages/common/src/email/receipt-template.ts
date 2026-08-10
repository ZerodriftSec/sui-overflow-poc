/**
 * Payment Receipt HTML Email Template
 *
 * Professional, responsive email template for payment receipts.
 * Uses inline styles (email client compatible) with a clean design.
 */

export interface ReceiptTemplateData {
  /** Short receipt ID (first 8 chars of UUID) */
  receiptId: string;
  /** Full payment intent ID */
  paymentIntentId: string;

  /** Merchant / app name */
  merchantName: string;

  /** Customer name (if available) */
  customerName?: string;
  /** Customer email */
  customerEmail: string;

  /** Fiat amount (e.g. "10.00") */
  amount: string;
  /** Fiat currency (e.g. "USD") */
  currency: string;

  /** Crypto amount paid (human readable, e.g. "10.50") */
  cryptoAmount?: string;
  /** Token symbol (e.g. "USDC") */
  tokenSymbol?: string;
  /** Chain name (e.g. "Ethereum") */
  chainName?: string;

  /** On-chain transaction hash */
  txHash?: string;
  /** Block explorer URL for the tx */
  txExplorerUrl?: string;

  /** Payment date (ISO string) */
  paymentDate: string;

  /** Dispute URL */
  disputeUrl: string;

  /** Platform fee amount (human readable) if applicable */
  platformFee?: string;
}

/**
 * Render a professional HTML receipt email.
 */
export function renderReceiptEmail(data: ReceiptTemplateData): string {
  const formattedDate = new Date(data.paymentDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const customerDisplay = data.customerName || data.customerEmail;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - #${data.receiptId}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 40px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">NodeRails</h1>
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">Payment Receipt</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Success Badge -->
          <tr>
            <td style="padding: 32px 40px 0 40px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: #ecfdf5; border-radius: 24px; padding: 8px 20px;">
                    <span style="color: #059669; font-size: 14px; font-weight: 600;">&#10003; Payment Confirmed</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Amount -->
          <tr>
            <td style="padding: 24px 40px 8px 40px; text-align: center;">
              <p style="margin: 0; font-size: 40px; font-weight: 700; color: #0f172a; letter-spacing: -1px;">
                ${formatCurrencySymbol(data.currency)}${data.amount}
                <span style="font-size: 18px; font-weight: 500; color: #64748b;"> ${data.currency}</span>
              </p>
              ${data.cryptoAmount && data.tokenSymbol ? `
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #64748b;">
                Paid ${data.cryptoAmount} ${data.tokenSymbol}${data.chainName ? ` on ${data.chainName}` : ''}
              </p>
              ` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 24px 40px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>

          <!-- Receipt Details -->
          <tr>
            <td style="padding: 0 40px;">

              <!-- Details Table -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${receiptRow('Receipt No.', `#${data.receiptId}`)}
                ${receiptRow('Date', formattedDate)}
                ${receiptRow('Paid to', data.merchantName)}
                ${receiptRow('Customer', customerDisplay)}
                ${data.txHash ? receiptRow('Transaction', data.txExplorerUrl
                  ? `<a href="${data.txExplorerUrl}" style="color: #3b82f6; text-decoration: none; font-family: monospace; font-size: 12px; word-break: break-all;">${data.txHash}</a>`
                  : `<span style="font-family: monospace; font-size: 12px; word-break: break-all;">${data.txHash}</span>`,
                ) : ''}
                ${data.chainName ? receiptRow('Network', data.chainName) : ''}
                ${data.tokenSymbol ? receiptRow('Token', data.tokenSymbol) : ''}
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 24px 40px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; font-size: 16px; font-weight: 700; color: #0f172a;">Total Paid</td>
                  <td style="padding: 8px 0; font-size: 16px; font-weight: 700; color: #0f172a; text-align: right;">
                    ${formatCurrencySymbol(data.currency)}${data.amount} ${data.currency}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dispute Section -->
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #334155;">Need help with this payment?</p>
                    <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                      If you didn't authorize this transaction or believe there's an issue, you can open a dispute within the timelock window. Your funds are protected by smart contract escrow.
                    </p>
                    <a href="${data.disputeUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 13px; font-weight: 600;">
                      Open Dispute
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 40px 40px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">
                This is a system-generated receipt and does not require a signature.
              </p>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">
                Generated by NodeRails, crypto payments infrastructure.
              </p>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">
                Secured by on-chain smart contract escrow.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 11px; color: #cbd5e1;">
                Payment ID: ${data.paymentIntentId}
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Helpers ──

function receiptRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; font-size: 14px; color: #64748b; vertical-align: top; width: 35%;">${label}</td>
      <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500;">${value}</td>
    </tr>`;
}

function formatCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    INR: '₹',
  };
  return symbols[currency.toUpperCase()] ?? '';
}
