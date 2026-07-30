'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/validations/auth.schema';
import { useState, useCallback } from 'react';
import { User, Mail, Lock, Loader } from 'lucide-react';
import { HCaptcha } from './HCaptcha';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface RegisterFormProps {
  onSubmit: (data: RegisterInput & { captchaToken: string }) => Promise<void>;
}

export function RegisterForm({ onSubmit }: RegisterFormProps) {
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
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaError('');
  }, []);

  const onCaptchaExpire = useCallback(() => {
    setCaptchaToken('');
  }, []);

  const onSubmitHandler = async (data: RegisterInput) => {
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
      {/* Full Name */}
      <div>
        <label
          htmlFor="register-name"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {t('fullNameLabel')}
        </label>
        <div className="relative">
          <User
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
            aria-hidden="true"
          />
          <input
            {...register('name')}
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            aria-describedby={errors.name ? 'register-name-error' : undefined}
            aria-invalid={errors.name ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.name && (
          <p id="register-name-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="register-email"
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
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            aria-invalid={errors.email ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.email && (
          <p id="register-email-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label
          htmlFor="register-password"
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
            id="register-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-describedby={errors.password ? 'register-password-error' : undefined}
            aria-invalid={errors.password ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.password && (
          <p id="register-password-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label
          htmlFor="register-confirm-password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {t('confirmPasswordLabel')}
        </label>
        <div className="relative">
          <Lock
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
            aria-hidden="true"
          />
          <input
            {...register('confirmPassword')}
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-describedby={
              errors.confirmPassword ? 'register-confirm-password-error' : undefined
            }
            aria-invalid={errors.confirmPassword ? 'true' : undefined}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {errors.confirmPassword && (
          <p
            id="register-confirm-password-error"
            role="alert"
            className="text-red-500 text-sm mt-1"
          >
            {errors.confirmPassword.message}
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
        {isSubmitting ? t('creatingAccount') : t('createAccount')}
      </button>
    </form>
  );
}
