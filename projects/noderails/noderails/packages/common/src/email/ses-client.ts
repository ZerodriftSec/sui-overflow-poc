/**
 * Amazon SES Email Client
 *
 * Thin wrapper around @aws-sdk/client-sesv2 for sending emails
 * with HTML body and optional file attachments (e.g. PDF receipts).
 *
 * Uses SESv2 SendEmail with raw MIME for attachment support.
 */

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// ── Configuration ──

export interface SesConfig {
  region: string;
  /** Leave empty to use IAM instance role (EC2) */
  accessKeyId?: string;
  /** Leave empty to use IAM instance role (EC2) */
  secretAccessKey?: string;
  fromEmail: string;
}

let cachedClient: SESv2Client | null = null;
let cachedConfig: SesConfig | null = null;

/**
 * Initialize the SES client. Call once at application startup.
 * When accessKeyId/secretAccessKey are empty, the AWS SDK
 * auto-discovers credentials from IAM instance role (EC2).
 */
export function configureSes(config: SesConfig): void {
  cachedConfig = config;
  cachedClient = new SESv2Client({
    region: config.region,
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
  });
}

function getClient(): SESv2Client {
  if (!cachedClient) {
    throw new Error('SES client not configured. Call configureSes() first.');
  }
  return cachedClient;
}

function getFromEmail(): string {
  if (!cachedConfig) {
    throw new Error('SES client not configured. Call configureSes() first.');
  }
  return cachedConfig.fromEmail;
}

// ── Attachment ──

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// ── Send Email ──

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/**
 * Build a raw MIME message with optional attachments.
 */
function buildRawMimeMessage(input: SendEmailInput, from: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: NodeRails <${from}>`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `MIME-Version: 1.0`,
  ];

  if (input.replyTo) {
    headers.push(`Reply-To: ${input.replyTo}`);
  }

  if (!input.attachments?.length) {
    // Simple HTML email — no multipart needed
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    headers.push(`Content-Transfer-Encoding: 7bit`);
    return headers.join('\r\n') + '\r\n\r\n' + input.html;
  }

  // Multipart/mixed for attachments
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];

  // HTML body part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    input.html,
  );

  // Attachment parts
  for (const attachment of input.attachments) {
    const base64Content = attachment.content.toString('base64');
    parts.push(
      `--${boundary}\r\n` +
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n` +
      `Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      base64Content,
    );
  }

  parts.push(`--${boundary}--`);

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

/**
 * Send an email via Amazon SES.
 * Supports HTML body and optional PDF attachments.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const client = getClient();
  const from = getFromEmail();

  const rawMessage = buildRawMimeMessage(input, from);

  const command = new SendEmailCommand({
    Content: {
      Raw: {
        Data: Buffer.from(rawMessage, 'utf-8'),
      },
    },
  });

  const response = await client.send(command);
  return { messageId: response.MessageId ?? '' };
}
