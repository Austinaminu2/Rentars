'use client';

import { useEffect, useState, useCallback } from 'react';
import { Copy, CheckCircle, AlertCircle, Loader, XCircle, ExternalLink } from 'lucide-react';
import { getBlockchainStatus, verifyProperty, type BlockchainStatus } from '@/services/blockchain';
import { getExplorerUrl } from '@/lib/network-utils';

interface BlockchainVerificationProps {
  propertyId: string;
  network?: 'testnet' | 'mainnet';
}

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

export default function BlockchainVerification({ 
  propertyId,
  network = 'testnet'
}: BlockchainVerificationProps) {
  const [status, setStatus] = useState<BlockchainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getBlockchainStatus(propertyId);
      setStatus(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
      return null;
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadStatus();
  }, [propertyId, loadStatus]);

  // Poll for status updates when pending
  useEffect(() => {
    if (!status || !status.pending || pollCount >= MAX_POLL_ATTEMPTS) {
      return;
    }

    const timer = setTimeout(async () => {
      const updatedStatus = await loadStatus();
      setPollCount(prev => prev + 1);
      
      // Stop polling if terminal state reached
      if (updatedStatus && (updatedStatus.verified || updatedStatus.failed)) {
        setPollCount(0);
      }
    }, POLL_INTERVAL);

    return () => clearTimeout(timer);
  }, [status, pollCount, loadStatus]);

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setError(null);
      setPollCount(0);
      const data = await verifyProperty(propertyId);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const copyHash = () => {
    if (status?.hash) {
      navigator.clipboard.writeText(status.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusIcon = () => {
    if (status?.verified) {
      return <CheckCircle size={20} className="text-green-600" />;
    }
    if (status?.failed) {
      return <XCircle size={20} className="text-red-600" />;
    }
    if (status?.pending) {
      return <Loader size={20} className="animate-spin text-yellow-600" />;
    }
    return <AlertCircle size={20} className="text-gray-400" />;
  };

  const getStatusText = () => {
    if (status?.verified) return 'Blockchain Verified';
    if (status?.failed) return 'Verification Failed';
    if (status?.pending) return 'Verification Pending';
    return 'Not Verified';
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-2">
        <Loader size={16} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading verification status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center gap-2 text-red-700 mb-2">
          <AlertCircle size={16} />
          <span className="text-sm font-medium">Error</span>
        </div>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={loadStatus}
          className="mt-2 text-xs text-red-700 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const explorerUrl = status.hash ? getExplorerUrl(status.hash, network) : null;

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-semibold text-gray-900">{getStatusText()}</span>
        </div>
        {status.pending && (
          <span className="text-xs text-yellow-600 font-medium">
            Confirming... ({pollCount}/{MAX_POLL_ATTEMPTS})
          </span>
        )}
      </div>

      {status.hash && (
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-gray-700 font-mono break-all flex-1">
              {status.hash}
            </code>
            <button
              onClick={copyHash}
              className="flex-shrink-0 p-1 hover:bg-gray-200 rounded transition-colors"
              title="Copy hash"
            >
              {copied ? (
                <CheckCircle size={14} className="text-green-600" />
              ) : (
                <Copy size={14} className="text-gray-400" />
              )}
            </button>
          </div>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View on Stellar Explorer
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {status.lastVerified && (
        <p className="text-xs text-gray-500 mb-4">
          Last checked: {new Date(status.lastVerified).toLocaleString()}
        </p>
      )}

      {status.failed && status.failureReason && (
        <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
          <p className="text-xs text-red-700 font-medium mb-1">Failure Reason</p>
          <p className="text-xs text-red-600">{status.failureReason}</p>
        </div>
      )}

      {!status.verified && !status.pending && !status.failed && (
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
        >
          {verifying ? (
            <>
              <Loader size={14} className="animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify on Blockchain'
          )}
        </button>
      )}

      {status.pending && (
        <div className="text-xs text-gray-500 text-center">
          Waiting for blockchain confirmation...
        </div>
      )}
    </div>
  );
}
