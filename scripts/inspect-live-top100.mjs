import fs from "node:fs/promises";
import path from "node:path";
import { inspectProxy } from "../src/core/onchain-inspector.js";
import { createRpcClient } from "../src/core/rpc-client.js";

const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const DEFAULT_LIMIT = 100;
const DEFAULT_OUTPUT = "reports/live-mainnet-top100-inspect.csv";
const DEFAULT_SUMMARY_OUTPUT = "reports/live-mainnet-top100-summary.json";
const DEFAULT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12000;
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

function isEthereumAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? ""));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function bytesFromHex(hex) {
  if (!hex || hex === "0x") {
    return 0;
  }

  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  return normalized.length / 2;
}

function summarizeControlPath(controlPath = []) {
  return controlPath.map((entry) => entry.label).join(" -> ");
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

async function inspectMany({ limit, rpcUrl, concurrency }) {
  const sample = await fetchTopEthereumContracts(limit);
  const fetchImpl = (url, init) => fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
  const summary = {
    generatedAt: new Date().toISOString(),
    rpcUrl,
    sampleSource: "CoinGecko markets + include_platform Ethereum addresses",
    requested: limit,
    completed: 0,
    failed: 0,
    byKind: {}
  };

  const rows = await mapWithConcurrency(sample, concurrency, async (item, index) => {
    const rpc = createRpcClient(rpcUrl, fetchImpl);

    try {
      const [report, code] = await Promise.all([
        inspectProxy({
          proxyAddress: item.address,
          rpcUrl,
          fetchImpl
        }),
        rpc.getCode(item.address)
      ]);

      const kind = report.subject.kind;
      summary.completed += 1;
      summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1;

      if ((index + 1) % 10 === 0 || index === sample.length - 1) {
        process.stdout.write(`Completed ${index + 1}/${sample.length}\n`);
      }

      return {
        sample_rank: item.rank,
        coingecko_id: item.id,
        symbol: item.symbol,
        name: item.name,
        address: item.address,
        chain_id: report.chainId,
        code_size_bytes: bytesFromHex(code),
        kind,
        implementation: report.subject.implementation ?? "",
        admin: report.subject.admin ?? "",
        beacon: report.subject.beacon ?? "",
        control_path: summarizeControlPath(report.controlPath),
        notes: (report.notes ?? []).join(" | "),
        error: ""
      };
    } catch (error) {
      summary.failed += 1;

      if ((index + 1) % 10 === 0 || index === sample.length - 1) {
        process.stdout.write(`Completed ${index + 1}/${sample.length}\n`);
      }

      return {
        sample_rank: item.rank,
        coingecko_id: item.id,
        symbol: item.symbol,
        name: item.name,
        address: item.address,
        chain_id: "",
        code_size_bytes: "",
        kind: "",
        implementation: "",
        admin: "",
        beacon: "",
        control_path: "",
        notes: "",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  return {
    rows,
    summary
  };
}

function toCsv(rows) {
  const headers = [
    "sample_rank",
    "coingecko_id",
    "symbol",
    "name",
    "address",
    "chain_id",
    "code_size_bytes",
    "kind",
    "implementation",
    "admin",
    "beacon",
    "control_path",
    "notes",
    "error"
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { rows, summary } = await inspectMany(options);

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
      `Summary: ${JSON.stringify(summary.byKind)}\n`
  );
}

await main();
