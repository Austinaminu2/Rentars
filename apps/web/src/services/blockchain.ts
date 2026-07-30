const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface BlockchainStatus {
  verified: boolean;
  hash: string | null;
  lastVerified: string | null;
  pending: boolean;
  failed?: boolean;
  failureReason?: string | null;
}

export async function verifyProperty(propertyId: string): Promise<BlockchainStatus> {
  const response = await fetch(`${API_URL}/api/properties/${propertyId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to verify property');
  }

  return response.json();
}

export async function getBlockchainStatus(propertyId: string): Promise<BlockchainStatus> {
  const response = await fetch(`${API_URL}/api/properties/${propertyId}/blockchain-status`);

  if (!response.ok) {
    throw new Error('Failed to fetch blockchain status');
  }

  return response.json();
}
