'use client';

import { useProperties } from '@/hooks/useProperties';
import { useTranslations } from '@/lib/i18n/useTranslations';
import PropertyGrid from '@/components/search/PropertyGrid';
import RecentlyViewedSection from '@/components/search/RecentlyViewedSection';

export default function Home() {
  const { properties, isLoading, error } = useProperties();
  const t = useTranslations('home');

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <RecentlyViewedSection />
      <section className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('heading')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t('subheading')}</p>

        {isLoading && <p className="text-gray-400">{t('showing', { count: '…' })}</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!isLoading && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('showing', { count: properties.length })}
            </p>
            <PropertyGrid properties={properties} />
          </>
        )}
      </section>
    </main>
  );
}
