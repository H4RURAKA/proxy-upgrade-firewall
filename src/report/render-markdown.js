export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Upgrade Review: ${report.subject.proxyName}`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Proxy: ${report.subject.proxyAddress}`);
  lines.push(`- Kind: ${report.subject.upgradeKind}`);
  lines.push(`- Current implementation: ${report.subject.currentImplementation}`);
  lines.push(`- Proposed implementation: ${report.subject.proposedImplementation}`);
  lines.push(`- Verdict: ${report.summary.verdict}`);
  lines.push(`- Risk score: ${report.summary.riskScore}/100`);
  lines.push(`- Max severity: ${report.summary.maxSeverity}`);
  lines.push("");
  if (Array.isArray(report.inputs) && report.inputs.length > 0) {
    lines.push("## Inputs");
    lines.push("");
    for (const input of report.inputs) {
      lines.push(`- ${input.label}: ${input.mode} | ${input.contract} | ${input.path}`);
    }
    lines.push("");
  }
  lines.push("## Findings");
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings.");
    lines.push("");
  } else {
    for (const finding of report.findings) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push("");
      lines.push(finding.body);
      lines.push("");
      lines.push(`- ID: ${finding.id}`);
      lines.push(`- Category: ${finding.category}`);
      for (const item of finding.evidence) {
        lines.push(`- Evidence: ${item}`);
      }
      lines.push(`- Recommendation: ${finding.recommendation}`);
      lines.push("");
    }
  }

  lines.push("## Suggested Next Steps");
  lines.push("");
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }

  lines.push("");
  return lines.join("\n");
}
