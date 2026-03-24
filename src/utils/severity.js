export const severityOrder = ["critical", "high", "medium", "low", "info"];

export const severityWeights = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 4,
  info: 1
};

export function sortFindings(left, right) {
  return severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity);
}

export function maxSeverity(findings) {
  if (findings.length === 0) {
    return "info";
  }

  return [...findings].sort(sortFindings)[0].severity;
}

