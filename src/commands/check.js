import path from "node:path";
import { loadComparisonPair } from "../core/load-comparison-pair.js";
import { analyzeStorageLayout } from "../analyzers/storage-layout.js";
import { analyzeAuthorityDiff } from "../analyzers/authority-diff.js";
import { analyzeImplementationSafety } from "../analyzers/implementation-safety.js";
import { analyzeAbiSurface } from "../analyzers/abi-surface.js";
import { analyzeCompilerMetadata } from "../analyzers/compiler-metadata.js";
import { buildSummary } from "../core/risk-model.js";
import { suggestNextSteps } from "../core/suggest-next-steps.js";
import { renderMarkdown } from "../report/render-markdown.js";
import { renderJson } from "../report/render-json.js";
import { sortFindings } from "../utils/severity.js";
import { writeText } from "../utils/file-system.js";

export async function runCheckCommand(options) {
  const { current, proposed, inputMode, inputs } = await loadComparisonPair(options);

  const findings = [
    ...analyzeStorageLayout(current, proposed),
    ...analyzeAuthorityDiff(current, proposed),
    ...analyzeImplementationSafety(current, proposed),
    ...analyzeAbiSurface(current, proposed),
    ...analyzeCompilerMetadata(current, proposed)
  ].sort(sortFindings);

  const summary = buildSummary(findings);
  const nextSteps = suggestNextSteps(findings, summary);

  const report = {
    generatedAt: new Date().toISOString(),
    inputMode,
    inputs,
    subject: {
      proxyName: proposed.proxy?.name ?? current.proxy?.name ?? "UnknownProxy",
      proxyAddress: proposed.proxy?.address ?? current.proxy?.address ?? "unknown",
      upgradeKind: proposed.proxy?.kind ?? current.proxy?.kind ?? "unknown",
      currentImplementation: current.implementation?.name ?? "unknown",
      proposedImplementation: proposed.implementation?.name ?? "unknown",
      currentSourceName: current.implementation?.sourceName ?? "unknown",
      proposedSourceName: proposed.implementation?.sourceName ?? "unknown"
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
