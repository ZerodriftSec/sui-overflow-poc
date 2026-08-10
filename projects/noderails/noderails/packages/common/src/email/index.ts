/**
 * @noderails/common — Email utilities
 *
 * SES client, HTML receipt template, and PDF receipt generator.
 */

export { configureSes, sendEmail } from './ses-client.js';
export type { SesConfig, SendEmailInput, EmailAttachment } from './ses-client.js';

export { renderReceiptEmail } from './receipt-template.js';
export type { ReceiptTemplateData } from './receipt-template.js';

export { renderOtpEmail } from './otp-template.js';
export type { OtpTemplateData } from './otp-template.js';

export { generateReceiptPdf } from './receipt-pdf.js';
export type { PdfReceiptData } from './receipt-pdf.js';

export { renderInvoiceEmail } from './invoice-template.js';
export type { InvoiceTemplateData, InvoiceEmailItem } from './invoice-template.js';

export { renderDisputeRaisedEmail, renderDisputeResolvedEmail } from './dispute-template.js';
export type { DisputeRaisedTemplateData, DisputeResolvedTemplateData } from './dispute-template.js';
