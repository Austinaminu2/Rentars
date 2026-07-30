'use client';

import Image from 'next/image';
import { Heart, Star } from 'lucide-react';
import Link from 'next/link';
import { useWishlist } from '@/hooks/useWishlist';
import { type Property, propertyPath } from '@/types/property';
import PriceDisplay from '@/components/currency/PriceDisplay';

interface PropertyCardProps {
  property: Property;
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const { isInWishlist, toggle } = useWishlist();
  const saved = isInWishlist(property.id);
  const t = useTranslations('property');

  return (
    <article className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow relative">
      {/* ── Featured badge ───────────────────────────────────────────────── */}
      {property.is_featured && (
        <div
          className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-xs font-semibold shadow"
          aria-label="Featured listing"
        >
          <Star size={11} aria-hidden="true" className="fill-amber-900" />
          Featured
        </div>
      )}

      {/* ── Wishlist toggle ──────────────────────────────────────────────── */}
      <button
        onClick={(e) => {
          e.preventDefault();
          toggle(property.id);
        }}
        className="absolute top-3 right-3 z-10 p-1.5 bg-white dark:bg-gray-800 rounded-full shadow hover:scale-110 transition-transform min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
        aria-pressed={saved}
      >
        <Heart
          size={18}
          aria-hidden="true"
          className={saved ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}
        />
      </button>

      {/* ── Card body — wrapped in a Link for navigation ─────────────────── */}
      <Link href={propertyPath(property)} className="block">
        {/* Image */}
        <div className="relative h-48 bg-gray-200 dark:bg-gray-700">
          {property.images?.[0] ? (
            <img
              src={property.images[0].url}
              alt={property.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm"
              aria-label={`No image available for ${property.title}`}
            >
              No image
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {property.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {property.location}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <PriceDisplay
              amountUsdc={property.price_per_night}
              suffix="/ night"
              size="sm"
            />
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                property.available
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              aria-label={property.available ? 'Available' : 'Booked'}
            >
              {property.available ? 'Available' : 'Booked'}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
