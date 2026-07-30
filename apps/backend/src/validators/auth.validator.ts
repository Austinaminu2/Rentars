/**
 * Zod validators for authentication-related request bodies.
 */

import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { ValidationError } from '@/types/errors.js';

// ─── Register schema ──────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('email must be a valid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string({ required_error: 'password is required' })
    .min(12, 'password must be at least 12 characters')
    .max(128, 'password must be at most 128 characters')
    .regex(/[A-Z]/, 'password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'password must contain at least one special character'),

  name: z
    .string({ required_error: 'name is required' })
    .min(1, 'name must not be empty')
    .max(100, 'name must be at most 100 characters')
    .trim(),
});

// ─── Login schema ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('email must be a valid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password is required'),
});

// ─── Password reset schemas ───────────────────────────────────────────────────

export const requestPasswordResetSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('email must be a valid email address')
    .toLowerCase()
    .trim(),
});

export const confirmPasswordResetSchema = z.object({
  token: z.string({ required_error: 'token is required' }).min(1, 'token is required'),
  password: z
    .string({ required_error: 'password is required' })
    .min(12, 'password must be at least 12 characters')
    .max(128, 'password must be at most 128 characters')
    .regex(/[A-Z]/, 'password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'password must contain at least one special character'),
});

// ─── Wallet Challenge schema ──────────────────────────────────────────────────

export const walletChallengeSchema = z.object({
  address: z
    .string({ required_error: 'address is required' })
    .refine(
      (addr) => StrKey.isValidEd25519PublicKey(addr),
      'address must be a valid Stellar public key',
    ),
});

// ─── Wallet Verify schema ─────────────────────────────────────────────────────

export const walletVerifySchema = z.object({
  address: z
    .string({ required_error: 'address is required' })
    .refine(
      (addr) => StrKey.isValidEd25519PublicKey(addr),
      'address must be a valid Stellar public key',
    ),
  challenge: z.string({ required_error: 'challenge is required' }),
  signature: z.string({ required_error: 'signature is required' }),
});

// ─── Middleware factory ───────────────────────────────────────────────────────

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      result.error.errors.forEach((error) => {
        const field = error.path.join('.');
        if (!fields[field]) {
          fields[field] = [];
        }
        fields[field].push(error.message);
      });

      const validationError = new ValidationError('Validation failed', fields);
      next(validationError);
      return;
    }
    req.body = result.data;
    next();
  };
}
