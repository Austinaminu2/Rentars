'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/validations/auth.schema';
import { useState, useCallback } from 'react';
import { Mail, Lock, Loader } from 'lucide-react';
import { HCaptcha } from './HCaptcha';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface LoginFormProps {
  onSubmit: (data: LoginInput & { captchaToken: string }) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [captchaError, setCaptchaError] = useState<string>('');
  const t = useTranslations('auth');

  const captchaEnabled =
    process.env.NEXT_PUBLIC_HCAPTCHA_ENABLED !== 'false' &&
    !!process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaError('');
  }, []);

  const onCaptchaExpire = useCallback(() => {
    setCaptchaToken('');
  }, []);

  const onSubmitHandler = async (data: LoginInput) => {
    if (captchaEnabled && !captchaToken) {
      setCaptchaError(t('captchaRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ ...data, captchaToken });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-4" noValidate>
      {/* Email */}
      <div>
        <label
          htmlFor="login-email"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {t('emailLabel')}
        </label>
        <div className="relative">
          <Mail
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
            aria-hidden="true"
          />
          <input
            {...register('email')}
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            aria-invalid={errors.email ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.email && (
          <p id="login-email-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {t('passwordLabel')}
        </label>
        <div className="relative">
          <Lock
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
            aria-hidden="true"
          />
          <input
            {...register('password')}
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            aria-invalid={errors.password ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.password && (
          <p id="login-password-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* CAPTCHA */}
      <div>
        <HCaptcha onVerify={onCaptchaVerify} onExpire={onCaptchaExpire} />
        {captchaError && (
          <p role="alert" className="text-red-500 text-sm mt-1">
            {captchaError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium flex items-center justify-center gap-2 min-h-[44px]"
        aria-busy={isSubmitting}
      >
        {isSubmitting && <Loader size={18} className="animate-spin" aria-hidden="true" />}
        {isSubmitting ? t('signingIn') : t('signIn')}
      </button>
    </form>
  );
}
