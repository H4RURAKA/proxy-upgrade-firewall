import fs from "node:fs/promises";
import path from "node:path";

const COMMENT_MARKER = "<!-- proxy-upgrade-firewall-pr-comment -->";

function parseArgs(argv) {
  const options = {
    ciResult: "",
    artifactName: "proxy-upgrade-firewall-reports",
    output: "",
    reports: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--ci-result") {
      options.ciResult = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--artifact-name") {
      options.artifactName = argv[index + 1] ?? options.artifactName;
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--report") {
      const raw = argv[index + 1] ?? "";
      index += 1;
      const separator = raw.indexOf("=");

      if (separator === -1) {
        throw new Error(`Expected --report LABEL=PATH, received: ${raw}`);
      }

      options.reports.push({
        label: raw.slice(0, separator).trim(),
        path: raw.slice(separator + 1).trim()
      });
    }
  }

  return options;
}

async function loadReport(entry) {
  const resolvedPath = path.resolve(entry.path);

  try {
    const raw = await fs.readFile(resolvedPath, "utf8");
    return {
      ...entry,
      resolvedPath,
      report: JSON.parse(raw)
    };
  } catch (error) {
    return {
      ...entry,
      resolvedPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function summarizeFindings(report, limit = 3) {
  const top = (report.findings ?? []).slice(0, limit).map((finding) => `\`${finding.id}\``);
  return top.length > 0 ? top.join(", ") : "-";
}

function ciStatusLine(ciResult) {
  if (!ciResult) {
    return "";
  }

  return `CI status: \`${ciResult}\``;
}

function buildComment(options, reports) {
  const lines = [
    COMMENT_MARKER,
    "## Proxy Upgrade Firewall",
    ""
  ];

  const statusLine = ciStatusLine(options.ciResult);
  if (statusLine) {
    lines.push(statusLine, "");
  }

  lines.push("Smoke evaluation for this PR.", "");
  lines.push("| Scenario | Verdict | Risk | Max severity | Top findings |");
  lines.push("| --- | --- | ---: | --- | --- |");

  for (const entry of reports) {
    if (entry.error || !entry.report) {
      lines.push(
        `| ${entry.label} | unavailable | - | - | ${entry.error ?? "Report was not generated"} |`
      );
      continue;
    }

    const summary = entry.report.summary ?? {};
    lines.push(
      `| ${entry.label} | \`${summary.verdict ?? "unknown"}\` | ${summary.riskScore ?? "-"} | \`${summary.maxSeverity ?? "unknown"}\` | ${summarizeFindings(entry.report)} |`
    );
  }

  lines.push(
    "",
    `Detailed JSON reports are uploaded as the \`${options.artifactName}\` workflow artifact.`
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reports = await Promise.all(options.reports.map(loadReport));
  const comment = buildComment(options, reports);

  if (options.output) {
    await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await fs.writeFile(path.resolve(options.output), comment, "utf8");
  }

  process.stdout.write(comment);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
