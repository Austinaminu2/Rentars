'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Share2, CheckCircle, XCircle, Clock } from 'lucide-react';
import PropertyImageGallery from './PropertyImageGallery';
import PropertyMap from './PropertyMap';
import PropertyCalendar from './PropertyCalendar';
import PropertyReviewsSection from './PropertyReviewsSection';
import FollowButton from './FollowButton';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatCurrency } from '@/lib/i18n/formatting';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import type { Property } from '@/types/property';

interface PropertyDetailProps {
  property: Property & {
    amenities?: string[];
    description_full?: string;
    host_name?: string;
    host_id?: string;
    host_image?: string;
    reviews?: Array<{ id: string; author: string; rating: number; comment: string; date: string }>;
    average_rating?: number;
    blocked_dates?: string[];
    latitude?: number;
    longitude?: number;
    // House rules
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    events_allowed?: boolean;
    quiet_hours_start?: string | null;
    quiet_hours_end?: string | null;
    additional_rules?: string | null;
  };
}

export default function PropertyDetail({ property }: PropertyDetailProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);

  const t = useTranslations('property');
  const { locale } = useLocale();
  const { recordView } = useRecentlyViewed();

  useEffect(() => {
    recordView(property.id);
  }, [property.id, recordView]);

  const amenities = property.amenities || [
    'WiFi',
    'Kitchen',
    'Parking',
    'Air Conditioning',
    'Heating',
    'Washer',
  ];

  const canUseNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleShare = (platform: string) => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `Check out this property: ${property.title}`;

    if (platform === 'native') {
      navigator.share({ title: property.title, text, url }).catch(() => {});
      setShowShareMenu(false);
      return;
    }

    const shareUrls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      copy: url,
    };

    if (platform === 'copy') {
      navigator.clipboard.writeText(url);
      alert(t('linkCopied'));
    } else {
      window.open(shareUrls[platform], '_blank');
    }
    setShowShareMenu(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header with title and actions */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">{property.title}</h1>
          <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" />
            {property.location}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`p-2 rounded-full border transition ${
              isFavorite
                ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700'
                : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart size={24} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-600 dark:text-gray-400'} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="p-2 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label="Share property"
              aria-expanded={showShareMenu}
              aria-haspopup="menu"
            >
              <Share2 size={24} className="text-gray-600 dark:text-gray-400" aria-hidden="true" />
            </button>
            {showShareMenu && (
              <div
                role="menu"
                aria-label="Share options"
                className="absolute right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10"
              >
                <button
                  role="menuitem"
                  onClick={() => handleShare('twitter')}
                  className="block w-full text-left px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t('shareOnTwitter')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleShare('facebook')}
                  className="block w-full text-left px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t('shareOnFacebook')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleShare('copy')}
                  className="block w-full text-left px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t('copyLink')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Main content */}
        <div className="col-span-2 space-y-8">
          {/* Image Gallery */}
          <PropertyImageGallery images={property.images} title={property.title} />

          {/* Description */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('about')}</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {expandedDescription ? property.description_full || property.description : property.description}
            </p>
            {property.description_full && property.description_full.length > 200 && (
              <button
                onClick={() => setExpandedDescription(!expandedDescription)}
                className="text-blue-600 dark:text-blue-400 hover:underline mt-2"
              >
                {expandedDescription ? t('showLess') : t('showMore')}
              </button>
            )}
          </div>

          {/* Amenities */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('amenities')}</h2>
            <div className="grid grid-cols-2 gap-4">
              {amenities.map((amenity) => (
                <div key={amenity} className="flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-600" />
                  <span className="text-gray-700 dark:text-gray-300">{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* House Rules */}
          {(property.pets_allowed !== undefined ||
            property.smoking_allowed !== undefined ||
            property.events_allowed !== undefined ||
            property.quiet_hours_start ||
            property.additional_rules) && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700" data-testid="house-rules-section">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">House rules</h2>
              <ul className="space-y-3 mb-4">
                <li className="flex items-center gap-3">
                  {property.pets_allowed ? (
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle size={20} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-gray-700 dark:text-gray-300">
                    Pets {property.pets_allowed ? 'allowed' : 'not allowed'}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  {property.smoking_allowed ? (
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle size={20} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-gray-700 dark:text-gray-300">
                    Smoking {property.smoking_allowed ? 'allowed' : 'not allowed'}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  {property.events_allowed ? (
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle size={20} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-gray-700 dark:text-gray-300">
                    Events / parties {property.events_allowed ? 'allowed' : 'not allowed'}
                  </span>
                </li>
                {property.quiet_hours_start && property.quiet_hours_end && (
                  <li className="flex items-center gap-3">
                    <Clock size={20} className="text-blue-500 flex-shrink-0" aria-hidden="true" />
                    <span className="text-gray-700 dark:text-gray-300">
                      Quiet hours: {property.quiet_hours_start} – {property.quiet_hours_end}
                    </span>
                  </li>
                )}
              </ul>
              {property.additional_rules && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Additional rules</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                    {property.additional_rules}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Map */}
          <div>
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('location')}</h2>
            <PropertyMap
              location={property.location}
              latitude={property.latitude}
              longitude={property.longitude}
            />
          </div>

          {/* Calendar */}
          <div>
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('availability')}</h2>
            <PropertyCalendar blockedDates={property.blocked_dates} />
          </div>

          {/* Reviews */}
          <div>
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('reviews')}</h2>
            <PropertyReviewsSection
              reviews={property.reviews as Parameters<typeof PropertyReviewsSection>[0]['reviews']}
              averageRating={property.average_rating}
            />
          </div>

          {/* Host Info */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('meetHost')}</h2>
            <div className="flex items-center gap-4">
              {property.host_image && (
                <div className="relative w-16 h-16 flex-shrink-0">
                  <Image
                    src={property.host_image}
                    alt={property.host_name ?? 'Host'}
                    fill
                    sizes="64px"
                    className="rounded-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-lg text-gray-900 dark:text-white">{property.host_name || 'Host'}</p>
                <p className="text-gray-600 dark:text-gray-400">{t('verifiedHost')}</p>
              </div>
              {/* Follow / unfollow the host — uses host_id when available,
                  falls back to owner_id from the property row */}
              {(property.host_id || property.owner_id) && (
                <FollowButton
                  hostId={(property.host_id || property.owner_id) as string}
                  className="ml-auto"
                />
              )}
            </div>
          </div>
        </div>

        {/* Booking Sidebar */}
        <div className="col-span-1">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700 sticky top-8">
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(property.price_per_night, locale)}
                </span>
                <span className="text-gray-600 dark:text-gray-400">{t('perNight')}</span>
              </div>
            </div>

            <Link
              href={`/booking?propertyId=${property.id}`}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 mb-4 text-center block min-h-[44px] flex items-center justify-center"
            >
              {t('bookNow')}
            </Link>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('cleaningFee')}</span>
                <span className="text-gray-900 dark:text-gray-100">{formatCurrency(50, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('serviceFee')}</span>
                <span className="text-gray-900 dark:text-gray-100">{formatCurrency(25, locale)}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-semibold">
                <span className="text-gray-900 dark:text-gray-100">{t('total')}</span>
                <span className="text-gray-900 dark:text-gray-100">{formatCurrency(property.price_per_night + 75, locale)}</span>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm text-blue-900 dark:text-blue-200">
              <p className="font-semibold mb-2">{t('blockchainVerified')}</p>
              <p>{t('blockchainNote')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
