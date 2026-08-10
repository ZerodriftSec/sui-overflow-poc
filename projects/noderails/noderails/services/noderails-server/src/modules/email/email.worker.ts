/**
 * Email Worker
 *
 * BullMQ worker that processes email send jobs.
 * Loads payment data, renders HTML + PDF, and sends via SES.
 */

import { getDatabaseClient } from '@noderails/database';
import {
  QUEUE_NAMES,
  CHAIN_DEFINITIONS,
  formatCryptoAmount,
  parseTokenKey,
  blockExplorerTxUrl,
} from '@noderails/common';
import {
  configureSes,
  sendEmail,
  renderReceiptEmail,
  generateReceiptPdf,
  renderInvoiceEmail,
  renderDisputeRaisedEmail,
  renderDisputeResolvedEmail,
} from '@noderails/common/email';
import type { InvoiceEmailItem } from '@noderails/common/email';
import { createWorker, configureQueue } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';

// ── Chain ID → chain definition lookup ──

const CHAIN_BY_ID = Object.fromEntries(
  Object.values(CHAIN_DEFINITIONS).map((c) => [c.chainId, c]),
) as Record<number, (typeof CHAIN_DEFINITIONS)[keyof typeof CHAIN_DEFINITIONS]>;

/**
 * Process a payment-receipt email job.
 */
async function processReceiptEmail(
  paymentIntentId: string,
  to: string,
  logger: Logger,
): Promise<{ messageId: string }> {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { name: true } },
      customerAccount: { select: { email: true, name: true } },
      transactions: {
        where: { type: 'CAPTURE', status: 'CONFIRMED' },
        take: 1,
        orderBy: { confirmedAt: 'desc' },
      },
    },
  });

  if (!intent) {
    logger.warn('Payment intent not found for receipt email', { paymentIntentId });
    throw new Error(`Payment intent ${paymentIntentId} not found for receipt email`);
  }

  const receiptId = intent.id.slice(0, 8).toUpperCase();
  const merchantName = intent.app.name;
  const customerName = intent.customerAccount?.name ?? undefined;
  const customerEmail = to;

  // Parse chain info
  const chainDef = intent.authorizationChainId
    ? CHAIN_BY_ID[intent.authorizationChainId]
    : undefined;
  const chainName = chainDef?.name;

  // Parse token info
  let tokenSymbol: string | undefined;
  if (intent.cryptoTokenKey) {
    const parsed = parseTokenKey(intent.cryptoTokenKey);
    if (parsed) {
      tokenSymbol = parsed.symbol;
    }
  }

  // Format crypto amount
  let cryptoAmount: string | undefined;
  if (intent.cryptoAmount && intent.cryptoTokenDecimals != null) {
    cryptoAmount = formatCryptoAmount(intent.cryptoAmount, intent.cryptoTokenDecimals);
  }

  // Transaction hash
  const captureTx = intent.transactions[0];
  const txHash = captureTx?.txHash ?? intent.captureTxHash ?? undefined;

  // Explorer URL
  let txExplorerUrl: string | undefined;
  if (txHash && intent.authorizationChainId != null) {
    txExplorerUrl = blockExplorerTxUrl(intent.authorizationChainId, txHash) ?? undefined;
  }

  // Payment date
  const paymentDate = (intent.capturedAt ?? intent.createdAt).toISOString();

  // Dispute URL
  const disputeUrl = `${env.PAYMENT_UI_URL}/dispute/${intent.id}`;

  // Fiat amount
  const amount = Number(intent.amount).toFixed(2);
  const currency = intent.currency;

  // ── Template data ──
  const templateData = {
    receiptId,
    paymentIntentId: intent.id,
    merchantName,
    customerName,
    customerEmail,
    amount,
    currency,
    cryptoAmount,
    tokenSymbol,
    chainName,
    txHash,
    txExplorerUrl,
    paymentDate,
    disputeUrl,
  };

  // ── Render HTML ──
  const html = renderReceiptEmail(templateData);

  // ── Generate PDF ──
  const pdfBuffer = await generateReceiptPdf(templateData);

  // ── Send Email ──
  const result = await sendEmail({
    to: customerEmail,
    subject: `Payment Receipt: #${receiptId}`,
    html,
    attachments: [
      {
        filename: `receipt-${receiptId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  logger.info('Receipt email sent', {
    paymentIntentId: intent.id,
    to: customerEmail,
    messageId: result.messageId,
  });

  return result;
}

/**
 * Process an invoice payment email job.
 */
async function processInvoiceEmail(
  invoiceId: string,
  to: string,
  logger: Logger,
): Promise<{ messageId: string }> {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      app: { select: { name: true } },
      items: true,
      taxRate: true,
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found for email`);
  }

  const merchantName = invoice.app.name;
  const customerName = invoice.customerAccount?.name ?? undefined;
  const paymentUrl = `${env.PAYMENT_UI_URL}/invoice/${invoice.id}`;

  const items: InvoiceEmailItem[] = invoice.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    amount: Number(item.amount).toFixed(2),
    currency: item.currency ?? invoice.currency,
  }));

  const html = renderInvoiceEmail({
    merchantName,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total).toFixed(2),
    subtotal: Number(invoice.subtotal).toFixed(2),
    taxAmount: Number(invoice.taxAmount).toFixed(2),
    currency: invoice.currency,
    customerName,
    customerEmail: to,
    items,
    memo: invoice.memo ?? undefined,
    dueDate: invoice.dueDate?.toISOString(),
    paymentUrl,
  });

  const result = await sendEmail({
    to,
    subject: `Request to Pay Invoice ${invoice.invoiceNumber} from ${merchantName}`,
    html,
  });

  logger.info('Invoice email sent', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    to,
    messageId: result.messageId,
  });

  return result;
}

/**
 * Start the email worker.
 * Call once at application startup.
 */
export function startEmailWorker(logger: Logger) {
  // Configure SES client
  configureSes({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    fromEmail: env.SES_FROM_EMAIL,
  });

  configureQueue({ redisUrl: env.REDIS_URL });

  const db = getDatabaseClient();

  const MAX_ATTEMPTS = 10;

  const worker = createWorker<EmailSendJob>(
    QUEUE_NAMES.EMAIL_SEND,
    async (job) => {
      const { templateId, to, variables } = job.data;
      const emailDeliveryId = variables.emailDeliveryId as string | undefined;

      logger.info('Processing email job', {
        templateId,
        to,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        emailDeliveryId,
      });

      // Increment attempt counter in DB
      if (emailDeliveryId) {
        await db.emailDelivery.update({
          where: { id: emailDeliveryId },
          data: { attempts: { increment: 1 } },
        });
      }

      try {
        switch (templateId) {
          case 'payment-receipt': {
            const paymentIntentId = variables.paymentIntentId as string;
            const result = await processReceiptEmail(paymentIntentId, to, logger);

            // Mark as SENT in DB
            if (emailDeliveryId) {
              await db.emailDelivery.update({
                where: { id: emailDeliveryId },
                data: {
                  status: 'SENT',
                  messageId: result.messageId,
                  sentAt: new Date(),
                  lastError: null,
                },
              });
            }
            break;
          }

          case 'invoice-payment': {
            const invoiceId = variables.invoiceId as string;
            const result = await processInvoiceEmail(invoiceId, to, logger);

            if (emailDeliveryId) {
              await db.emailDelivery.update({
                where: { id: emailDeliveryId },
                data: {
                  status: 'SENT',
                  messageId: result.messageId,
                  sentAt: new Date(),
                  lastError: null,
                },
              });
            }
            break;
          }

          case 'dispute-raised': {
            const html = renderDisputeRaisedEmail({
              disputeId: variables.disputeId as string,
              paymentIntentId: variables.paymentIntentId as string,
              reason: variables.reason as string,
              deadline: variables.deadline as string,
              merchantName: variables.merchantName as string | undefined,
              amount: variables.amount as string | undefined,
              currency: variables.currency as string | undefined,
            });
            const result = await sendEmail({
              to,
              subject: 'Dispute Filed: NodeRails Payment',
              html,
            });
            logger.info('Dispute raised email sent', { to, messageId: result.messageId });
            break;
          }

          case 'dispute-resolved': {
            const html = renderDisputeResolvedEmail({
              disputeId: variables.disputeId as string,
              paymentIntentId: variables.paymentIntentId as string,
              winner: variables.winner as 'MERCHANT' | 'CUSTOMER',
              merchantName: variables.merchantName as string | undefined,
              amount: variables.amount as string | undefined,
              currency: variables.currency as string | undefined,
              resolvedAt: variables.resolvedAt as string,
            });
            const result = await sendEmail({
              to,
              subject: 'Dispute Resolved: NodeRails Payment',
              html,
            });
            logger.info('Dispute resolved email sent', { to, messageId: result.messageId });
            break;
          }

          default:
            logger.warn('Unknown email template', { templateId });
        }
      } catch (err) {
        // Record the error for this attempt
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (emailDeliveryId) {
          await db.emailDelivery.update({
            where: { id: emailDeliveryId },
            data: { lastError: errorMessage },
          }).catch((dbErr) => {
            logger.error('Failed to update EmailDelivery error', { emailDeliveryId, dbErr });
          });
        }
        // Re-throw so BullMQ counts this as a failed attempt and retries
        throw err;
      }
    },
    {
      concurrency: 5,
    },
    {
      // Called on every failed attempt (including retries and final failure)
      onFailed: async (job, err) => {
        const emailDeliveryId = job.data.variables?.emailDeliveryId as string | undefined;
        const isAllRetriesExhausted = job.attemptsMade >= MAX_ATTEMPTS;

        logger.error('Email job failed', {
          jobId: job.id,
          attempt: job.attemptsMade,
          maxAttempts: MAX_ATTEMPTS,
          permanent: isAllRetriesExhausted,
          error: err.message,
          emailDeliveryId,
        });

        // When all retries are exhausted, mark the delivery as permanently FAILED
        if (isAllRetriesExhausted && emailDeliveryId) {
          await db.emailDelivery.update({
            where: { id: emailDeliveryId },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              lastError: err.message,
            },
          }).catch((dbErr) => {
            logger.error('Failed to mark EmailDelivery as FAILED', { emailDeliveryId, dbErr });
          });
        }
      },
    },
  );

  logger.info('Email worker started');
  return worker;
}
