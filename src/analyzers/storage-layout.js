function slotEntry(layout, index) {
  return layout[index] ?? null;
}

export function analyzeStorageLayout(current, proposed) {
  const findings = [];
  const currentLayout = current.storageLayout ?? [];
  const proposedLayout = proposed.storageLayout ?? [];
  const sharedLength = Math.min(currentLayout.length, proposedLayout.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const before = slotEntry(currentLayout, index);
    const after = slotEntry(proposedLayout, index);

    const shifted =
      before.label !== after.label ||
      before.type !== after.type ||
      before.slot !== after.slot;

    if (shifted) {
      findings.push({
        id: "STORAGE-001",
        category: "storage",
        severity: "critical",
        title: "Storage layout shifted before the end of the existing slot map",
        body: "An existing storage slot changed position or meaning. In a proxy upgrade this can corrupt live state and should block the rollout.",
        evidence: [
          `Current slot ${index}: ${before.label} (${before.type}) at slot ${before.slot}`,
          `Proposed slot ${index}: ${after.label} (${after.type}) at slot ${after.slot}`
        ],
        recommendation: "Append new variables only after the existing layout or move mutable state into namespaced storage.",
        tags: ["storage", "upgrade"]
      });
      break;
    }
  }

  if (proposedLayout.length > currentLayout.length) {
    const currentLabels = new Set(currentLayout.map((entry) => entry.label));
    const added = proposedLayout
      .filter((entry) => !currentLabels.has(entry.label))
      .map((entry) => entry.label);

    if (added.length > 0) {
      findings.push({
        id: "STORAGE-002",
        category: "storage",
        severity: findings.some((finding) => finding.id === "STORAGE-001") ? "medium" : "info",
        title: "New storage variables were introduced in the proposed implementation",
        body: "New state can be safe when appended at the tail, but it deserves review because it changes the persistence contract of the proxy.",
        evidence: [`Added variables: ${added.join(", ")}`],
        recommendation: "Confirm slot ordering with compiler metadata and document why each new field is safe for upgrade.",
        tags: ["storage"]
      });
    }
  }

  return findings;
}
