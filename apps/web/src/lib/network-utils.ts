export const STELLAR_NETWORKS = {
  testnet: {
    name: 'Testnet',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  },
  mainnet: {
    name: 'Mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
  },
};

export function getNetworkConfig(network: 'testnet' | 'mainnet' = 'testnet') {
  return STELLAR_NETWORKS[network];
}

export function getNetworkPassphrase(network: 'testnet' | 'mainnet' = 'testnet'): string {
  return STELLAR_NETWORKS[network].passphrase;
}

/**
 * Get the expected network from environment configuration
 */
export function getExpectedNetwork(): 'testnet' | 'mainnet' {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Get the block explorer URL for a transaction
 */
export function getExplorerUrl(txHash: string, network: 'testnet' | 'mainnet'): string {
  const base =
    network === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx/'
      : 'https://stellar.expert/explorer/testnet/tx/';
  return `${base}${txHash}`;
}
