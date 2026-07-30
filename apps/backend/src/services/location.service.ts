import { supabase } from '@/config/supabase.js';
import * as cache from './cache.service.js';
import type { ServiceResponse } from './index.js';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  address: string;
}

export interface ReverseGeocodeResult {
  label: string;
}

/** Reverse-geocode cache TTL: 1 hour. Coordinates rarely change their place name. */
const REVERSE_GEOCODE_TTL = 3600;

/** Forward geocode cache TTL: 5 minutes. */
const GEOCODE_TTL = 300;

export interface PropertyWithDistance {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  price_per_night: number;
  distance_km?: number;
}

export interface PriceComparison {
  property_id: string;
  title: string;
  price_per_night: number;
  distance_km: number;
  price_rank: number;
  avg_area_price: number;
  price_diff_pct: number;
}

export class LocationService {
  /**
   * Reverse-geocode a coordinate pair to a human-readable address label.
   * Results are cached in Redis for {@link REVERSE_GEOCODE_TTL} seconds.
   *
   * @param lat - WGS-84 latitude
   * @param lng - WGS-84 longitude
   */
  async reverseGeocode(lat: number, lng: number): Promise<ServiceResponse<ReverseGeocodeResult>> {
    if (isNaN(lat) || isNaN(lng)) {
      return { success: false, error: 'Invalid latitude or longitude', statusCode: 400 };
    }
    if (lat < -90 || lat > 90) {
      return { success: false, error: 'Latitude must be between -90 and 90', statusCode: 400 };
    }
    if (lng < -180 || lng > 180) {
      return { success: false, error: 'Longitude must be between -180 and 180', statusCode: 400 };
    }

    // Round to 4 dp (~11 m precision) to maximise cache hits for near-identical coords.
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLng = Math.round(lng * 10000) / 10000;
    const cacheKey = `reverse-geocode:${roundedLat}:${roundedLng}`;

    const cached = await cache.get<ReverseGeocodeResult>(cacheKey);
    if (cached) return { success: true, data: cached };

    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?lat=${roundedLat}&lon=${roundedLng}&format=json`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Rentars/1.0 (rentals platform)' },
      });

      if (!response.ok) {
        return { success: false, error: 'Reverse geocoding service unavailable', statusCode: 502 };
      }

      const data = (await response.json()) as {
        display_name?: string;
        error?: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          county?: string;
          state?: string;
          country?: string;
        };
      };

      if (data.error || !data.display_name) {
        return { success: false, error: 'Location not found', statusCode: 404 };
      }

      // Build a concise label: "City, State, Country" falling back to display_name.
      const a = data.address ?? {};
      const city = a.city ?? a.town ?? a.village ?? a.county ?? '';
      const parts = [city, a.state, a.country].filter(Boolean);
      const label = parts.length >= 2 ? parts.join(', ') : data.display_name;

      const result: ReverseGeocodeResult = { label };
      await cache.set(cacheKey, result, REVERSE_GEOCODE_TTL);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reverse geocoding failed';
      return { success: false, error: message, statusCode: 500 };
    }
  }

  async geocode(address: string): Promise<ServiceResponse<GeocodeResult>> {
    if (!address || address.trim() === '') {
      return { success: false, error: 'Address is required', statusCode: 400 };
    }

    const cacheKey = `geocode:${address.trim().toLowerCase()}`;
    const cached = await cache.get<GeocodeResult>(cacheKey);
    if (cached) return { success: true, data: cached };

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Rentars/1.0 (rentals platform)' },
      });

      if (!response.ok) {
        return { success: false, error: 'Geocoding service unavailable', statusCode: 502 };
      }

      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;

      if (!results.length) {
        return { success: false, error: 'Address not found', statusCode: 404 };
      }

      const [hit] = results;
      const result: GeocodeResult = {
        latitude: parseFloat(hit.lat),
        longitude: parseFloat(hit.lon),
        address: hit.display_name,
      };

      await cache.set(cacheKey, result, GEOCODE_TTL);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Geocoding failed';
      return { success: false, error: message, statusCode: 500 };
    }
  }

  async searchNearby(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<ServiceResponse<PropertyWithDistance[]>> {
    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      return { success: false, error: 'Invalid latitude, longitude, or radius', statusCode: 400 };
    }

    if (radius <= 0) {
      return { success: false, error: 'Radius must be positive', statusCode: 400 };
    }

    try {
      const { data, error } = await supabase.rpc('search_nearby_properties', {
        lat,
        lng,
        radius_km: radius,
      });

      if (error) {
        // Fallback: filter in JS when PostGIS RPC is not available
        const fallback = await this.nearbyFallback(lat, lng, radius);
        return fallback;
      }

      return { success: true, data: data || [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message, statusCode: 500 };
    }
  }

  async getPriceComparison(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<ServiceResponse<PriceComparison[]>> {
    const nearbyResult = await this.searchNearby(lat, lng, radius);
    if (!nearbyResult.success || !nearbyResult.data?.length) {
      return { success: true, data: [] };
    }

    const properties = nearbyResult.data;
    const prices = properties.map((p) => p.price_per_night);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    const sorted = [...properties].sort((a, b) => a.price_per_night - b.price_per_night);
    const comparisons: PriceComparison[] = sorted.map((p, i) => ({
      property_id: p.id,
      title: p.title,
      price_per_night: p.price_per_night,
      distance_km: p.distance_km ?? 0,
      price_rank: i + 1,
      avg_area_price: Math.round(avgPrice * 100) / 100,
      price_diff_pct: Math.round(((p.price_per_night - avgPrice) / avgPrice) * 100 * 10) / 10,
    }));

    return { success: true, data: comparisons };
  }

  /** JS-side haversine fallback when PostGIS is not configured */
  private async nearbyFallback(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<ServiceResponse<PropertyWithDistance[]>> {
    const { data, error } = await supabase
      .from('properties')
      .select('id, title, latitude, longitude, price_per_night')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) return { success: false, error: error.message, statusCode: 500 };

    const R = 6371;
    const nearby = (data as PropertyWithDistance[])
      .map((p) => {
        const dLat = ((p.latitude - lat) * Math.PI) / 180;
        const dLng = ((p.longitude - lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat * Math.PI) / 180) *
            Math.cos((p.latitude * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distance_km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return { ...p, distance_km: Math.round(distance_km * 100) / 100 };
      })
      .filter((p) => p.distance_km <= radius)
      .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));

    return { success: true, data: nearby };
  }
}
