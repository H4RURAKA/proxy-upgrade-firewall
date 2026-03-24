export function renderInspectionMarkdown(report) {
  const lines = [];
  lines.push(`# On-chain Proxy Inspection`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Chain ID: ${report.chainId}`);
  lines.push(`- Proxy: ${report.subject.proxyAddress}`);
  lines.push(`- Kind: ${report.subject.kind}`);
  lines.push(`- Implementation: ${report.subject.implementation ?? "not-found"}`);
  lines.push(`- Admin: ${report.subject.admin ?? "not-found"}`);
  lines.push(`- Beacon: ${report.subject.beacon ?? "not-found"}`);
  lines.push("");
  lines.push("## Control Path");
  lines.push("");

  for (const entry of report.controlPath) {
    const details = [];
    if (entry.address) {
      details.push(entry.address);
    }
    if (entry.owner) {
      details.push(`owner=${entry.owner}`);
    }
    if (typeof entry.threshold === "number") {
      details.push(`threshold=${entry.threshold}`);
    }
    if (Array.isArray(entry.owners) && entry.owners.length > 0) {
      details.push(`owners=${entry.owners.join(",")}`);
    }

    lines.push(`- ${entry.label}${details.length > 0 ? ` | ${details.join(" | ")}` : ""}`);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return lines.join("\n");
}

