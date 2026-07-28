'use client';

import type { ListingFormData } from '../types';
import { formStyles } from '../styles';

interface PricingStepProps {
  formData: Partial<ListingFormData>;
  setFormData: (data: Partial<ListingFormData>) => void;
  errors: Record<string, string>;
}

export default function PricingStep({ formData, setFormData, errors }: PricingStepProps) {
  return (
    <div className="space-y-6">
      {/* ── Capacity ───────────────────────────────────────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">Capacity</legend>

        <div className="grid grid-cols-3 gap-4 mt-2">
          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="maxGuests">
              Max Guests
            </label>
            <input
              id="maxGuests"
              type="number"
              min="1"
              value={formData.maxGuests ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, maxGuests: parseInt(e.target.value, 10) || 1 })
              }
              placeholder="1"
              className={formStyles.input}
            />
            {errors.maxGuests && <p className={formStyles.error}>{errors.maxGuests}</p>}
          </div>

          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="bedrooms">
              Bedrooms
            </label>
            <input
              id="bedrooms"
              type="number"
              min="0"
              value={formData.bedrooms ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, bedrooms: parseInt(e.target.value, 10) || 0 })
              }
              placeholder="0"
              className={formStyles.input}
            />
            {errors.bedrooms && <p className={formStyles.error}>{errors.bedrooms}</p>}
          </div>

          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="bathrooms">
              Bathrooms
            </label>
            <input
              id="bathrooms"
              type="number"
              min="0"
              value={formData.bathrooms ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, bathrooms: parseInt(e.target.value, 10) || 0 })
              }
              placeholder="0"
              className={formStyles.input}
            />
            {errors.bathrooms && <p className={formStyles.error}>{errors.bathrooms}</p>}
          </div>
        </div>
      </fieldset>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <div className={formStyles.formGroup}>
        <label className={formStyles.label} htmlFor="pricePerNight">
          Price per Night (USDC)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">$</span>
          <input
            id="pricePerNight"
            type="number"
            value={formData.pricePerNight || ''}
            onChange={(e) => setFormData({ ...formData, pricePerNight: Number(e.target.value) })}
            placeholder="0"
            min="10"
            className={formStyles.input}
          />
        </div>
        {errors.pricePerNight && <p className={formStyles.error}>{errors.pricePerNight}</p>}
      </div>

      <div className={formStyles.formGroup}>
        <label className={formStyles.label} htmlFor="cleaningFee">
          Cleaning Fee (USDC)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">$</span>
          <input
            id="cleaningFee"
            type="number"
            value={formData.cleaningFee || ''}
            onChange={(e) => setFormData({ ...formData, cleaningFee: Number(e.target.value) })}
            placeholder="0"
            min="0"
            className={formStyles.input}
          />
        </div>
        {errors.cleaningFee && <p className={formStyles.error}>{errors.cleaningFee}</p>}
      </div>

      <div className={formStyles.formGroup}>
        <label className={formStyles.label} htmlFor="serviceFee">
          Service Fee (USDC)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">$</span>
          <input
            id="serviceFee"
            type="number"
            value={formData.serviceFee || ''}
            onChange={(e) => setFormData({ ...formData, serviceFee: Number(e.target.value) })}
            placeholder="0"
            min="0"
            className={formStyles.input}
          />
        </div>
        {errors.serviceFee && <p className={formStyles.error}>{errors.serviceFee}</p>}
      </div>

      {/* ── Stay Length ────────────────────────────────────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">Stay Length</legend>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="minNights">
              Minimum Nights
            </label>
            <input
              id="minNights"
              type="number"
              min="1"
              value={formData.minNights ?? 1}
              onChange={(e) =>
                setFormData({ ...formData, minNights: Math.max(1, parseInt(e.target.value, 10) || 1) })
              }
              className={formStyles.input}
            />
            {errors.minNights && <p className={formStyles.error}>{errors.minNights}</p>}
          </div>
          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="maxNights">
              Maximum Nights (leave blank for no limit)
            </label>
            <input
              id="maxNights"
              type="number"
              min="1"
              value={formData.maxNights ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1);
                setFormData({ ...formData, maxNights: val });
              }}
              placeholder="No limit"
              className={formStyles.input}
            />
            {errors.maxNights && <p className={formStyles.error}>{errors.maxNights}</p>}
          </div>
        </div>
      </fieldset>

      {/* ── Check-in / Check-out Times ──────────────────────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">Check-in / Check-out Times</legend>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="checkInTime">
              Check-in Time
            </label>
            <input
              id="checkInTime"
              type="time"
              value={formData.checkInTime ?? '15:00'}
              onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
              className={formStyles.input}
            />
            {errors.checkInTime && <p className={formStyles.error}>{errors.checkInTime}</p>}
          </div>
          <div className={formStyles.formGroup}>
            <label className={formStyles.label} htmlFor="checkOutTime">
              Check-out Time
            </label>
            <input
              id="checkOutTime"
              type="time"
              value={formData.checkOutTime ?? '11:00'}
              onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
              className={formStyles.input}
            />
            {errors.checkOutTime && <p className={formStyles.error}>{errors.checkOutTime}</p>}
          </div>
        </div>
      </fieldset>

      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-sm font-semibold mb-2">Summary</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Max Guests:</span>
            <span>{formData.maxGuests ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Per Night:</span>
            <span>${formData.pricePerNight || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Cleaning Fee:</span>
            <span>${formData.cleaningFee || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Service Fee:</span>
            <span>${formData.serviceFee || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Min Stay:</span>
            <span>{formData.minNights ?? 1} night{(formData.minNights ?? 1) !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex justify-between">
            <span>Max Stay:</span>
            <span>{formData.maxNights ? `${formData.maxNights} nights` : 'No limit'}</span>
          </div>
          <div className="flex justify-between">
            <span>Check-in:</span>
            <span>{formData.checkInTime ?? '15:00'}</span>
          </div>
          <div className="flex justify-between">
            <span>Check-out:</span>
            <span>{formData.checkOutTime ?? '11:00'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
