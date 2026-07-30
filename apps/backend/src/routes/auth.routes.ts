import { Router } from 'express';
import { login, register, requestReset, confirmReset, refreshAccessToken, logout } from '@/controllers/auth.controller.js';
import { walletChallenge, walletVerify } from '@/controllers/wallet.controller.js';
import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  confirmPasswordResetSchema,
  walletChallengeSchema,
  walletVerifySchema,
  validateBody,
} from '@/validators/auth.validator.js';
import { authRateLimiter } from '@/middleware/rateLimiter.js';
import { captchaMiddleware } from '@/middleware/captcha.middleware.js';

const router = Router();

// POST /api/v1/auth/register — CAPTCHA required
router.post('/register', authRateLimiter, validateBody(registerSchema), captchaMiddleware, register);

// POST /api/v1/auth/login — CAPTCHA required
router.post('/login', authRateLimiter, validateBody(loginSchema), captchaMiddleware, login);

// POST /api/v1/auth/refresh — rotate access token using refresh token
router.post('/refresh', authRateLimiter, refreshAccessToken);

// POST /api/v1/auth/logout — revoke refresh token
router.post('/logout', logout);

// POST /api/v1/auth/password-reset/request — CAPTCHA required
router.post('/password-reset/request', authRateLimiter, validateBody(requestPasswordResetSchema), captchaMiddleware, requestReset);

// POST /api/v1/auth/password-reset/confirm
router.post('/password-reset/confirm', authRateLimiter, validateBody(confirmPasswordResetSchema), confirmReset);

router.post('/wallet/challenge', authRateLimiter, validateBody(walletChallengeSchema), walletChallenge);
router.post('/wallet/verify', authRateLimiter, validateBody(walletVerifySchema), walletVerify);

export default router;
