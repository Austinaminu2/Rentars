import type { Meta, StoryObj } from '@storybook/react';
import { vi } from 'vitest';
import BlockchainVerification from '../BlockchainVerification';
import * as blockchainService from '@/services/blockchain';

vi.mock('@/services/blockchain');

const meta = {
  title: 'Components/Blockchain/BlockchainVerification',
  component: BlockchainVerification,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BlockchainVerification>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unverified: Story = {
  args: {
    propertyId: 'property_123',
    network: 'testnet',
  },
  beforeEach: () => {
    vi.mocked(blockchainService.getBlockchainStatus).mockResolvedValue({
      verified: false,
      hash: null,
      lastVerified: null,
      pending: false,
    });
  },
};

export const Pending: Story = {
  args: {
    propertyId: 'property_123',
    network: 'testnet',
  },
  beforeEach: () => {
    vi.mocked(blockchainService.getBlockchainStatus).mockResolvedValue({
      verified: false,
      hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      lastVerified: new Date().toISOString(),
      pending: true,
    });
  },
};

export const Verified: Story = {
  args: {
    propertyId: 'property_123',
    network: 'testnet',
  },
  beforeEach: () => {
    vi.mocked(blockchainService.getBlockchainStatus).mockResolvedValue({
      verified: true,
      hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      lastVerified: new Date(Date.now() - 3600000).toISOString(),
      pending: false,
    });
  },
};

export const Failed: Story = {
  args: {
    propertyId: 'property_123',
    network: 'testnet',
  },
  beforeEach: () => {
    vi.mocked(blockchainService.getBlockchainStatus).mockResolvedValue({
      verified: false,
      hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      lastVerified: new Date().toISOString(),
      pending: false,
      failed: true,
      failureReason: 'Transaction failed due to insufficient funds',
    });
  },
};

export const LoadingError: Story = {
  args: {
    propertyId: 'property_123',
    network: 'testnet',
  },
  beforeEach: () => {
    vi.mocked(blockchainService.getBlockchainStatus).mockRejectedValue(
      new Error('Network error')
    );
  },
};
