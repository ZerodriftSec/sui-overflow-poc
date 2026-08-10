/**
 * Invoice Email HTML Template
 *
 * Professional, inline-styled email sent to customers with a link to
 * pay their invoice. Compatible with all major email clients.
 */

export interface InvoiceEmailItem {
  description: string;
  quantity: number;
  amount: string;
  currency: string;
}

export interface InvoiceTemplateData {
  /** Merchant / app name */
  merchantName: string;
  /** Invoice number (e.g. INV-00042) */
  invoiceNumber: string;
  /** Invoice total (e.g. "150.00") */
  total: string;
  /** Subtotal before tax */
  subtotal: string;
  /** Tax amount (e.g. "15.00") */
  taxAmount: string;
  /** Currency (e.g. "USD") */
  currency: string;
  /** Customer name */
  customerName?: string;
  /** Customer email */
  customerEmail: string;
  /** Line items */
  items: InvoiceEmailItem[];
  /** Optional memo */
  memo?: string;
  /** Due date (ISO string) */
  dueDate?: string;
  /** Full URL to the payment page */
  paymentUrl: string;
}

export function renderInvoiceEmail(data: InvoiceTemplateData): string {
  const formattedDueDate = data.dueDate
    ? new Date(data.dueDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const greeting = data.customerName ? `Hi ${data.customerName},` : 'Hello,';

  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${item.description}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;text-align:right;">${item.amount} ${item.currency}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">NodeRails</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Invoice from ${data.merchantName}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">${greeting}</p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              You have a new invoice <strong>${data.invoiceNumber}</strong> from <strong>${data.merchantName}</strong> for <strong>${data.total} ${data.currency}</strong>.
            </p>

            ${formattedDueDate ? `<p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Due by: <strong style="color:#374151;">${formattedDueDate}</strong></p>` : ''}

            <!-- Line items -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background-color:#f9fafb;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Item</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>

            <!-- Totals -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px;">Subtotal</td>
                <td style="padding:4px 0;color:#374151;font-size:14px;text-align:right;">${data.subtotal} ${data.currency}</td>
              </tr>
              ${Number(data.taxAmount) > 0 ? `
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px;">Tax</td>
                <td style="padding:4px 0;color:#374151;font-size:14px;text-align:right;">${data.taxAmount} ${data.currency}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0 0;color:#111827;font-size:16px;font-weight:700;border-top:1px solid #e5e7eb;">Total</td>
                <td style="padding:8px 0 0;color:#111827;font-size:16px;font-weight:700;text-align:right;border-top:1px solid #e5e7eb;">${data.total} ${data.currency}</td>
              </tr>
            </table>

            ${data.memo ? `
            <div style="background-color:#f9fafb;border-radius:8px;padding:16px;margin-bottom:32px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Note</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.5;">${data.memo}</p>
            </div>` : ''}

            <!-- CTA Button -->
            <div style="text-align:center;margin-bottom:16px;">
              <a href="${data.paymentUrl}" style="display:inline-block;background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 48px;border-radius:8px;">
                Pay Invoice
              </a>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
              You can also copy and paste this link into your browser:<br/>
              <a href="${data.paymentUrl}" style="color:#3b82f6;word-break:break-all;">${data.paymentUrl}</a>
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
