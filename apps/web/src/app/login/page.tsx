'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { SocialLoginButton } from '@/components/auth/SocialLoginButton';
import { type LoginInput } from '@/validations/auth.schema';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/useTranslations';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('auth');

  const handleLogin = async (data: LoginInput & { captchaToken: string }) => {
    try {
      setError(null);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || t('loginFailed'));
      }

      toast.success(t('loggedIn'));
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('loginFailed');
      setError(message);
      toast.error(message);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    try {
      setError(null);
      toast.success(`${provider} login coming soon`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('loginFailed');
      setError(message);
      toast.error(message);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('welcomeBack')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t('welcomeBackSubtitle')}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm"
          >
            {error}
          </div>
        )}

        <LoginForm onSubmit={handleLogin} />

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
          <span className="text-gray-500 dark:text-gray-400 text-sm">{t('orContinueWith')}</span>
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
        </div>

        <div className="space-y-3">
          <SocialLoginButton provider="google" onClick={() => handleSocialLogin('google')} />
          <SocialLoginButton provider="github" onClick={() => handleSocialLogin('github')} />
        </div>

        <p className="text-center text-gray-600 dark:text-gray-400 text-sm mt-6">
          {t('dontHaveAccount')}{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            {t('signUpLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
