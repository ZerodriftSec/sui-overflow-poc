import { createHash } from 'crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { FeedbackType } from '@noderails/database';
import { asyncHandler, created, validate } from '@noderails/service-base';
import { ValidationError } from '@noderails/common';
import { env } from '../../config.js';
import * as feedbackService from './feedback.service.js';

const router: express.Router = Router();

const createFeedbackSchema = z.object({
  type: z.nativeEnum(FeedbackType),
  email: z.string().email().max(254),
  message: z.string().min(10).max(2000),
  source: z.string().max(100).optional(),
  website: z.string().max(0).optional(), // honeypot field; should remain empty
});

router.post(
  '/',
  validate(createFeedbackSchema),
  asyncHandler(async (req, res) => {
    const { type, email, message, source, website } = req.body;

    if (website && website.length > 0) {
      throw new ValidationError('Invalid submission');
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]?.trim()
      : req.ip ?? '';

    const ipHash = ip
      ? createHash('sha256').update(`${ip}:${env.JWT_SECRET}`).digest('hex')
      : undefined;

    const userAgentRaw = req.headers['user-agent'];
    const userAgent = typeof userAgentRaw === 'string'
      ? userAgentRaw.slice(0, 500)
      : undefined;

    const feedback = await feedbackService.createFeedbackSubmission({
      type,
      email,
      message,
      source,
      ipHash,
      userAgent,
    });

    created(res, {
      id: feedback.id,
      status: feedback.status,
      message: 'Feedback submitted successfully',
    });
  }),
);

export default router;
