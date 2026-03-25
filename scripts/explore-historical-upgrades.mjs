import fs from "node:fs/promises";
import path from "node:path";
import { createRpcClient } from "../src/core/rpc-client.js";
import { fetchVerifiedSourceBundle, materializeSourcifyBundleBuildInfo } from "../src/core/load-live-proxy-pair.js";
import { buildUpgradePairs, fetchUpgradedEvents } from "../src/core/historical-upgrades.js";
import { runCheckCommand } from "../src/commands/check.js";

const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const DEFAULT_INPUT = "reports/live-mainnet-top100-comparable-ready.csv";
const DEFAULT_OUTPUT = "reports/historical-upgrade-pairs.csv";
const DEFAULT_SUSPICIOUS_OUTPUT = "reports/historical-upgrade-suspicious.csv";
const DEFAULT_SUMMARY_OUTPUT = "reports/historical-upgrade-summary.json";
const DEFAULT_DETAILS_DIR = "reports/historical-upgrade-details";
const DEFAULT_CONCURRENCY = 1;

function parseArgs(argv) {
  const options = {
    rpcUrl: process.env.ETH_RPC_URL ?? DEFAULT_RPC_URL,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    suspiciousOutput: DEFAULT_SUSPICIOUS_OUTPUT,
    summaryOutput: DEFAULT_SUMMARY_OUTPUT,
    detailsDir: DEFAULT_DETAILS_DIR,
    concurrency: DEFAULT_CONCURRENCY
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--rpc-url") {
      options.rpcUrl = argv[index + 1] ?? DEFAULT_RPC_URL;
      index += 1;
      continue;
    }

    if (token === "--input") {
      options.input = argv[index + 1] ?? DEFAULT_INPUT;
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1] ?? DEFAULT_OUTPUT;
      index += 1;
      continue;
    }

    if (token === "--suspicious-output") {
      options.suspiciousOutput = argv[index + 1] ?? DEFAULT_SUSPICIOUS_OUTPUT;
      index += 1;
      continue;
    }

    if (token === "--summary-output") {
      options.summaryOutput = argv[index + 1] ?? DEFAULT_SUMMARY_OUTPUT;
      index += 1;
      continue;
    }

    if (token === "--details-dir") {
      options.detailsDir = argv[index + 1] ?? DEFAULT_DETAILS_DIR;
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

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

async function readCsv(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function toCsv(rows) {
  if (rows.length === 0) {
    return "proxy_address,symbol,name,status\n";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classifyStatus(report) {
  return report.summary.verdict === "allow-with-review" ? "low-signal" : "candidate";
}

function findingList(report, limit = 8) {
  return report.findings.slice(0, limit).map((finding) => finding.id).join("|");
}

function countByPrefix(report, prefix) {
  return report.findings.filter((finding) => finding.id.startsWith(prefix)).length;
}

function shouldKeepPair(report) {
  return report.summary.verdict !== "allow-with-review";
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

async function exploreProxy(row, options, context) {
  const history = await fetchUpgradedEvents({
    proxyAddress: row.proxy_address,
    rpcUrl: options.rpcUrl,
    rpc: context.rpc
  });
  const pairs = buildUpgradePairs(history.events);

  if (pairs.length === 0) {
    return {
      proxy: row,
      deploymentBlock: history.deploymentBlock,
      eventCount: history.events.length,
      pairs: []
    };
  }

  const results = [];

  for (const pair of pairs) {
    const pairSlug =
      `${String(pair.index).padStart(2, "0")}-${slugify(row.symbol)}-${pair.currentBlockNumber}-to-${pair.proposedBlockNumber}`;
    const reportPath = path.resolve(options.detailsDir, pairSlug, "report.json");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });

    let currentResolved = null;
    let proposedResolved = null;

    try {
      const currentBundle = await context.getBundle(pair.currentImplementation);
      const proposedBundle = await context.getBundle(pair.proposedImplementation);
      currentResolved = await materializeSourcifyBundleBuildInfo({
        bundle: currentBundle,
        id: `historical-current-${pair.currentImplementation.toLowerCase()}`
      });
      proposedResolved = await materializeSourcifyBundleBuildInfo({
        bundle: proposedBundle,
        id: `historical-proposed-${pair.proposedImplementation.toLowerCase()}`
      });

      const report = await runCheckCommand({
        currentBuildInfo: currentResolved.buildInfoPath,
        proposedBuildInfo: proposedResolved.buildInfoPath,
        currentContract: currentResolved.contractSelector,
        proposedContract: proposedResolved.contractSelector,
        format: "json",
        output: reportPath,
        silent: true
      });

      results.push({
        sample_rank: row.sample_rank,
        symbol: row.symbol,
        name: row.name,
        proxy_address: row.proxy_address,
        proxy_kind: row.proxy_kind,
        deployment_block: history.deploymentBlock,
        upgrade_event_count: history.events.length,
        pair_index: pair.index,
        current_block_number: pair.currentBlockNumber,
        proposed_block_number: pair.proposedBlockNumber,
        current_transaction_hash: pair.currentTransactionHash,
        proposed_transaction_hash: pair.proposedTransactionHash,
        current_implementation: pair.currentImplementation,
        proposed_implementation: pair.proposedImplementation,
        current_contract_selector: currentResolved.contractSelector,
        proposed_contract_selector: proposedResolved.contractSelector,
        current_match_type: currentBundle.matchType,
        proposed_match_type: proposedBundle.matchType,
        verdict: report.summary.verdict,
        status: classifyStatus(report),
        risk_score: report.summary.riskScore,
        max_severity: report.summary.maxSeverity,
        total_findings: report.findings.length,
        critical_findings: report.summary.counts.critical,
        high_findings: report.summary.counts.high,
        medium_findings: report.summary.counts.medium,
        storage_findings: countByPrefix(report, "STORAGE-"),
        authority_findings: countByPrefix(report, "AUTH-"),
        implementation_findings: countByPrefix(report, "IMPL-"),
        abi_findings: countByPrefix(report, "ABI-"),
        compiler_findings: countByPrefix(report, "COMPILER-"),
        finding_ids: findingList(report),
        error: "",
        report_path: path.relative(process.cwd(), reportPath)
      });
    } catch (error) {
      results.push({
        sample_rank: row.sample_rank,
        symbol: row.symbol,
        name: row.name,
        proxy_address: row.proxy_address,
        proxy_kind: row.proxy_kind,
        deployment_block: history.deploymentBlock,
        upgrade_event_count: history.events.length,
        pair_index: pair.index,
        current_block_number: pair.currentBlockNumber,
        proposed_block_number: pair.proposedBlockNumber,
        current_transaction_hash: pair.currentTransactionHash,
        proposed_transaction_hash: pair.proposedTransactionHash,
        current_implementation: pair.currentImplementation,
        proposed_implementation: pair.proposedImplementation,
        current_contract_selector: "",
        proposed_contract_selector: "",
        current_match_type: "",
        proposed_match_type: "",
        verdict: "",
        status: "error",
        risk_score: "",
        max_severity: "",
        total_findings: "",
        critical_findings: "",
        high_findings: "",
        medium_findings: "",
        storage_findings: "",
        authority_findings: "",
        implementation_findings: "",
        abi_findings: "",
        compiler_findings: "",
        finding_ids: "",
        error: error instanceof Error ? error.message : String(error),
        report_path: ""
      });
    } finally {
      await currentResolved?.cleanup?.();
      await proposedResolved?.cleanup?.();
    }
  }

  return {
    proxy: row,
    deploymentBlock: history.deploymentBlock,
    eventCount: history.events.length,
    pairs: results
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const readyRows = await readCsv(options.input);
  const rpc = createRpcClient(options.rpcUrl);
  const bundleCache = new Map();
  const latestBlock = Number(BigInt(await rpc.getBlockNumber()));

  async function getBundle(implementationAddress) {
    const key = implementationAddress.toLowerCase();
    if (!bundleCache.has(key)) {
      bundleCache.set(
        key,
        fetchVerifiedSourceBundle({
          chainId: 1,
          implementationAddress
        })
      );
    }

    return bundleCache.get(key);
  }

  const explored = await mapWithConcurrency(readyRows, options.concurrency, async (row, index) => {
    process.stdout.write(`Exploring ${index + 1}/${readyRows.length}: ${row.symbol} ${row.proxy_address}\n`);
    try {
      return await exploreProxy(row, options, {
        rpc,
        latestBlock,
        getBundle
      });
    } catch (error) {
      return {
        proxy: row,
        deploymentBlock: null,
        eventCount: 0,
        error: error instanceof Error ? error.message : String(error),
        pairs: []
      };
    }
  });

  const rows = explored.flatMap((entry) => entry.pairs);
  const suspiciousRows = rows.filter((row) => row.status === "candidate");
  const summary = {
    generatedAt: new Date().toISOString(),
    rpcUrl: options.rpcUrl,
    source: path.resolve(options.input),
    readyCandidates: readyRows.length,
    latestBlock,
    proxiesScanned: explored.length,
    proxiesWithUpgradeEvents: explored.filter((entry) => entry.eventCount > 0).length,
    proxiesWithActualPairs: explored.filter((entry) => entry.pairs.length > 0).length,
    analyzedPairs: rows.length,
    suspiciousPairs: suspiciousRows.length,
    errors: explored
      .filter((entry) => entry.error)
      .map((entry) => ({
        symbol: entry.proxy.symbol,
        proxyAddress: entry.proxy.proxy_address,
        error: entry.error
      })),
    suspicious: suspiciousRows.map((row) => ({
      symbol: row.symbol,
      proxyAddress: row.proxy_address,
      pairIndex: row.pair_index,
      verdict: row.verdict,
      riskScore: row.risk_score,
      findings: row.finding_ids,
      reportPath: row.report_path
    }))
  };

  await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(options.suspiciousOutput)), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(options.summaryOutput)), { recursive: true });
  await fs.mkdir(path.resolve(options.detailsDir), { recursive: true });
  await fs.writeFile(path.resolve(options.output), toCsv(rows), "utf8");
  await fs.writeFile(path.resolve(options.suspiciousOutput), toCsv(suspiciousRows), "utf8");
  await fs.writeFile(
    path.resolve(options.summaryOutput),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    `Analyzed ${rows.length} historical upgrade pairs across ${explored.length} proxies.\n` +
      `Suspicious pairs: ${suspiciousRows.length}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
