/**
 * Refresh token service.
 *
 * Refresh tokens are opaque random strings stored in Redis with a TTL.
 * They are used to issue new short-lived access tokens without re-authentication.
 *
 * Key format: refresh:<hashedToken>
 * Value: JSON { userId, role }
 * TTL: REFRESH_TOKEN_TTL_SECONDS (7 days)
 */

import crypto from 'crypto';
import { redisClient } from '@/config/redis.js';

const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const KEY_PREFIX = 'refresh:';

export interface RefreshTokenPayload {
  userId: string;
  role: string;
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Issue a new refresh token for the given user and store it in Redis.
 * Returns the raw (un-hashed) token to send to the client once.
 */
export async function issueRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = hashToken(raw);

  await redisClient.set(
    `${KEY_PREFIX}${hash}`,
    JSON.stringify(payload),
    { EX: REFRESH_TOKEN_TTL_SECONDS },
  );

  return raw;
}

/**
 * Validate a raw refresh token.
 * Returns the stored payload on success, or null if the token is invalid/expired.
 * Rotates the token (deletes old, issues new) for one-time use semantics.
 */
export async function consumeRefreshToken(
  raw: string,
): Promise<(RefreshTokenPayload & { newRefreshToken: string }) | null> {
  const hash = hashToken(raw);
  const key = `${KEY_PREFIX}${hash}`;

  const stored = await redisClient.get(key);
  if (!stored) return null;

  let payload: RefreshTokenPayload;
  try {
    payload = JSON.parse(stored) as RefreshTokenPayload;
  } catch {
    return null;
  }

  // Delete old token (one-time use)
  await redisClient.del(key);

  // Rotate: issue a new refresh token
  const newRefreshToken = await issueRefreshToken(payload);

  return { ...payload, newRefreshToken };
}

/**
 * Revoke a specific refresh token (logout).
 */
export async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = hashToken(raw);
  await redisClient.del(`${KEY_PREFIX}${hash}`);
}

/**
 * Revoke all refresh tokens for a user by scanning Redis.
 * Use after password reset to force full re-login on all devices.
 * Note: This is O(n) on the number of refresh tokens; keep TTL short enough.
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  // Scan for matching keys — limited blast radius since prefix is specific
  const keys: string[] = [];
  for await (const key of redisClient.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 100 })) {
    keys.push(key);
  }

  await Promise.all(
    keys.map(async (key) => {
      const raw = await redisClient.get(key);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as RefreshTokenPayload;
        if (payload.userId === userId) {
          await redisClient.del(key);
        }
      } catch {
        // ignore malformed entries
      }
    }),
  );
}
