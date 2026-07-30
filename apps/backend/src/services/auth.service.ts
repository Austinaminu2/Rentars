/**
 * Auth service — wraps Supabase Auth operations.
 *
 * Controllers should call these functions instead of touching Supabase directly.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from '@stellar/stellar-sdk';
import { supabase } from '@/config/supabase.js';
import { env } from '@/config/env.js';
import { AuthError, AuthErrorCode } from '@/types/errors.js';
import { emailService } from './email.service.js';
import { issueRefreshToken } from './refreshToken.service.js';
import { securityLogger } from './logging.service.js';
import type { ServiceResponse } from './index.js';

const VERIFICATION_TOKEN_EXPIRES_MINUTES = 24 * 60; // 24 hours

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string | undefined;
  created_at: string | undefined;
  role?: string;
}

export interface RegisterResult {
  user: AuthUser;
}

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export interface WalletChallengeResult {
  challenge: string;
  expiresAt: string;
}

export interface WalletVerifyResult {
  token: string;
  user: AuthUser;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Register a new user via Supabase Auth.
 *
 * @param email - User's email address.
 * @param password - Plain-text password (Supabase hashes it).
 * @returns ServiceResponse with the created user on success.
 */
export async function registerUser(
  email: string,
  password: string,
): Promise<ServiceResponse<RegisterResult>> {
  if (!email || !password) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      'Email and password are required',
    );
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    throw new AuthError(AuthErrorCode.USER_ALREADY_EXISTS, error.message);
  }

  if (!data.user) {
    throw new AuthError(
      AuthErrorCode.USER_NOT_FOUND,
      'Registration failed: no user returned',
    );
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_MINUTES * 60 * 1000);

  await supabase.from('users').upsert({
    id: data.user.id,
    email: data.user.email,
    email_verified: false,
    email_verification_token: tokenHash,
    email_verification_expires_at: expiresAt.toISOString(),
  });

  await emailService.sendVerificationEmail({ to: data.user.email!, token: rawToken });

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email,
    created_at: data.user.created_at,
  };

  return { success: true, data: { user } };
}

/**
 * Authenticate an existing user and issue a JWT.
 *
 * @param email - User's email address.
 * @param password - Plain-text password.
 * @returns ServiceResponse with a signed JWT and user info on success.
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<ServiceResponse<LoginResult>> {
  if (!email || !password) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      'Email and password are required',
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await securityLogger.logAuthEvent('login_failure', undefined, { email });
    throw new AuthError(AuthErrorCode.INVALID_CREDENTIALS, error.message);
  }

  if (!data.user) {
    await securityLogger.logAuthEvent('login_failure', undefined, { email });
    throw new AuthError(AuthErrorCode.USER_NOT_FOUND, 'Login failed: no user returned');
  }

  // Fetch role from users table (default to 'tenant' if not set)
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role: string = (userRow as { role?: string } | null)?.role ?? 'tenant';

  // Short-lived access token (15 minutes)
  const token = jwt.sign(
    { userId: data.user.id, role },
    env.JWT_SECRET,
    { expiresIn: '15m' },
  );

  // Long-lived refresh token stored in Redis (7 days)
  const refreshToken = await issueRefreshToken({ userId: data.user.id, role });

  await securityLogger.logAuthEvent('login_success', data.user.id, { email });

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email,
    created_at: data.user.created_at,
    role,
  };

  return { success: true, data: { token, refreshToken, user } };
}

/**
 * Generate a wallet challenge for Stellar address authentication.
 *
 * @param stellarAddress - Stellar public key (G...)
 * @returns ServiceResponse with challenge string and expiration
 */
export async function generateWalletChallenge(
  stellarAddress: string,
): Promise<ServiceResponse<WalletChallengeResult>> {
  if (!stellarAddress) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      'Stellar address is required',
    );
  }

  // Generate a random challenge
  const challenge = Keypair.random().publicKey();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const { error } = await supabase.from('wallet_challenges').insert({
    stellar_address: stellarAddress,
    challenge,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      `Failed to generate challenge: ${error.message}`,
    );
  }

  return {
    success: true,
    data: {
      challenge,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

/**
 * Verify a signed wallet challenge and issue JWT.
 *
 * @param stellarAddress - Stellar public key
 * @param challenge - Challenge string
 * @param signature - Signed challenge (base64)
 * @returns ServiceResponse with JWT and user info
 */
export async function verifyWalletChallenge(
  stellarAddress: string,
  challenge: string,
  signature: string,
): Promise<ServiceResponse<WalletVerifyResult>> {
  if (!stellarAddress || !challenge || !signature) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      'Stellar address, challenge, and signature are required',
    );
  }

  // Fetch the challenge from database
  const { data: challengeData, error: fetchError } = await supabase
    .from('wallet_challenges')
    .select('*')
    .eq('stellar_address', stellarAddress)
    .eq('challenge', challenge)
    .single();

  if (fetchError || !challengeData) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, 'Challenge not found or expired');
  }

  const dbChallenge = challengeData as {
    id: string;
    expires_at: string;
    used: boolean;
  };

  // Check expiration
  if (new Date(dbChallenge.expires_at) < new Date()) {
    throw new AuthError(AuthErrorCode.TOKEN_EXPIRED, 'Challenge has expired');
  }

  // Check if already used
  if (dbChallenge.used) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, 'Challenge has already been used');
  }

  // Verify signature
  try {
    const keypair = Keypair.fromPublicKey(stellarAddress);
    const signatureBuffer = Buffer.from(signature, 'base64');

    const isValid = keypair.verify(Buffer.from(challenge), signatureBuffer);

    if (!isValid) {
      throw new AuthError(
        AuthErrorCode.INVALID_CREDENTIALS,
        'Invalid signature',
      );
    }
  } catch (err) {
    throw new AuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      `Signature verification failed: ${String(err)}`,
    );
  }

  // Mark challenge as used
  await supabase
    .from('wallet_challenges')
    .update({ used: true })
    .eq('id', dbChallenge.id);

  // Find or create user with this Stellar address
  let { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email, created_at, role')
    .eq('stellar_address', stellarAddress)
    .single();

  if (userError || !userData) {
    // Create new user with Stellar address
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        stellar_address: stellarAddress,
        email: null,
        password_hash: null,
      })
      .select()
      .single();

    if (createError || !newUser) {
      throw new AuthError(
        AuthErrorCode.USER_NOT_FOUND,
        'Failed to create user',
      );
    }

    userData = newUser as { id: string; email: string | null; created_at: string; role: string | null };
  }

  const role = userData.role || 'tenant';

  // Issue JWT
  const token = jwt.sign(
    { userId: userData.id, role },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );

  const user: AuthUser = {
    id: userData.id,
    email: userData.email || undefined,
    created_at: userData.created_at,
    role,
  };

  return {
    success: true,
    data: { token, user },
  };
}

// ─── Password reset ───────────────────────────────────────────────────────────

const RESET_TOKEN_EXPIRES_MINUTES = 60;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Request a password reset for the given email.
 * Always returns success to prevent user enumeration — the email is only
 * sent when an account with that address actually exists.
 */
export async function requestPasswordReset(
  email: string,
): Promise<ServiceResponse<void>> {
  if (!email) {
    throw new AuthError(AuthErrorCode.INVALID_CREDENTIALS, 'Email is required');
  }

  const { data: userData } = await supabase.auth.admin.listUsers();
  const user = (userData?.users ?? []).find((u) => u.email === email.toLowerCase().trim());

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

    await supabase.from('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

    await emailService.sendPasswordResetEmail({ to: email, token: rawToken });
  }

  return { success: true };
}

/**
 * Confirm a password reset using the raw token received by email.
 * Validates the token, updates the password, consumes the token, and
 * invalidates existing sessions by updating `sessions_invalidated_at`.
 */
export async function confirmPasswordReset(
  rawToken: string,
  newPassword: string,
): Promise<ServiceResponse<void>> {
  if (!rawToken || !newPassword) {
    throw new AuthError(AuthErrorCode.INVALID_CREDENTIALS, 'Token and new password are required');
  }

  const tokenHash = hashToken(rawToken);

  const { data: tokenRow, error: fetchError } = await supabase
    .from('password_reset_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();

  if (fetchError || !tokenRow) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, 'Invalid or unknown reset token');
  }

  const row = tokenRow as {
    id: string;
    user_id: string;
    expires_at: string;
    consumed_at: string | null;
  };

  if (row.consumed_at) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, 'Reset token has already been used');
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new AuthError(AuthErrorCode.TOKEN_EXPIRED, 'Reset token has expired');
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(row.user_id, {
    password: newPassword,
  });

  if (updateError) {
    throw new AuthError(AuthErrorCode.INVALID_CREDENTIALS, updateError.message);
  }

  await supabase
    .from('password_reset_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id);

  await supabase
    .from('users')
    .update({ sessions_invalidated_at: new Date().toISOString() })
    .eq('id', row.user_id);

  return { success: true };
}
