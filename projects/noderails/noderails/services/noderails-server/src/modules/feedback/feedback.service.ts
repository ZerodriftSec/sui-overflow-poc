import { getDatabaseClient } from '@noderails/database';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NotFoundError, ValidationError } from '@noderails/common';
import { FeedbackStatus, FeedbackType } from '@noderails/database';

const ATTACK_PATTERN = /<\s*script|javascript\s*:|onerror\s*=|onload\s*=|<\s*iframe|<\s*svg|<\s*img|union\s+select|drop\s+table|insert\s+into|delete\s+from/i;

function sanitizeText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function validateForAttack(input: string, fieldName: string): void {
  if (ATTACK_PATTERN.test(input)) {
    throw new ValidationError(`Potentially unsafe content detected in ${fieldName}`);
  }
}

interface CreateFeedbackInput {
  type: FeedbackType;
  email: string;
  message: string;
  source?: string;
  ipHash?: string;
  userAgent?: string;
}

export async function createFeedbackSubmission(input: CreateFeedbackInput) {
  const db = getDatabaseClient();

  const email = sanitizeText(input.email).toLowerCase();
  const message = sanitizeText(input.message);
  const source = input.source ? sanitizeText(input.source) : null;

  validateForAttack(email, 'email');
  validateForAttack(message, 'message');

  return db.feedbackSubmission.create({
    data: {
      type: input.type,
      email,
      message,
      source,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
    },
  });
}

export async function listFeedbackSubmissions(params: {
  page?: number;
  pageSize?: number;
  type?: FeedbackType;
  status?: FeedbackStatus;
}) {
  const db = getDatabaseClient();

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where = {
    ...(params.type ? { type: params.type } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [items, total] = await Promise.all([
    db.feedbackSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.feedbackSubmission.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus, reviewedBy: string) {
  const db = getDatabaseClient();

  const existing = await db.feedbackSubmission.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('FeedbackSubmission', id);
  }

  return db.feedbackSubmission.update({
    where: { id },
    data: {
      status,
      reviewedBy,
      reviewedAt: status === FeedbackStatus.NEW ? null : new Date(),
    },
  });
}
