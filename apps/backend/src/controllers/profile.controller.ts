import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middleware/auth.middleware.js';
import {
  getProfile,
  getPublicProfile,
  updateProfile,
  updateStellarAddress,
  computeProfileCompleteness,
} from '@/services/profile.service.js';

export async function getOwnProfileHandler(req: AuthRequest, res: Response): Promise<void> {
  const result = await getProfile(req.userId!);
  if (!result.success || !result.data) {
    res.status(404).json({ error: result.error });
    return;
  }
  const completeness = computeProfileCompleteness(result.data);
  res.json({ ...result.data, completeness });
}

export async function getPublicProfileHandler(req: Request, res: Response): Promise<void> {
  const result = await getPublicProfile(req.params.id);
  if (!result.success || !result.data) {
    res.status(404).json({ error: result.error });
    return;
  }
  const completeness = computeProfileCompleteness(result.data);
  res.json({ ...result.data, completeness });
}

export async function updateProfileHandler(req: AuthRequest, res: Response): Promise<void> {
  const result = await updateProfile(req.userId!, req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}

export async function updateStellarAddressHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { stellar_address } = req.body;
  if (!stellar_address) {
    res.status(400).json({ error: 'stellar_address is required' });
    return;
  }
  const result = await updateStellarAddress(req.userId!, stellar_address);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data);
}
