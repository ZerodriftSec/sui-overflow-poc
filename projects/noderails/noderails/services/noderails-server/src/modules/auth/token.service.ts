import jwt from 'jsonwebtoken';
import { AUTH_CONFIG } from '@noderails/common';
import type { JwtPayload } from '@noderails/service-base';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signAccessToken(
  merchantId: string,
  email: string,
  role: string,
  secret: string,
): string {
  return jwt.sign(
    { sub: merchantId, email, role, type: 'access' } satisfies Omit<JwtPayload, 'iat' | 'exp'>,
    secret,
    { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL },
  );
}

export function signRefreshToken(
  merchantId: string,
  email: string,
  role: string,
  secret: string,
): string {
  return jwt.sign(
    { sub: merchantId, email, role, type: 'refresh' } satisfies Omit<JwtPayload, 'iat' | 'exp'>,
    secret,
    { expiresIn: AUTH_CONFIG.REFRESH_TOKEN_TTL },
  );
}

export function signTokenPair(
  merchantId: string,
  email: string,
  role: string,
  accessSecret: string,
  refreshSecret: string,
): TokenPair {
  return {
    accessToken: signAccessToken(merchantId, email, role, accessSecret),
    refreshToken: signRefreshToken(merchantId, email, role, refreshSecret),
  };
}

export function verifyRefreshToken(token: string, secret: string): JwtPayload {
  const payload = jwt.verify(token, secret) as JwtPayload;
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return payload;
}
