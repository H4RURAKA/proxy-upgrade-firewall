import fs from "node:fs/promises";
import path from "node:path";
import { inspectProxy } from "../src/core/onchain-inspector.js";
import {
  fetchVerifiedSourceBundle,
  materializeSourcifyBundleBuildInfo
} from "../src/core/load-live-proxy-pair.js";
import { materializeDerivedDangerousProposalBuildInfo } from "../src/core/derive-dangerous-proposal.js";
import { runCheckCommand } from "../src/commands/check.js";

const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const DEFAULT_INPUT = "reports/live-mainnet-top100-comparable-ready.csv";
const DEFAULT_LIMIT = 5;
const DEFAULT_OUTPUT = "reports/live-derived-dangerous-top5-summary.csv";
const DEFAULT_SUMMARY_OUTPUT = "reports/live-derived-dangerous-top5-summary.json";
const DEFAULT_DETAILS_DIR = "reports/live-derived-dangerous-top5";

function parseArgs(argv) {
  const options = {
    rpcUrl: process.env.ETH_RPC_URL ?? DEFAULT_RPC_URL,
    input: DEFAULT_INPUT,
    limit: DEFAULT_LIMIT,
    output: DEFAULT_OUTPUT,
    summaryOutput: DEFAULT_SUMMARY_OUTPUT,
    detailsDir: DEFAULT_DETAILS_DIR
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

    if (token === "--limit") {
      options.limit = Number(argv[index + 1] ?? DEFAULT_LIMIT);
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

    if (token === "--details-dir") {
      options.detailsDir = argv[index + 1] ?? DEFAULT_DETAILS_DIR;
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

function parseCsvRow(line, headers) {
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
  return Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
}

async function readCsv(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const headers = parseCsvRow(lines[0], lines[0].split(","));
  return lines.slice(1).map((line) => parseCsvRow(line, Object.keys(headers)));
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});
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

function countFindings(report, prefix) {
  return report.findings.filter((finding) => finding.id.startsWith(prefix)).length;
}

function summarizeFindingIds(report, limit = 8) {
  return report.findings.slice(0, limit).map((finding) => finding.id).join("|");
}

async function runReplayForRow(row, index, options) {
  const caseSlug = `${String(index + 1).padStart(2, "0")}-${slugify(row.symbol || row.name || row.proxy_address)}`;
  const caseDir = path.resolve(options.detailsDir, caseSlug);
  await fs.mkdir(caseDir, { recursive: true });

  const inspection = await inspectProxy({
    proxyAddress: row.proxy_address,
    rpcUrl: options.rpcUrl
  });
  const bundle = await fetchVerifiedSourceBundle({
    chainId: inspection.chainId,
    implementationAddress: inspection.subject.implementation
  });
  const currentResolved = await materializeSourcifyBundleBuildInfo({
    bundle,
    id: `current-${caseSlug}`
  });
  const proposedResolved = await materializeDerivedDangerousProposalBuildInfo({
    bundle,
    outputPath: path.join(caseDir, "proposed.build-info.json"),
    id: `dangerous-${caseSlug}`
  });

  await fs.writeFile(
    path.join(caseDir, "mutations.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        proxyAddress: row.proxy_address,
        implementationAddress: inspection.subject.implementation,
        contractSelector: proposedResolved.contractSelector,
        mutations: proposedResolved.mutations
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  try {
    const report = await runCheckCommand(
      {
        proxy: row.proxy_address,
        rpcUrl: options.rpcUrl,
        proposedBuildInfo: proposedResolved.buildInfoPath,
        contract: proposedResolved.contractSelector,
        format: "json",
        output: path.join(caseDir, "report.json"),
        silent: true
      },
      {
        inspectProxy: async () => inspection,
        resolveVerifiedBuildInfo: async () => currentResolved
      }
    );

    return {
      sample_rank: row.sample_rank,
      symbol: row.symbol,
      name: row.name,
      proxy_address: row.proxy_address,
      proxy_kind: row.proxy_kind,
      current_contract_selector: row.current_contract_selector || proposedResolved.contractSelector,
      sourcify_match_type: row.sourcify_match_type,
      mutations: proposedResolved.mutations.join("|"),
      verdict: report.summary.verdict,
      risk_score: report.summary.riskScore,
      max_severity: report.summary.maxSeverity,
      total_findings: report.findings.length,
      critical_findings: report.summary.counts.critical,
      high_findings: report.summary.counts.high,
      medium_findings: report.summary.counts.medium,
      storage_findings: countFindings(report, "STORAGE-"),
      authority_findings: countFindings(report, "AUTH-"),
      implementation_findings: countFindings(report, "IMPL-"),
      abi_findings: countFindings(report, "ABI-"),
      compiler_findings: countFindings(report, "COMPILER-"),
      finding_ids: summarizeFindingIds(report),
      report_path: path.relative(process.cwd(), path.join(caseDir, "report.json"))
    };
  } finally {
    await proposedResolved.cleanup?.();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const readyRows = await readCsv(options.input);
  const selected = readyRows.slice(0, Math.max(1, options.limit));

  const summary = {
    generatedAt: new Date().toISOString(),
    rpcUrl: options.rpcUrl,
    source: path.resolve(options.input),
    requested: options.limit,
    selected: selected.length,
    cases: []
  };

  const rows = [];
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    process.stdout.write(
      `Replaying ${index + 1}/${selected.length}: ${row.symbol} ${row.proxy_address}\n`
    );
    const result = await runReplayForRow(row, index, options);
    rows.push(result);
    summary.cases.push(result);
  }

  await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(options.summaryOutput)), { recursive: true });
  await fs.mkdir(path.resolve(options.detailsDir), { recursive: true });
  await fs.writeFile(path.resolve(options.output), toCsv(rows), "utf8");
  await fs.writeFile(
    path.resolve(options.summaryOutput),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    `Wrote ${rows.length} replay rows to ${path.resolve(options.output)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
