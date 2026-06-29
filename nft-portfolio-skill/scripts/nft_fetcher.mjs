#!/usr/bin/env node
/**
 * nft_fetcher.mjs — Fetch NFT holdings + floor prices for Solana wallets.
 *
 * Sources:
 *   - Solana RPC (getTokenAccountsByOwner + Metaplex metadata) for raw holdings
 *   - Magic Eden collection stats API for floor prices
 *   - Tensor API for floor prices (alternative)
 *
 * Returns normalized NFT data: { mint, name, collection, attributes, lastPrice, floorPrice }
 */

const HELIUS_RPC = process.env.HELIUS_RPC || 'https://api.mainnet-beta.solana.com';
const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

const SOLANA_TOKENS_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export async function fetchWalletNFTs(walletAddress, options = {}) {
  const { heliusRpc = HELIUS_RPC, limit = 100 } = options;

  // Step 1: Get all token accounts owned by the wallet (largest = 1, others = NFTs)
  const tokenAccounts = await rpcRequest(heliusRpc, 'getTokenAccountsByOwner', [
    walletAddress,
    { programId: SOLANA_TOKENS_PROGRAM },
    { encoding: 'jsonParsed' },
  ]);

  const nftMints = [];
  for (const account of tokenAccounts.value || []) {
    const info = account.account.data.parsed.info;
    const amount = parseInt(info.tokenAmount.amount);
    const decimals = info.tokenAmount.decimals;
    // NFTs: amount=1, decimals=0
    if (amount === 1 && decimals === 0) {
      nftMints.push(info.mint);
    }
  }

  if (nftMints.length === 0) return [];

  // Step 2: Fetch Metaplex metadata for each NFT (limited batch)
  const batch = nftMints.slice(0, limit);
  const nfts = await Promise.all(batch.map(mint => fetchNFTMetadata(mint, heliusRpc)));

  return nfts.filter(Boolean);
}

async function fetchNFTMetadata(mint, rpc) {
  // Get the metadata PDA
  const metadataPda = await deriveMetadataPda(mint);
  const accountInfo = await rpcRequest(rpc, 'getAccountInfo', [
    metadataPda,
    { encoding: 'base64' },
  ]);

  if (!accountInfo.value) return null;

  const data = Buffer.from(accountInfo.value.data[0], 'base64');
  // Skip 8 byte discriminator + 32 byte update authority + 32 byte mint
  // Then 4 byte name length + name
  // Then 4 byte symbol length + symbol
  // Then 4 byte uri length + uri
  let offset = 8 + 32 + 32;
  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim();
  offset += nameLen;
  const symbolLen = data.readUInt32LE(offset);
  offset += 4;
  const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim();
  offset += symbolLen;
  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '').trim();

  // Try to fetch off-chain JSON metadata
  let attributes = [];
  let image = null;
  if (uri && uri.startsWith('http')) {
    try {
      const meta = await fetchJson(uri);
      attributes = meta.attributes || [];
      image = meta.image || null;
    } catch {
      // Metadata fetch failed - return what we have
    }
  }

  return {
    mint,
    name,
    symbol,
    uri,
    attributes,
    image,
    collection: symbol || null,
  };
}

async function deriveMetadataPda(mint) {
  // Derive PDA: ['metadata', METAPLEX_PROGRAM, mint]
  // Use PublicKey.findProgramAddressSync equivalent
  const { PublicKey } = await import('@solana/web3.js').catch(() => ({}));
  if (PublicKey) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey(METAPLEX_PROGRAM).toBuffer(),
          new PublicKey(mint).toBuffer(),
        ],
        new PublicKey(METAPLEX_PROGRAM),
      );
      return pda.toBase58();
    } catch {
      return null;
    }
  }
  // Fallback: return null and caller will skip
  return null;
}

export async function fetchMagicEdenFloorPrice(collectionSymbol) {
  const url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/stats`;
  try {
    const data = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
    return {
      source: 'magiceden',
      collection: collectionSymbol,
      floorPrice: data.floorPrice || 0,
      listedCount: data.listedCount || 0,
      avgPrice24h: data.avgPrice24hr || 0,
      volume24h: data.volume24h || 0,
      symbol: data.symbol,
    };
  } catch {
    return null;
  }
}

export async function fetchTensorFloorPrice(collectionId) {
  const url = `https://api.tensor.so/collections/${collectionId}/stats`;
  try {
    const data = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
    return {
      source: 'tensor',
      collection: collectionId,
      floorPrice: data.floorPrice || data.stats?.floorPrice || 0,
      listedCount: data.listedCount || 0,
    };
  } catch {
    return null;
  }
}

async function rpcRequest(rpc, method, params) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  const wallet = process.argv[2] || 'vinesXXv1H9Z6b6cUMjLk5f2cD1WZwB3y3e2QeJqPDb';
  console.log(`Fetching NFTs for ${wallet}...`);
  const nfts = await fetchWalletNFTs(wallet);
  console.log(`Found ${nfts.length} NFTs`);
  for (const nft of nfts.slice(0, 5)) {
    console.log(`  ${nft.name} (${nft.collection})`);
  }
}