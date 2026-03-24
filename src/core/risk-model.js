import { maxSeverity, severityWeights } from "../utils/severity.js";

export function buildSummary(findings) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };

  let score = 0;
  for (const finding of findings) {
    counts[finding.severity] += 1;
    score += severityWeights[finding.severity] ?? 0;
  }

  const riskScore = Math.min(100, score);
  const topSeverity = maxSeverity(findings);

  let verdict = "allow-with-review";
  if (topSeverity === "critical") {
    verdict = "block";
  } else if (topSeverity === "high" || riskScore >= 60) {
    verdict = "manual-review";
  }

  return {
    verdict,
    riskScore,
    maxSeverity: topSeverity,
    counts
  };
}

