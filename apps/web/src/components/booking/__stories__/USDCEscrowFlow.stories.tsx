import type { Meta, StoryObj } from '@storybook/react';
import { vi } from 'vitest';
import USDCEscrowFlow from '../USDCEscrowFlow';
import * as useWalletModule from '@/hooks/useWallet';
import * as useEscrowTransactionModule from '@/hooks/useEscrowTransaction';

vi.mock('@/hooks/useWallet');
vi.mock('@/hooks/useEscrowTransaction');
vi.mock('@/lib/network-utils', () => ({
  getExpectedNetwork: () => 'testnet',
}));

const meta = {
  title: 'Components/Booking/USDCEscrowFlow',
  component: USDCEscrowFlow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof USDCEscrowFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultProps = {
  phase: 'fund' as const,
  escrowId: 'escrow_123',
  tenantPublicKey: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
  ownerPublicKey: 'GDEF456DEF456DEF456DEF456DEF456DEF456DEF456DEF456DEF45',
  amount: 1000,
};

export const NotConnected: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: false,
        address: null,
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn(),
      status: 'idle',
      error: null,
      canRetry: false,
      reset: vi.fn(),
      isSubmitting: false,
    });
  },
};

export const NetworkMismatch: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: true,
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
        network: 'mainnet',
        networkMismatch: true,
        isLoading: false,
        error: 'Wallet is on mainnet but app expects testnet',
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn(),
      status: 'idle',
      error: null,
      canRetry: false,
      reset: vi.fn(),
      isSubmitting: false,
    });
  },
};

export const WaitingForSignature: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: true,
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn(),
      status: 'waiting_signature',
      error: null,
      canRetry: false,
      reset: vi.fn(),
      isSubmitting: true,
    });
  },
};

export const SigningTimeout: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: true,
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn(),
      status: 'timeout',
      error: 'Signing request timed out. Please check your wallet and try again.',
      canRetry: true,
      reset: vi.fn(),
      isSubmitting: false,
    });
  },
};

export const UserRejected: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: true,
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn(),
      status: 'error',
      error: 'Transaction was rejected. You can try again when ready.',
      canRetry: true,
      reset: vi.fn(),
      isSubmitting: false,
    });
  },
};

export const Success: Story = {
  args: defaultProps,
  beforeEach: () => {
    vi.mocked(useWalletModule.useWallet).mockReturnValue({
      state: {
        isConnected: true,
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkStatus: vi.fn(),
    });
    vi.mocked(useEscrowTransactionModule.useEscrowTransaction).mockReturnValue({
      submit: vi.fn().mockResolvedValue({
        txHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
        explorerUrl: 'https://stellar.expert/explorer/testnet/tx/abc123...',
      }),
      status: 'success',
      error: null,
      canRetry: false,
      reset: vi.fn(),
      isSubmitting: false,
    });
  },
};
