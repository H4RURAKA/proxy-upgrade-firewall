import path from "node:path";
import { loadFixturePair } from "../core/load-fixture.js";
import { analyzeStorageLayout } from "../analyzers/storage-layout.js";
import { analyzeAuthorityDiff } from "../analyzers/authority-diff.js";
import { analyzeImplementationSafety } from "../analyzers/implementation-safety.js";
import { buildSummary } from "../core/risk-model.js";
import { suggestNextSteps } from "../core/suggest-next-steps.js";
import { renderMarkdown } from "../report/render-markdown.js";
import { renderJson } from "../report/render-json.js";
import { sortFindings } from "../utils/severity.js";
import { writeText } from "../utils/file-system.js";

export async function runCheckCommand(options) {
  if (!options.fixture) {
    throw new Error("Missing required --fixture <dir> option.");
  }

  const fixtureDir = path.resolve(options.fixture);
  const { current, proposed } = await loadFixturePair(fixtureDir);

  const findings = [
    ...analyzeStorageLayout(current, proposed),
    ...analyzeAuthorityDiff(current, proposed),
    ...analyzeImplementationSafety(current, proposed)
  ].sort(sortFindings);

  const summary = buildSummary(findings);
  const nextSteps = suggestNextSteps(findings, summary);

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureDir,
    subject: {
      proxyName: proposed.proxy?.name ?? current.proxy?.name ?? "UnknownProxy",
      proxyAddress: proposed.proxy?.address ?? current.proxy?.address ?? "unknown",
      upgradeKind: proposed.proxy?.kind ?? current.proxy?.kind ?? "unknown",
      currentImplementation: current.implementation?.name ?? "unknown",
      proposedImplementation: proposed.implementation?.name ?? "unknown"
    },
    summary,
    findings,
    nextSteps
  };

  const format = options.format === "json" ? "json" : "markdown";
  const content = format === "json" ? renderJson(report) : renderMarkdown(report);

  if (options.output) {
    await writeText(path.resolve(options.output), content);
  }

  if (!options.silent) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
  }

  if (options.strict && (summary.maxSeverity === "critical" || summary.maxSeverity === "high")) {
    process.exitCode = 1;
  }

  return report;
}

