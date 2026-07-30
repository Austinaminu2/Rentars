'use client';

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useEscrowTransaction } from '@/hooks/useEscrowTransaction';
import { getExpectedNetwork } from '@/lib/network-utils';

type Phase = 'fund' | 'release';

export interface USDCEscrowFlowProps {
  phase: Phase;
  escrowId: string;
  tenantPublicKey: string;
  ownerPublicKey: string;
  amount: number;
}

export default function USDCEscrowFlow({
  phase,
  escrowId,
  tenantPublicKey,
  ownerPublicKey,
  amount,
}: USDCEscrowFlowProps) {
  const expectedNetwork = getExpectedNetwork();
  const { state: walletState, connect, disconnect } = useWallet();
  const { submit, status, error, canRetry, reset } = useEscrowTransaction(expectedNetwork);
  const [txHash, setTxHash] = useState<string | null>(null);

  const isTenant = useMemo(() => {
    return walletState.address === tenantPublicKey;
  }, [walletState.address, tenantPublicKey]);

  const isOwner = useMemo(() => {
    return walletState.address === ownerPublicKey;
  }, [walletState.address, ownerPublicKey]);

  const canContinue = phase === 'fund' ? isTenant : isOwner;

  const label = phase === 'fund' ? 'Sign & Fund Escrow' : 'Sign & Release Payment';

  const handleSubmit = async () => {
    try {
      reset();
      const res = await submit({
        type: phase === 'fund' ? 'fund' : 'release',
        escrowId,
        amount,
        tenantPublicKey,
        ownerPublicKey,
      });
      setTxHash(res.txHash);
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'waiting_signature':
        return 'Waiting for wallet signature...';
      case 'submitting':
        return 'Submitting to Stellar network...';
      case 'timeout':
        return 'Signing request timed out';
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 space-y-4 border border-gray-100 dark:border-gray-700">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {phase === 'fund' ? 'USDC escrow funding' : 'USDC escrow release'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Amount: <span className="font-semibold text-gray-900 dark:text-white">{amount} USDC</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Network: {expectedNetwork}
        </p>
      </div>

      {!walletState.isConnected && !walletState.isLoading && (
        <button
          onClick={() => connect()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition"
          type="button"
        >
          Connect Freighter Wallet
        </button>
      )}

      {walletState.isLoading && (
        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 justify-center py-2">
          <Loader2 className="animate-spin" size={16} />
          Connecting...
        </div>
      )}

      {walletState.networkMismatch && (
        <div className="text-sm text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium mb-1">Network Mismatch</div>
            <div className="text-xs">
              Your wallet is on <strong>{walletState.network}</strong> but this app requires{' '}
              <strong>{expectedNetwork}</strong>. Please switch networks in Freighter and reconnect.
            </div>
            <button
              onClick={disconnect}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Disconnect and try again
            </button>
          </div>
        </div>
      )}

      {walletState.isConnected && !walletState.networkMismatch && !canContinue && (
        <div className="text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          Please connect the correct wallet ({phase === 'fund' ? 'tenant' : 'owner'}) to continue.
        </div>
      )}

      {walletState.isConnected && !walletState.networkMismatch && canContinue && !txHash && (
        <>
          {getStatusMessage() && (
            <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              {getStatusMessage()}
            </div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={status === 'waiting_signature' || status === 'submitting'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
            type="button"
          >
            {status === 'waiting_signature' || status === 'submitting' ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Processing...
              </>
            ) : (
              label
            )}
          </button>
        </>
      )}

      {error && canRetry && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="font-medium mb-1">Error</div>
          <div className="text-xs mb-2">{error}</div>
          <button
            onClick={handleSubmit}
            className="text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {error && !canRetry && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
          {error}
        </div>
      )}

      {txHash && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <div className="font-semibold mb-1">Transaction submitted</div>
          <div className="font-mono break-all text-xs mb-2">{txHash}</div>
          <a
            className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
            href={`https://stellar.expert/explorer/${expectedNetwork === 'mainnet' ? 'public' : 'testnet'}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Stellar Explorer →
          </a>
        </div>
      )}
    </div>
  );
}

