import { createRpcClient } from "./rpc-client.js";
import { addressFromWord, hexToBigInt, isZeroCode, normalizeAddress } from "../utils/address.js";

export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const UPGRADED_EVENT_TOPIC =
  "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";
export const DEFAULT_LOG_CHUNK_SIZE = 50_000;

function toBlockTag(blockNumber) {
  return `0x${Number(blockNumber).toString(16)}`;
}

function numberFromBlockTag(blockTag) {
  return Number(hexToBigInt(blockTag));
}

function blockRange(fromBlock, toBlock) {
  return {
    fromBlock: toBlockTag(fromBlock),
    toBlock: toBlockTag(toBlock)
  };
}

function decodeUpgradedLog(log) {
  return {
    blockNumber: numberFromBlockTag(log.blockNumber),
    transactionHash: log.transactionHash,
    logIndex: Number(hexToBigInt(log.logIndex)),
    implementation: addressFromWord(log.topics?.[1] ?? "0x")
  };
}

export async function findDeploymentBlock({
  address,
  rpcUrl,
  fetchImpl = globalThis.fetch,
  rpc = null,
  latestBlock = null
}) {
  const client = rpc ?? createRpcClient(rpcUrl, fetchImpl);
  const normalizedAddress = normalizeAddress(address);
  let low = 0;
  let high = latestBlock ?? Number(hexToBigInt(await client.getBlockNumber()));

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const code = await client.getCode(normalizedAddress, toBlockTag(mid));
    if (isZeroCode(code)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export async function fetchUpgradedEvents({
  proxyAddress,
  rpcUrl,
  fetchImpl = globalThis.fetch,
  rpc = null,
  fromBlock,
  toBlock,
  chunkSize = DEFAULT_LOG_CHUNK_SIZE
}) {
  const client = rpc ?? createRpcClient(rpcUrl, fetchImpl);
  const normalizedAddress = normalizeAddress(proxyAddress);
  const latestBlock = toBlock ?? Number(hexToBigInt(await client.getBlockNumber()));
  const deploymentBlock =
    fromBlock ??
    (await findDeploymentBlock({
      address: normalizedAddress,
      rpc,
      rpcUrl,
      fetchImpl,
      latestBlock
    }));
  const events = [];

  for (let start = deploymentBlock; start <= latestBlock; start += chunkSize) {
    const end = Math.min(latestBlock, start + chunkSize - 1);
    const logs = await client.getLogs({
      address: normalizedAddress,
      topics: [UPGRADED_EVENT_TOPIC],
      ...blockRange(start, end)
    });

    for (const log of logs) {
      const decoded = decodeUpgradedLog(log);
      if (decoded.implementation) {
        events.push(decoded);
      }
    }
  }

  events.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }

    return left.logIndex - right.logIndex;
  });

  return {
    proxyAddress: normalizedAddress,
    deploymentBlock,
    latestBlock,
    events
  };
}

export function buildUpgradePairs(events) {
  const pairs = [];

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const next = events[index];

    if (!previous.implementation || !next.implementation) {
      continue;
    }

    if (previous.implementation.toLowerCase() === next.implementation.toLowerCase()) {
      continue;
    }

    pairs.push({
      index: pairs.length + 1,
      currentImplementation: previous.implementation,
      proposedImplementation: next.implementation,
      currentBlockNumber: previous.blockNumber,
      proposedBlockNumber: next.blockNumber,
      currentTransactionHash: previous.transactionHash,
      proposedTransactionHash: next.transactionHash
    });
  }

  return pairs;
}
