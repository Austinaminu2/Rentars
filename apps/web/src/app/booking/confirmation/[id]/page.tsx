'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  AlertCircle,
  CalendarDays,
  Users,
  MapPin,
  ArrowLeft,
  Download,
  ExternalLink,
} from 'lucide-react';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import BookingLifecycleActions from '@/components/booking/BookingLifecycleActions';
import type { Booking, BookingWithProperty } from '@/types/booking';
import { normaliseStatus } from '@/types/booking';
import { format, differenceInCalendarDays } from 'date-fns';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string) {
  return format(new Date(iso), 'MMM d, yyyy');
}

function nightCount(checkIn: string, checkOut: string) {
  return differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading booking details">
      <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
    </div>
  );
}

// ─── Info row helper ───────────────────────────────────────────────────────────
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

// ─── Status-aware message banner ───────────────────────────────────────────────
function StatusBanner({ status }: { status: string }) {
  const s = normaliseStatus(status);

  const configs: Record<string, { bg: string; text: string; message: string } | undefined> = {
    pending: {
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-200',
      message:
        'Your booking is pending. Once your host accepts and you confirm check-in, the escrow will be released.',
    },
    confirmed: {
      bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      message:
        'Booking confirmed. After your stay, mark it as completed to release payment to the host.',
    },
    completed: {
      bg: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      message: 'Your stay is complete. Payment has been released to the host. Thanks for using Rentars!',
    },
    cancelled: {
      bg: 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700',
      text: 'text-gray-700 dark:text-gray-300',
      message: 'This booking has been cancelled and the escrow has been refunded.',
    },
    disputed: {
      bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      message:
        'A dispute is open on this booking. Our team will review and resolve it. Funds are held until resolution.',
    },
  };

  const cfg = configs[s];
  if (!cfg) return null;

  return (
    <div
      role="status"
      className={`rounded-xl border p-4 flex items-start gap-3 ${cfg.bg}`}
    >
      <AlertCircle size={18} className={`flex-shrink-0 mt-0.5 ${cfg.text}`} aria-hidden="true" />
      <p className={`text-sm ${cfg.text}`}>{cfg.message}</p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function BookingConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<BookingWithProperty | null>(null);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  // ── Fetch booking ────────────────────────────────────────────────────────
  const fetchBooking = useCallback(async () => {
    if (!id) return;
    setFetchLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/bookings/${id}`, {
        headers: authHeaders(),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error ?? 'Booking not found');
        return;
      }

      const data = (await res.json()) as Booking;

      // Fetch property details
      let property: BookingWithProperty['property'] | undefined;
      if (data.property_id) {
        const propRes = await fetch(
          `${API_BASE}/api/v1/properties/${data.property_id}`,
          { headers: authHeaders() },
        );
        if (propRes.ok) {
          const propData = await propRes.json();
          property = {
            id:       propData.id,
            title:    propData.title,
            city:     propData.city,
            country:  propData.country,
            address:  propData.address,
            images:   propData.images,
            slug:     propData.slug,
            owner_id: propData.owner_id,
          };
        }
      }

      setBooking({ ...data, property });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load booking');
    } finally {
      setFetchLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  // ── Handle lifecycle update ───────────────────────────────────────────────
  const handleBookingUpdated = useCallback(
    (updated: Booking) => {
      setBooking((prev) => (prev ? { ...prev, ...updated } : null));
    },
    [],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (fetchLoading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton />
        </div>
      </main>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (fetchError || !booking) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10">
        <div className="max-w-2xl mx-auto px-4">
          <div
            role="alert"
            className="flex items-start gap-3 p-5 rounded-xl border border-red-200 dark:border-red-800
              bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
          >
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not load booking</p>
              <p className="text-sm mt-1">{fetchError ?? 'Booking not found.'}</p>
              <button
                onClick={fetchBooking}
                className="mt-3 text-sm underline hover:no-underline focus:outline-none"
              >
                Try again
              </button>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ArrowLeft size={15} /> Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const status = normaliseStatus(booking.status);
  const nights = booking.check_in && booking.check_out
    ? nightCount(booking.check_in, booking.check_out)
    : null;

  const propertyHref = booking.property?.slug
    ? `/property/${booking.property.slug}`
    : booking.property_id
      ? `/property/${booking.property_id}`
      : undefined;

  const coverImage = booking.property?.images?.[0];

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10">
      <div className="max-w-2xl mx-auto px-4 space-y-6">

        {/* ── Back link ──────────────────────────────────────────────────── */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200 transition"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          My bookings
        </Link>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Booking details</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">{booking.id}</p>
          </div>
          <BookingStatusBadge status={booking.status} className="text-sm px-3 py-1" />
        </div>

        {/* ── Status banner ──────────────────────────────────────────────── */}
        <StatusBanner status={booking.status} />

        {/* ── Property card ──────────────────────────────────────────────── */}
        <section
          aria-label="Property"
          className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden
            bg-white dark:bg-gray-900 shadow-sm"
        >
          {coverImage && (
            <div className="h-44 bg-gray-100 dark:bg-gray-800 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImage}
                alt={booking.property?.title ?? 'Property'}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {booking.property?.title ?? 'Property'}
                </h2>
                {(booking.property?.city || booking.property?.country) && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={13} aria-hidden="true" />
                    {[booking.property?.city, booking.property?.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              {propertyHref && (
                <Link
                  href={propertyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-blue-600 dark:text-blue-400 hover:underline
                    text-sm flex items-center gap-1"
                  aria-label="View property listing"
                >
                  View listing <ExternalLink size={13} aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow
                icon={<CalendarDays size={16} />}
                label="Check in"
                value={booking.check_in ? formatDate(booking.check_in) : '—'}
              />
              <InfoRow
                icon={<CalendarDays size={16} />}
                label="Check out"
                value={booking.check_out ? formatDate(booking.check_out) : '—'}
              />
              <InfoRow
                icon={<Users size={16} />}
                label="Guests"
                value={booking.guest_count ?? '—'}
              />
              {nights !== null && (
                <InfoRow
                  icon={<CalendarDays size={16} />}
                  label="Duration"
                  value={`${nights} night${nights !== 1 ? 's' : ''}`}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Payment summary ─────────────────────────────────────────────── */}
        <section
          aria-label="Payment summary"
          className="rounded-xl border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-900 shadow-sm p-5 space-y-3"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Payment</h2>
          <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>Total charged</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {booking.total_price?.toFixed(2) ?? '—'} USDC
            </span>
          </div>
          {booking.escrow_id && (
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Escrow ID</span>
              <span className="font-mono truncate max-w-[160px]">{booking.escrow_id}</span>
            </div>
          )}
          {booking.on_chain_id && (
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>On-chain ID</span>
              <span className="font-mono">{booking.on_chain_id}</span>
            </div>
          )}
        </section>

        {/* ── Dispute reason (if disputed) ────────────────────────────────── */}
        {status === 'disputed' && booking.dispute_reason && (
          <section
            aria-label="Dispute details"
            className="rounded-xl border border-red-200 dark:border-red-800
              bg-red-50 dark:bg-red-950/30 p-5"
          >
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
              Dispute reason
            </h2>
            <p className="text-sm text-red-700 dark:text-red-400">{booking.dispute_reason}</p>
          </section>
        )}

        {/* ── Lifecycle actions ───────────────────────────────────────────── */}
        <section aria-label="Booking actions">
          <BookingLifecycleActions booking={booking} onBookingUpdated={handleBookingUpdated} />
        </section>

        {/* ── Downloads ──────────────────────────────────────────────────── */}
        {(status === 'confirmed' || status === 'completed') && (
          <section
            aria-label="Downloads"
            className="rounded-xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-900 shadow-sm p-5 flex flex-wrap gap-3"
          >
            <a
              href={`${API_BASE}/api/v1/bookings/${booking.id}/receipt.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300
                dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-800 transition
                focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <Download size={15} aria-hidden="true" />
              Download receipt (PDF)
            </a>
            <a
              href={`${API_BASE}/api/v1/bookings/${booking.id}/calendar.ics`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300
                dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-800 transition
                focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <CalendarDays size={15} aria-hidden="true" />
              Add to calendar (.ics)
            </a>
          </section>
        )}

        {/* ── Footer timeline ─────────────────────────────────────────────── */}
        <footer className="text-xs text-gray-400 dark:text-gray-600 pb-10">
          Booking created:{' '}
          {booking.created_at ? formatDate(booking.created_at) : '—'}
        </footer>

      </div>
    </main>
  );
}
