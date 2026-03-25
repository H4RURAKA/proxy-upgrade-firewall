import fs from "node:fs/promises";
import path from "node:path";
import { inspectProxy } from "../src/core/onchain-inspector.js";
import { loadCompilerContract } from "../src/core/load-compiler-contract.js";
import { materializeVerifiedBuildInfo } from "../src/core/load-live-proxy-pair.js";

const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const DEFAULT_LIMIT = 100;
const DEFAULT_OUTPUT = "reports/live-mainnet-top100-comparable.csv";
const DEFAULT_SUMMARY_OUTPUT = "reports/live-mainnet-top100-comparable-summary.json";
const DEFAULT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12000;
const ITEM_TIMEOUT_MS = 45000;
const COINGECKO_API = "https://api.coingecko.com/api/v3";

function parseArgs(argv) {
  const options = {
    limit: DEFAULT_LIMIT,
    rpcUrl: process.env.ETH_RPC_URL ?? DEFAULT_RPC_URL,
    output: DEFAULT_OUTPUT,
    summaryOutput: DEFAULT_SUMMARY_OUTPUT,
    concurrency: DEFAULT_CONCURRENCY
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--limit") {
      options.limit = Number(argv[index + 1] ?? DEFAULT_LIMIT);
      index += 1;
      continue;
    }

    if (token === "--rpc-url") {
      options.rpcUrl = argv[index + 1] ?? DEFAULT_RPC_URL;
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1] ?? DEFAULT_OUTPUT;
      index += 1;
      continue;
    }

    if (token === "--summary-output") {
      options.summaryOutput = argv[index + 1] ?? DEFAULT_SUMMARY_OUTPUT;
      index += 1;
      continue;
    }

    if (token === "--concurrency") {
      options.concurrency = Number(argv[index + 1] ?? DEFAULT_CONCURRENCY);
      index += 1;
    }
  }

  return options;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function isEthereumAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? ""));
}

function summarizeControlPath(controlPath = []) {
  return controlPath.map((entry) => entry.label).join(" -> ");
}

function reasonFromError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("readable EIP-1967 implementation slot")) {
    return "no_live_implementation";
  }

  if (message.includes("Could not find a verified Sourcify bundle")) {
    return "sourcify_not_verified";
  }

  if (message.includes("timed out")) {
    return "current_materialization_timed_out";
  }

  if (message.includes("solc compilation failed")) {
    return "current_compile_failed";
  }

  if (message.includes("Unexpected solc output")) {
    return "current_compile_output_invalid";
  }

  if (message.includes("Could not find contract")) {
    return "current_contract_resolution_failed";
  }

  if (message.includes("RPC request failed") || message.includes("RPC error")) {
    return "rpc_failed";
  }

  return "unknown_failure";
}

async function fetchWithTimeout(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent": "proxy-upgrade-firewall/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTopEthereumContracts(limit) {
  const coins = await fetchJson(`${COINGECKO_API}/coins/list?include_platform=true`);
  const platformsById = new Map(coins.map((coin) => [coin.id, coin.platforms ?? {}]));
  const selected = [];
  const seen = new Set();

  for (let page = 1; page <= 6 && selected.length < limit; page += 1) {
    const marketUrl =
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc` +
      `&per_page=250&page=${page}&sparkline=false`;
    const markets = await fetchJson(marketUrl);

    for (const market of markets) {
      const address = platformsById.get(market.id)?.ethereum;
      if (!isEthereumAddress(address)) {
        continue;
      }

      const normalized = address.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      selected.push({
        rank: market.market_cap_rank ?? null,
        id: market.id,
        symbol: market.symbol ?? "",
        name: market.name ?? "",
        address
      });

      if (selected.length >= limit) {
        break;
      }
    }
  }

  if (selected.length < limit) {
    throw new Error(`Only found ${selected.length} Ethereum contract addresses from CoinGecko.`);
  }

  return selected;
}

function buildBaseRow(item) {
  return {
    sample_rank: item.rank,
    coingecko_id: item.id,
    symbol: item.symbol,
    name: item.name,
    proxy_address: item.address,
    chain_id: "",
    proxy_kind: "",
    implementation_address: "",
    admin_address: "",
    beacon_address: "",
    comparable: "false",
    comparable_reason: "",
    sourcify_match_type: "",
    current_compiler_version: "",
    current_contract_selector: "",
    current_source_name: "",
    current_contract_name: "",
    current_source_count: "",
    current_storage_entries: "",
    current_abi_functions: "",
    current_delegatecall: "",
    current_selfdestruct: "",
    current_initializer_lock: "",
    control_path: "",
    notes: "",
    error: ""
  };
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? buildBaseRow({}));
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

async function loadComparableCurrent({
  chainId,
  implementationAddress,
  fetchImpl,
  cache
}) {
  const key = `${chainId}:${implementationAddress.toLowerCase()}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const resolved = await materializeVerifiedBuildInfo({
          chainId,
          implementationAddress,
          fetchImpl
        });

        try {
          const current = await loadCompilerContract({
            mode: "build-info",
            path: resolved.buildInfoPath,
            contract: resolved.contractSelector
          });

          return {
            sourcifyMatchType: resolved.matchType,
            compilerVersion: resolved.compilerVersion,
            contractSelector: resolved.contractSelector,
            sourceName: resolved.sourceName,
            contractName: resolved.contractName,
            sourceCount: resolved.sourceCount,
            storageEntries: current.storageLayout.length,
            abiFunctions: current.abiSurface.length,
            delegatecall: String(current.securitySignals?.delegatecall),
            selfdestruct: String(current.securitySignals?.selfdestruct),
            initializerLock: String(current.securitySignals?.disableInitializersInConstructor)
          };
        } finally {
          await resolved.cleanup?.();
        }
      })()
    );
  }

  return cache.get(key);
}

async function censusComparableLiveProxies({ limit, rpcUrl, concurrency }) {
  const sample = await fetchTopEthereumContracts(limit);
  const fetchImpl = (url, init) => fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
  const currentCache = new Map();
  const summary = {
    generatedAt: new Date().toISOString(),
    rpcUrl,
    sampleSource: "CoinGecko markets + include_platform Ethereum addresses",
    requested: limit,
    completed: 0,
    failed: 0,
    comparable: 0,
    byKind: {},
    comparableByKind: {},
    reasons: {}
  };

  const rows = await mapWithConcurrency(sample, concurrency, async (item, index) => {
    const row = buildBaseRow(item);

    try {
      const inspection = await inspectProxy({
        proxyAddress: item.address,
        rpcUrl,
        fetchImpl
      });

      row.chain_id = inspection.chainId;
      row.proxy_kind = inspection.subject.kind;
      row.implementation_address = inspection.subject.implementation ?? "";
      row.admin_address = inspection.subject.admin ?? "";
      row.beacon_address = inspection.subject.beacon ?? "";
      row.control_path = summarizeControlPath(inspection.controlPath);
      row.notes = (inspection.notes ?? []).join(" | ");

      summary.byKind[row.proxy_kind] = (summary.byKind[row.proxy_kind] ?? 0) + 1;

      if (!inspection.subject.implementation) {
        row.comparable_reason = "no_live_implementation";
      } else {
        const current = await withTimeout(
          loadComparableCurrent({
            chainId: inspection.chainId,
            implementationAddress: inspection.subject.implementation,
            fetchImpl,
            cache: currentCache
          }),
          ITEM_TIMEOUT_MS,
          `Current materialization for ${inspection.subject.implementation}`
        );

        row.comparable = "true";
        row.comparable_reason = "ready";
        row.sourcify_match_type = current.sourcifyMatchType;
        row.current_compiler_version = current.compilerVersion ?? "";
        row.current_contract_selector = current.contractSelector;
        row.current_source_name = current.sourceName;
        row.current_contract_name = current.contractName;
        row.current_source_count = current.sourceCount;
        row.current_storage_entries = current.storageEntries;
        row.current_abi_functions = current.abiFunctions;
        row.current_delegatecall = current.delegatecall;
        row.current_selfdestruct = current.selfdestruct;
        row.current_initializer_lock = current.initializerLock;

        summary.comparable += 1;
        summary.comparableByKind[row.proxy_kind] = (summary.comparableByKind[row.proxy_kind] ?? 0) + 1;
      }
    } catch (error) {
      summary.failed += 1;
      row.error = error instanceof Error ? error.message : String(error);
      row.comparable_reason = reasonFromError(error);
    }

    summary.reasons[row.comparable_reason] = (summary.reasons[row.comparable_reason] ?? 0) + 1;
    summary.completed += 1;

    if ((index + 1) % 10 === 0 || index === sample.length - 1) {
      process.stdout.write(`Completed ${index + 1}/${sample.length}\n`);
    }

    return row;
  });

  return {
    rows,
    summary
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { rows, summary } = await censusComparableLiveProxies(options);

  await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(options.summaryOutput)), { recursive: true });
  await fs.writeFile(path.resolve(options.output), toCsv(rows), "utf8");
  await fs.writeFile(
    path.resolve(options.summaryOutput),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    `Wrote ${rows.length} rows to ${path.resolve(options.output)}\n` +
      `Comparable: ${summary.comparable}/${summary.requested}\n`
  );
}

await main();
