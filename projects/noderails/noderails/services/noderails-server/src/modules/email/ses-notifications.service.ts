/**
 * SES Notification Processor
 *
 * Polls an SQS queue that receives SES events (via SNS) for:
 *   - Bounces (permanent → suppress, transient → log)
 *   - Complaints (spam → suppress)
 *   - Deliveries (confirm delivered)
 *
 * SES → SNS → SQS → this poller
 */

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { getDatabaseClient } from '@noderails/database';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';

// ── SES SNS notification types ──

interface SesBounce {
  bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  bounceSubType: string;
  bouncedRecipients: Array<{
    emailAddress: string;
    action?: string;
    status?: string;
    diagnosticCode?: string;
  }>;
  timestamp: string;
}

interface SesComplaint {
  complainedRecipients: Array<{ emailAddress: string }>;
  complaintFeedbackType?: string; // 'abuse' | 'auth-failure' | 'fraud' | 'not-spam' | 'other' | 'virus'
  timestamp: string;
}

interface SesDelivery {
  timestamp: string;
  recipients: string[];
}

interface SesMail {
  messageId: string;
  source: string;
  destination: string[];
  timestamp: string;
}

interface SesNotification {
  notificationType: 'Bounce' | 'Complaint' | 'Delivery';
  mail: SesMail;
  bounce?: SesBounce;
  complaint?: SesComplaint;
  delivery?: SesDelivery;
}

// ── Poller ──

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_MESSAGES_PER_POLL = 10;
const VISIBILITY_TIMEOUT = 60; // seconds until SQS makes message visible again if not deleted

/**
 * Start the SES notification poller.
 * Returns a cleanup function to stop polling.
 */
export function startSesNotificationPoller(logger: Logger): { stop: () => void } {
  const sqsClient = new SQSClient({
    region: env.AWS_REGION,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } }
      : {}),
  });

  const queueUrl = env.SES_SQS_QUEUE_URL;
  if (!queueUrl) {
    logger.warn('SES_SQS_QUEUE_URL not configured — SES notification poller disabled');
    return { stop: () => {} };
  }

  let running = true;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!running) return;

    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: MAX_MESSAGES_PER_POLL,
          WaitTimeSeconds: 10, // long-polling
          VisibilityTimeout: VISIBILITY_TIMEOUT,
        }),
      );

      const messages = response.Messages ?? [];

      for (const message of messages) {
        if (!message.Body || !message.ReceiptHandle) continue;

        try {
          await processMessage(message.Body, logger);

          // Delete from SQS after successful processing
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        } catch (err) {
          // Log but don't delete — SQS will re-deliver after visibility timeout
          logger.error('Failed to process SES notification', {
            error: err instanceof Error ? err.message : String(err),
            messageId: message.MessageId,
          });
        }
      }
    } catch (err) {
      logger.error('SES notification SQS poll failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Schedule next poll
    if (running) {
      timeoutHandle = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  // Start polling
  logger.info('SES notification poller started', { queueUrl });
  poll();

  return {
    stop: () => {
      running = false;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      logger.info('SES notification poller stopped');
    },
  };
}

// ── Message processing ──

/**
 * Parse an SQS message body. The body is an SNS notification envelope
 * whose `Message` field is the raw SES JSON.
 */
async function processMessage(body: string, logger: Logger): Promise<void> {
  const outer = JSON.parse(body) as { Type?: string; Message?: string; TopicArn?: string };

  // SNS wraps the SES JSON in an envelope
  let notification: SesNotification;
  if (outer.Type === 'Notification' && outer.Message) {
    notification = JSON.parse(outer.Message) as SesNotification;
  } else {
    // Direct SES-to-SQS (no SNS) or already-unwrapped
    notification = outer as unknown as SesNotification;
  }

  const { notificationType, mail } = notification;
  const sesMessageId = mail.messageId;

  logger.info('Processing SES notification', {
    type: notificationType,
    sesMessageId,
  });

  switch (notificationType) {
    case 'Bounce':
      await handleBounce(notification, logger);
      break;
    case 'Complaint':
      await handleComplaint(notification, logger);
      break;
    case 'Delivery':
      await handleDelivery(notification, logger);
      break;
    default:
      logger.warn('Unknown SES notification type', { notificationType });
  }
}

// ── Bounce handling ──

async function handleBounce(notification: SesNotification, logger: Logger): Promise<void> {
  const { mail, bounce } = notification;
  if (!bounce) return;

  const db = getDatabaseClient();
  const sesMessageId = mail.messageId;

  for (const recipient of bounce.bouncedRecipients) {
    const email = recipient.emailAddress.toLowerCase();

    logger.warn('SES bounce received', {
      email,
      bounceType: bounce.bounceType,
      bounceSubType: bounce.bounceSubType,
      diagnosticCode: recipient.diagnosticCode,
      sesMessageId,
    });

    // Update the EmailDelivery record if we can find it by SES messageId
    await db.emailDelivery.updateMany({
      where: { messageId: sesMessageId },
      data: {
        status: 'BOUNCED',
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
        diagnosticCode: recipient.diagnosticCode ?? null,
        bouncedAt: new Date(bounce.timestamp),
      },
    });

    if (bounce.bounceType === 'Permanent') {
      // Permanent bounce → add to suppression list immediately
      await suppressEmail(email, 'PERMANENT_BOUNCE', buildBounceDetail(bounce, recipient), logger);
    }
    // Transient bounces are not suppressed — BullMQ's existing retry with
    // exponential backoff already handles re-delivery attempts.
    // The bounceType/bounceSubType are recorded for observability.
  }
}

function buildBounceDetail(
  bounce: SesBounce,
  recipient: SesBounce['bouncedRecipients'][number],
): string {
  const parts = [
    `type: ${bounce.bounceType}`,
    `subType: ${bounce.bounceSubType}`,
  ];
  if (recipient.diagnosticCode) parts.push(`diagnostic: ${recipient.diagnosticCode}`);
  if (recipient.status) parts.push(`status: ${recipient.status}`);
  if (recipient.action) parts.push(`action: ${recipient.action}`);
  return parts.join('; ');
}

// ── Complaint handling ──

async function handleComplaint(notification: SesNotification, logger: Logger): Promise<void> {
  const { mail, complaint } = notification;
  if (!complaint) return;

  const db = getDatabaseClient();
  const sesMessageId = mail.messageId;

  for (const recipient of complaint.complainedRecipients) {
    const email = recipient.emailAddress.toLowerCase();

    logger.warn('SES complaint received', {
      email,
      feedbackType: complaint.complaintFeedbackType,
      sesMessageId,
    });

    // Update the EmailDelivery record
    await db.emailDelivery.updateMany({
      where: { messageId: sesMessageId },
      data: {
        status: 'COMPLAINED',
        complaintType: complaint.complaintFeedbackType ?? 'unknown',
        complainedAt: new Date(complaint.timestamp),
      },
    });

    // Complaints always suppress — ISPs treat complaints seriously
    const detail = `feedbackType: ${complaint.complaintFeedbackType ?? 'unknown'}`;
    await suppressEmail(email, 'COMPLAINT', detail, logger);
  }
}

// ── Delivery confirmation ──

async function handleDelivery(notification: SesNotification, logger: Logger): Promise<void> {
  const { mail, delivery } = notification;
  if (!delivery) return;

  const db = getDatabaseClient();
  const sesMessageId = mail.messageId;

  logger.info('SES delivery confirmed', {
    sesMessageId,
    recipients: delivery.recipients,
  });

  await db.emailDelivery.updateMany({
    where: { messageId: sesMessageId },
    data: {
      status: 'DELIVERED',
      deliveredAt: new Date(delivery.timestamp),
    },
  });
}

// ── Email suppression ──

/**
 * Add an email to the global suppression list.
 * Uses upsert to avoid duplicate key errors.
 */
async function suppressEmail(
  email: string,
  reason: 'PERMANENT_BOUNCE' | 'COMPLAINT',
  detail: string,
  logger: Logger,
): Promise<void> {
  const db = getDatabaseClient();

  await db.emailSuppression.upsert({
    where: { email },
    create: { email, reason, detail },
    update: { reason, detail },
  });

  logger.warn('Email address suppressed', { email, reason });
}

/**
 * Check if an email address is on the suppression list.
 * Used by the email service before enqueuing a new send job.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const db = getDatabaseClient();
  const suppression = await db.emailSuppression.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return suppression !== null;
}
