/**
 * PDF Receipt Generator
 *
 * Generates a professional PDF receipt using PDFKit.
 * Returns a Buffer that can be attached to an email.
 */

import PDFDocument from 'pdfkit';

export interface PdfReceiptData {
  receiptId: string;
  paymentIntentId: string;
  merchantName: string;
  customerName?: string;
  customerEmail: string;
  amount: string;
  currency: string;
  cryptoAmount?: string;
  tokenSymbol?: string;
  chainName?: string;
  txHash?: string;
  txExplorerUrl?: string;
  paymentDate: string;
  disputeUrl: string;
}

/**
 * Generate a PDF receipt and return it as a Buffer.
 */
export async function generateReceiptPdf(data: PdfReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Payment Receipt #${data.receiptId}`,
        Author: 'NodeRails',
        Subject: 'Payment Receipt',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // account for margins

    // ── Background Header Bar ──
    doc.rect(0, 0, doc.page.width, 100).fill('#0f172a');

    // ── Header Text ──
    doc.fontSize(24).fill('#ffffff').text('NodeRails', 50, 30, { width: pageWidth });
    doc.fontSize(10).fill('#94a3b8').text('PAYMENT RECEIPT', 50, 60, { width: pageWidth });

    // ── Receipt ID (right aligned in header) ──
    doc.fontSize(12).fill('#94a3b8').text(`#${data.receiptId}`, 50, 38, {
      width: pageWidth,
      align: 'right',
    });

    // ── Success Badge ──
    let y = 130;
    doc.roundedRect(50, y, 160, 28, 14).fill('#ecfdf5');
    doc.fontSize(11).fill('#059669').text('✓ Payment Confirmed', 66, y + 8);

    // ── Amount ──
    y += 55;
    const currencySymbol = getCurrencySymbol(data.currency);
    doc.fontSize(36).fill('#0f172a').text(
      `${currencySymbol}${data.amount} ${data.currency}`,
      50, y, { width: pageWidth, align: 'center' },
    );

    if (data.cryptoAmount && data.tokenSymbol) {
      y += 45;
      doc.fontSize(12).fill('#64748b').text(
        `Paid ${data.cryptoAmount} ${data.tokenSymbol}${data.chainName ? ` on ${data.chainName}` : ''}`,
        50, y, { width: pageWidth, align: 'center' },
      );
    }

    // ── Divider ──
    y += 40;
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).stroke('#e2e8f0');

    // ── Receipt Details ──
    y += 20;
    const formattedDate = new Date(data.paymentDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const details: [string, string][] = [
      ['Receipt No.', `#${data.receiptId}`],
      ['Date', formattedDate],
      ['Paid to', data.merchantName],
      ['Customer', data.customerName || data.customerEmail],
      ['Email', data.customerEmail],
    ];

    if (data.chainName) details.push(['Network', data.chainName]);
    if (data.tokenSymbol) details.push(['Token', data.tokenSymbol]);

    for (const [label, value] of details) {
      doc.fontSize(11).fill('#64748b').text(label, 50, y, { width: 150 });
      doc.fontSize(11).fill('#0f172a').text(value, 200, y, {
        width: pageWidth - 150,
        align: 'right',
      });
      y += 22;
    }

    // Transaction hash — full hash, linked to explorer
    if (data.txHash) {
      doc.fontSize(11).fill('#64748b').text('Transaction', 50, y, { width: 150 });
      if (data.txExplorerUrl) {
        doc.fontSize(10).fill('#3b82f6').text(data.txHash, 200, y, {
          width: pageWidth - 150,
          align: 'right',
          link: data.txExplorerUrl,
          underline: true,
        });
      } else {
        doc.fontSize(10).fill('#0f172a').text(data.txHash, 200, y, {
          width: pageWidth - 150,
          align: 'right',
        });
      }
      y += 22;
    }

    // ── Divider ──
    y += 10;
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).stroke('#e2e8f0');

    // ── Total ──
    y += 15;
    doc.fontSize(14).fill('#0f172a').text('Total Paid', 50, y, { width: 200 });
    doc.fontSize(14).fill('#0f172a').text(
      `${currencySymbol}${data.amount} ${data.currency}`,
      250, y, { width: pageWidth - 200, align: 'right' },
    );

    // ── Dispute Section ──
    y += 45;
    doc.roundedRect(50, y, pageWidth, 80, 6).fill('#f8fafc').stroke('#e2e8f0');

    doc.fontSize(11).fill('#334155').text(
      'Need help with this payment?',
      66, y + 14, { width: pageWidth - 32 },
    );
    doc.fontSize(10).fill('#64748b').text(
      'If you did not authorize this transaction, you can open a dispute within the timelock window. Your funds are protected by smart contract escrow.',
      66, y + 32, { width: pageWidth - 32 },
    );
    doc.fontSize(9).fill('#3b82f6').text(
      data.disputeUrl,
      66, y + 58, { width: pageWidth - 32, link: data.disputeUrl, underline: true },
    );

    // ── Footer ──
    y += 110;
    doc.fontSize(9).fill('#94a3b8').text(
      'This is a system-generated receipt and does not require a signature.',
      50, y, { width: pageWidth, align: 'center' },
    );
    doc.fontSize(9).fill('#94a3b8').text(
      'Generated by NodeRails, crypto payments infrastructure.',
      50, y + 14, { width: pageWidth, align: 'center' },
    );
    doc.fontSize(9).fill('#94a3b8').text(
      'Secured by on-chain smart contract escrow.',
      50, y + 28, { width: pageWidth, align: 'center' },
    );
    doc.fontSize(8).fill('#cbd5e1').text(
      `Payment ID: ${data.paymentIntentId}`,
      50, y + 46, { width: pageWidth, align: 'center' },
    );

    doc.end();
  });
}

// ── Helpers ──

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    INR: '₹',
  };
  return symbols[currency.toUpperCase()] ?? '';
}
