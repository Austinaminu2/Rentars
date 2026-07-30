import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  loginUser,
  registerUser,
  generateWalletChallenge,
  verifyWalletChallenge,
  requestPasswordReset,
  confirmPasswordReset,
} from '@/services/auth.service.js';
import { consumeRefreshToken, revokeRefreshToken } from '@/services/refreshToken.service.js';
import { securityLogger } from '@/services/logging.service.js';
import { env } from '@/config/env.js';
import { AuthError } from '@/types/errors.js';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await registerUser(email, password);
    res.status(201).json(result.data);
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    throw err;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result.data);
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    throw err;
  }
}

export async function walletChallenge(req: Request, res: Response): Promise<void> {
  try {
    const { stellar_address } = req.body;
    const result = await generateWalletChallenge(stellar_address);
    res.json(result.data);
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    throw err;
  }
}

export async function walletVerify(req: Request, res: Response): Promise<void> {
  try {
    const { stellar_address, challenge, signature } = req.body;
    const result = await verifyWalletChallenge(stellar_address, challenge, signature);
    res.json(result.data);
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    throw err;
  }
}

export async function requestReset(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  await requestPasswordReset(email);
  res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
}

export async function confirmReset(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body;
  await confirmPasswordReset(token, password);
  res.json({ message: 'Password updated successfully. Please log in with your new password.' });
}

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken: string }
 * Returns new access token + rotated refresh token.
 */
export async function refreshAccessToken(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'refreshToken is required' } });
    return;
  }

  const result = await consumeRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Refresh token is invalid or expired' } });
    return;
  }

  const { userId, role, newRefreshToken } = result;

  const newAccessToken = jwt.sign({ userId, role }, env.JWT_SECRET, { expiresIn: '15m' });

  res.json({ token: newAccessToken, refreshToken: newRefreshToken });
}

/**
 * POST /api/v1/auth/logout
 * Body: { refreshToken: string }
 * Revokes the refresh token so it cannot be used again.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  // Log the logout event if user is identified via access token header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], env.JWT_SECRET) as { userId?: string };
      if (decoded.userId) {
        await securityLogger.logAuthEvent('logout', decoded.userId);
      }
    } catch {
      // token may be expired — still allow logout
    }
  }

  res.json({ message: 'Logged out successfully.' });
}
