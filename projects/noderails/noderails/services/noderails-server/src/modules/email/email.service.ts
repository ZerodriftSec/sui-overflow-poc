/**
 * Email Service
 *
 * Enqueues email jobs for the email worker to process.
 * Currently supports payment receipt emails.
 */

import { getDatabaseClient } from '@noderails/database';
import { QUEUE_NAMES, CHAIN_DEFINITIONS, NotFoundError, AuthorizationError, ValidationError } from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import { isEmailSuppressed } from './ses-notifications.service.js';
import { env } from '../../config.js';

// ── Chain ID → chain definition lookup ──

const CHAIN_BY_ID = Object.fromEntries(
  Object.values(CHAIN_DEFINITIONS).map((c) => [c.chainId, c]),
) as Record<number, (typeof CHAIN_DEFINITIONS)[keyof typeof CHAIN_DEFINITIONS]>;

/**
 * Enqueue a payment receipt email to the customer.
 *
 * Called after a payment is captured. Loads payment + customer data
 * from the database, creates an EmailDelivery tracking record, and
 * enqueues an EMAIL_SEND job with 10 retries spread across ~24 hours.
 *
 * Retry schedule (exponential backoff, base 180 s):
 *   1→3m  2→6m  3→12m  4→24m  5→48m  6→1.6h  7→3.2h  8→6.4h  9→12.8h  ≈24h total
 */
export async function enqueueReceiptEmail(paymentIntentId: string): Promise<void> {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { name: true } },
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!intent) return;

  // Must have a customer with an email
  const customerEmail = intent.customerAccount?.email;
  if (!customerEmail) return;

  // Check global suppression list (permanent bounce or complaint)
  if (await isEmailSuppressed(customerEmail)) return;

  // Create a tracking record so we can observe delivery status per transaction
  const delivery = await db.emailDelivery.create({
    data: {
      paymentIntentId: intent.id,
      templateId: 'payment-receipt',
      recipientEmail: customerEmail,
      status: 'PENDING',
    },
  });

  const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);

  await queue.add(
    `receipt-${paymentIntentId}`,
    {
      templateId: 'payment-receipt',
      to: customerEmail,
      variables: {
        paymentIntentId: intent.id,
        emailDeliveryId: delivery.id,
      },
    },
    {
      // 10 attempts with exponential backoff starting at 3 min — spreads retries across ~24 hours
      attempts: 10,
      backoff: { type: 'exponential', delay: 180_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

// ── Enqueue Invoice Email ──

/**
 * Enqueue an invoice payment email to the customer.
 *
 * Transitions the invoice to OPEN status (if DRAFT), loads invoice +
 * customer data, creates an EmailDelivery tracking record, and
 * enqueues an EMAIL_SEND job.
 */
export async function enqueueInvoiceEmail(merchantId: string, invoiceId: string): Promise<void> {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      app: { select: { name: true, merchantId: true } },
      items: { include: { taxRate: true } },
      taxRate: true,
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  if (invoice.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  if (invoice.status === 'PAID') throw new ValidationError('Invoice is already paid');
  if (invoice.status === 'VOID') throw new ValidationError('Invoice is voided');

  const customerEmail = invoice.customerAccount?.email;
  if (!customerEmail) throw new ValidationError('Customer has no email address');

  // Check global suppression list
  if (await isEmailSuppressed(customerEmail)) {
    throw new ValidationError('Customer email is suppressed (bounced or complained)');
  }

  // Transition DRAFT → OPEN
  if (invoice.status === 'DRAFT') {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'OPEN' } });
  }

  // Create tracking record
  const delivery = await db.emailDelivery.create({
    data: {
      invoiceId: invoice.id,
      templateId: 'invoice-payment',
      recipientEmail: customerEmail,
      status: 'PENDING',
    },
  });

  const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);

  await queue.add(
    `invoice-${invoiceId}`,
    {
      templateId: 'invoice-payment',
      to: customerEmail,
      variables: {
        invoiceId: invoice.id,
        emailDeliveryId: delivery.id,
      },
    },
    {
      attempts: 10,
      backoff: { type: 'exponential', delay: 180_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}
