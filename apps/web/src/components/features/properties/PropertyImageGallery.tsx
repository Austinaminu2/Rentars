'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PropertyImage } from '@/types/property';

interface PropertyImageGalleryProps {
  images: PropertyImage[];
  title: string;
}

/**
 * Carousel + thumbnail strip + lightbox for property images.
 *
 * Performance strategy:
 * - Hero (index 0): `priority` + `fetchpriority="high"` — included in the
 *   browser preload scan for fast first paint, no lazy boundary.
 * - All other carousel positions: `loading="lazy"` — fetched only when the
 *   user navigates to them.
 * - Thumbnail strip: `loading="lazy"` + small `sizes` hint — browser fetches
 *   the cheapest variant from the srcset.
 * - Lightbox: always renders the current image at full resolution (`sizes="100vw"`)
 *   with `loading="eager"` because the user explicitly requested it.
 *
 * Layout-shift prevention:
 * - The carousel wrapper has a fixed aspect ratio (`aspect-[16/9]` with min/max
 *   constraints) so the space is reserved before any image arrives.
 * - Thumbnail buttons have explicit `w-16 h-12` so the strip height is stable.
 * - `next/image` always emits width/height attributes, eliminating the blank
 *   flash from unsized `<img>` tags.
 */
export default function PropertyImageGallery({ images, title }: PropertyImageGalleryProps) {
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });
  const urls = sorted.map((img) => img.url);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const goToPrevious = () =>
    setCurrentIndex((prev) => (prev === 0 ? urls.length - 1 : prev - 1));

  const goToNext = () =>
    setCurrentIndex((prev) => (prev === urls.length - 1 ? 0 : prev + 1));

  // Keyboard navigation when lightbox is open.
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      else if (e.key === 'ArrowRight') goToNext();
      else if (e.key === 'Escape') setIsLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // currentIndex intentionally omitted — handlers close over setters, not stale index
  }, [isLightboxOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!urls.length) {
    return (
      <div
        className="w-full h-96 bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center"
        aria-label="No images available"
      >
        <p className="text-gray-500 dark:text-gray-400">No images available</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Main carousel ─────────────────────────────────────────────────── */}
      {/*
        Fixed h-96 preserves the exact same space as before so the surrounding
        layout (description, amenities, sidebar) does not shift.
      */}
      <div className="relative w-full h-96 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group">
        {urls.map((src, idx) => {
          const isHero = idx === 0;
          const isVisible = idx === currentIndex;

          return (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-300 ${
                isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              aria-hidden={!isVisible}
            >
              <Image
                src={src}
                alt={`${title} — image ${idx + 1}`}
                fill
                // Only the hero image is prioritised; every other slide lazy-loads.
                priority={isHero}
                loading={isHero ? 'eager' : 'lazy'}
                // Two-thirds of viewport on desktop; full viewport on mobile.
                sizes="(min-width: 1024px) 66vw, 100vw"
                className="object-cover cursor-pointer"
                data-testid={isHero ? 'gallery-hero-image' : `gallery-image-${idx}`}
              />
            </div>
          );
        })}

        {/* Invisible overlay captures click to open lightbox */}
        <button
          type="button"
          className="absolute inset-0 w-full h-full"
          aria-label="Open image lightbox"
          onClick={() => setIsLightboxOpen(true)}
        />

        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-900/80 hover:bg-white dark:hover:bg-gray-900 p-2 rounded-full opacity-0 group-hover:opacity-100 transition z-10"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-900/80 hover:bg-white dark:hover:bg-gray-900 p-2 rounded-full opacity-0 group-hover:opacity-100 transition z-10"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Dot indicators */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10"
          role="tablist"
          aria-label="Image navigation"
        >
          {urls.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === currentIndex}
              aria-label={`Go to image ${idx + 1}`}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
              className={`w-2 h-2 rounded-full transition ${
                idx === currentIndex ? 'bg-white' : 'bg-white/50'
              }`}
            />
          ))}
        </div>

        {/* Image counter */}
        <span className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">
          {currentIndex + 1} / {urls.length}
        </span>
      </div>

      {/* ── Thumbnail strip ───────────────────────────────────────────────── */}
      {urls.length > 1 && (
        <div
          className="flex gap-2 mt-2 overflow-x-auto pb-1"
          role="list"
          aria-label="Image thumbnails"
        >
          {urls.map((src, idx) => (
            <button
              key={idx}
              type="button"
              role="listitem"
              onClick={() => setCurrentIndex(idx)}
              className={`relative flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition ${
                idx === currentIndex
                  ? 'border-blue-500'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              aria-label={`View image ${idx + 1}`}
              aria-current={idx === currentIndex ? 'true' : undefined}
            >
              {/*
                Thumbnails: small 64 px slots, lazy-loaded, served from the
                smallest srcset variant via the tight `sizes` hint.
              */}
              <Image
                src={src}
                alt={`${title} thumbnail ${idx + 1}`}
                fill
                loading="lazy"
                sizes="64px"
                className="object-cover"
                data-testid={`gallery-thumbnail-${idx}`}
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 text-white hover:bg-white/20 p-2 rounded-full transition"
            aria-label="Close lightbox"
          >
            <X size={32} />
          </button>

          <button
            type="button"
            onClick={goToPrevious}
            className="absolute left-4 text-white hover:bg-white/20 p-2 rounded-full transition"
            aria-label="Previous image"
          >
            <ChevronLeft size={32} />
          </button>

          {/*
            Lightbox shows the full-resolution image.
            - `loading="eager"`: user explicitly opened this — no deferral.
            - `sizes="100vw"`: browser picks the largest srcset candidate.
            - `fill` + constrained parent: Next.js handles intrinsic sizing.
          */}
          <div className="relative max-w-4xl w-full max-h-[90vh] aspect-video mx-8">
            <Image
              src={urls[currentIndex]}
              alt={`${title} — image ${currentIndex + 1}`}
              fill
              loading="eager"
              sizes="(min-width: 1280px) 896px, 100vw"
              className="object-contain"
              data-testid="gallery-lightbox-image"
            />
          </div>

          <button
            type="button"
            onClick={goToNext}
            className="absolute right-4 text-white hover:bg-white/20 p-2 rounded-full transition"
            aria-label="Next image"
          >
            <ChevronRight size={32} />
          </button>

          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded">
            {currentIndex + 1} / {urls.length}
          </span>
        </div>
      )}
    </>
  );
}
