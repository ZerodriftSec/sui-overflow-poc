import { getDatabaseClient } from '@noderails/database';
import { generateApiKey, hashApiKey, NotFoundError } from '@noderails/common';
import * as appService from '../apps/app.service.js';

// ── Create API Key ──

interface CreateApiKeyInput {
  merchantId: string;
  appId: string;
  name?: string;
  type: 'PUBLIC' | 'SECRET';
}

export async function createApiKey(input: CreateApiKeyInput) {
  await appService.getApp(input.merchantId, input.appId);

  const db = getDatabaseClient();
  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);

  const envLabel = app.environment === 'PRODUCTION' ? 'live' : 'test';
  const rawKey = generateApiKey(input.type === 'PUBLIC' ? 'pk' : 'sk', envLabel);
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.split('_').slice(0, 3).join('_');

  const apiKey = await db.apiKey.create({
    data: {
      appId: input.appId,
      name: input.name ?? 'Default',
      keyHash,
      keyPrefix,
      type: input.type,
    },
    select: { id: true, name: true, keyPrefix: true, type: true, createdAt: true },
  });

  // Raw key only returned at creation time
  return { ...apiKey, key: rawKey };
}

// ── List API Keys ──

export async function listApiKeys(merchantId: string, appId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  return db.apiKey.findMany({
    where: { appId },
    select: {
      id: true, name: true, keyPrefix: true, type: true,
      active: true, lastUsedAt: true, expiresAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Revoke API Key ──

export async function revokeApiKey(merchantId: string, appId: string, keyId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  const apiKey = await db.apiKey.findUnique({ where: { id: keyId } });
  if (!apiKey || apiKey.appId !== appId) {
    throw new NotFoundError('ApiKey', keyId);
  }

  await db.apiKey.update({ where: { id: keyId }, data: { active: false } });
}
