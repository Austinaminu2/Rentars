import { supabase } from '@/config/supabase.js';
import type { ServiceResponse } from './index.js';

export interface UserProfile {
  user_id: string;
  name?: string;
  avatar_url?: string;
  phone?: string;
  address?: string;
  stellar_address?: string;
  preferences?: Record<string, unknown>;
  social_links?: Record<string, string>;
  verification_status?: 'unverified' | 'pending' | 'verified';
  last_active?: string;
}

export interface ProfileCompleteness {
  score: number;
  maxScore: number;
  missingFields: string[];
}

const COMPLETENESS_WEIGHTS: Record<string, number> = {
  name: 25,
  avatar_url: 25,
  phone: 20,
  address: 15,
  stellar_address: 15,
};

/**
 * Retrieve a user's full profile by their user ID.
 *
 * @param userId - UUID of the user
 * @returns ServiceResponse containing the UserProfile on success
 * @example
 * const result = await getProfile('user-uuid');
 * if (result.success) console.log(result.data.name);
 */
export async function getProfile(userId: string): Promise<ServiceResponse<UserProfile>> {
  if (!userId) return { success: false, error: 'User ID is required' };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return { success: false, error: 'Profile not found' };
  return { success: true, data: data as UserProfile };
}

/**
 * Create or update a user's profile fields.
 * Uses upsert so a missing profile is created on first call.
 *
 * @param userId - UUID of the user
 * @param profileData - Fields to set (excludes user_id and stellar_address)
 * @returns ServiceResponse with the updated profile
 * @throws Does not throw; errors returned in ServiceResponse
 */
export async function updateProfile(
  userId: string,
  profileData: Partial<Omit<UserProfile, 'user_id' | 'stellar_address'>>,
): Promise<ServiceResponse<UserProfile>> {
  if (!userId) return { success: false, error: 'User ID is required' };
  if (Object.keys(profileData).length === 0) {
    return { success: false, error: 'No fields provided for update' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ ...profileData, user_id: userId })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as UserProfile };
}

/**
 * Update the Stellar wallet address associated with a user's profile.
 *
 * @param userId - UUID of the user
 * @param stellarAddress - Valid Stellar public key (G...)
 * @returns ServiceResponse with the updated profile
 */
export async function updateStellarAddress(
  userId: string,
  stellarAddress: string,
): Promise<ServiceResponse<UserProfile>> {
  if (!userId) return { success: false, error: 'User ID is required' };
  if (!stellarAddress) return { success: false, error: 'Stellar address is required' };

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, stellar_address: stellarAddress })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as UserProfile };
}

/**
 * Retrieve a publicly visible subset of a user's profile.
 * Excludes private fields like phone, address, and preferences.
 *
 * @param userId - UUID of the user
 * @returns ServiceResponse with public profile fields
 * @example
 * const result = await getPublicProfile('user-uuid');
 * // result.data contains: user_id, name, avatar_url, stellar_address, verification_status, last_active
 */
export async function getPublicProfile(
  userId: string,
): Promise<ServiceResponse<Partial<UserProfile>>> {
  if (!userId) return { success: false, error: 'User ID is required' };

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, name, avatar_url, stellar_address, verification_status, last_active')
    .eq('user_id', userId)
    .single();

  if (error) return { success: false, error: 'Profile not found' };
  return { success: true, data: data as Partial<UserProfile> };
}

export function computeProfileCompleteness(profile: Partial<UserProfile>): ProfileCompleteness {
  let score = 0;
  const missingFields: string[] = [];

  for (const [field, weight] of Object.entries(COMPLETENESS_WEIGHTS)) {
    const value = profile[field as keyof Partial<UserProfile>];
    const hasValue = typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    if (hasValue) {
      score += weight;
    } else {
      missingFields.push(field);
    }
  }

  return { score, maxScore: Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0), missingFields };
}
