/**
 * Zod validators for property-related request bodies.
 *
 * Validates and sanitises all incoming payloads before they reach
 * the controller or Supabase. Keeps the allowed amenities list as
 * the single source of truth for both validation and documentation.
 */

import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { CANONICAL_AMENITIES } from '@/types/amenities.js';
import { ValidationError } from '@/types/errors.js';

// Re-export the canonical list so consumers can use either import path.
export { CANONICAL_AMENITIES as ALLOWED_AMENITIES } from '@/types/amenities.js';
export type { Amenity } from '@/types/amenities.js';

const ALLOWED_AMENITIES = CANONICAL_AMENITIES;

// ─── Location sub-schema ──────────────────────────────────────────────────────

const locationSchema = z.object({
  city: z.string().min(1, 'city is required').max(100),
  country: z.string().min(1, 'country is required').max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ─── Create property schema ───────────────────────────────────────────────────

const propertyBaseSchema = z.object({
  title: z
    .string()
    .min(3, 'title must be at least 3 characters')
    .max(100, 'title must be at most 100 characters')
    .trim(),

  description: z
    .string()
    .min(10, 'description must be at least 10 characters')
    .max(2000, 'description must be at most 2000 characters')
    .trim(),

  price_per_night: z
    .number({ invalid_type_error: 'price_per_night must be a number' })
    .positive('price_per_night must be a positive number'),

  location: locationSchema,

  amenities: z
    .array(z.enum(ALLOWED_AMENITIES, { errorMap: () => ({ message: `amenities must be one of: ${ALLOWED_AMENITIES.join(', ')}` }) }))
    .default([]),

  max_guests: z
    .number({ invalid_type_error: 'max_guests must be a number' })
    .int('max_guests must be an integer')
    .positive('max_guests must be a positive integer'),

  bedrooms: z
    .number({ invalid_type_error: 'bedrooms must be a number' })
    .int('bedrooms must be an integer')
    .min(0, 'bedrooms must be 0 or more'),

  bathrooms: z
    .number({ invalid_type_error: 'bathrooms must be a number' })
    .int('bathrooms must be an integer')
    .min(0, 'bathrooms must be 0 or more'),

  images: z.array(z.string().url('each image must be a valid URL')).optional().default([]),

  featured: z.boolean().optional().default(false),

  min_nights: z
    .number({ invalid_type_error: 'min_nights must be a number' })
    .int('min_nights must be an integer')
    .min(1, 'min_nights must be at least 1')
    .optional()
    .default(1),

  max_nights: z
    .number({ invalid_type_error: 'max_nights must be a number' })
    .int('max_nights must be an integer')
    .min(1, 'max_nights must be at least 1')
    .nullable()
    .optional()
    .default(null),

  check_in_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'check_in_time must be in HH:MM format')
    .optional()
    .default('15:00'),

  check_out_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'check_out_time must be in HH:MM format')
    .optional()
    .default('11:00'),
});

function refineMinMax<T extends { min_nights?: number | null; max_nights?: number | null }>(data: T) {
  const min = data.min_nights ?? 1;
  const max = data.max_nights;
  return max === null || max === undefined || max >= min;
}

export const propertySchema = propertyBaseSchema.refine(refineMinMax, {
  message: 'max_nights must be greater than or equal to min_nights',
  path: ['max_nights'],
});

// ─── Update property schema (all fields optional) ─────────────────────────────

export const updatePropertySchema = propertyBaseSchema.partial().refine(refineMinMax, {
  message: 'max_nights must be greater than or equal to min_nights',
  path: ['max_nights'],
});

// ─── Search / filter query schema ─────────────────────────────────────────────

export const propertySearchSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  min_price: z.coerce.number().positive().optional(),
  max_price: z.coerce.number().positive().optional(),
  amenities: z
    .union([
      z.array(z.enum(ALLOWED_AMENITIES)),
      // Accept comma-separated string from query params
      z.string().transform((s) =>
        s.split(',').map((a) => a.trim()) as Amenity[],
      ),
    ])
    .optional(),
  check_in: z.string().date('check_in must be a valid ISO date (YYYY-MM-DD)').optional(),
  check_out: z.string().date('check_out must be a valid ISO date (YYYY-MM-DD)').optional(),
  max_guests: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).refine(
  (data) => {
    if (data.check_in && data.check_out) {
      return new Date(data.check_out) > new Date(data.check_in);
    }
    return true;
  },
  { message: 'check_out must be after check_in', path: ['check_out'] },
).refine(
  (data) => {
    if (data.min_price !== undefined && data.max_price !== undefined) {
      return data.max_price >= data.min_price;
    }
    return true;
  },
  { message: 'max_price must be >= min_price', path: ['max_price'] },
);

// ─── Geo search query schema ──────────────────────────────────────────────────

export const geoSearchSchema = z.object({
  lat: z.coerce.number().min(-90, 'lat must be between -90 and 90').max(90, 'lat must be between -90 and 90'),
  lng: z.coerce.number().min(-180, 'lng must be between -180 and 180').max(180, 'lng must be between -180 and 180'),
  radiusKm: z.coerce.number().positive('radiusKm must be positive').max(500, 'radiusKm must not exceed 500').default(50),
});

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates `req.body` against the given
 * Zod schema. On failure it responds 422 with a structured errors array.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      result.error.errors.forEach((error) => {
        const field = error.path.join('.');
        if (!fields[field]) {
          fields[field] = [];
        }
        fields[field].push(error.message);
      });

      const validationError = new ValidationError('Validation failed', fields);
      next(validationError);
      return;
    }
    // Replace req.body with the parsed (sanitised + defaulted) value
    req.body = result.data;
    next();
  };
}

/**
 * Returns an Express middleware that validates `req.query` against the given
 * Zod schema. On failure it throws a ValidationError that is caught by error middleware.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      result.error.errors.forEach((error) => {
        const field = error.path.join('.');
        if (!fields[field]) {
          fields[field] = [];
        }
        fields[field].push(error.message);
      });

      const validationError = new ValidationError('Validation failed', fields);
      next(validationError);
      return;
    }
    // Attach parsed query so controllers get typed, coerced values
    (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
    next();
  };
}
