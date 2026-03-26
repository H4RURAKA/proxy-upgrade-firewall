function slotEntry(layout, index) {
  return layout[index] ?? null;
}

function storageTypesFor(contract) {
  return contract?.storageLayout?.types ?? {};
}

function typeInfoFor(contract, entry) {
  return storageTypesFor(contract)[entry?.type] ?? {};
}

function normalizeTypeLabel(contract, entry) {
  const value = String(entry?.typeLabel ?? typeInfoFor(contract, entry)?.label ?? entry?.type ?? "")
    .replace(/\)\d+(_storage|_memory|_calldata)/g, ")$1")
    .replace(/\b\d+_storage\b/g, "_storage")
    .replace(/\b\d+_memory\b/g, "_memory")
    .replace(/\b\d+_calldata\b/g, "_calldata")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function parseSlot(value) {
  try {
    return BigInt(String(value ?? 0));
  } catch {
    return 0n;
  }
}

function parseOffset(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function parseNumberOfBytes(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function primitiveNumberOfBytesForLabel(label) {
  if (label === "address" || label === "address payable" || /^contract\s+/i.test(label)) {
    return 20;
  }

  const uintMatch = label.match(/^u?int(\d+)$/i);
  if (uintMatch) {
    return Math.ceil(Number.parseInt(uintMatch[1], 10) / 8);
  }

  const bytesMatch = label.match(/^bytes(\d+)$/i);
  if (bytesMatch) {
    return Number.parseInt(bytesMatch[1], 10);
  }

  if (label === "bool") {
    return 1;
  }

  return null;
}

function numberOfBytesFor(contract, entry) {
  const info = typeInfoFor(contract, entry);
  const fromInfo = parseNumberOfBytes(info.numberOfBytes);

  if (fromInfo) {
    return fromInfo;
  }

  const label = normalizeTypeLabel(contract, entry);
  const directSize = primitiveNumberOfBytesForLabel(label);
  if (directSize) {
    return directSize;
  }

  const fixedArrayMatch = label.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const elementBytes = primitiveNumberOfBytesForLabel(fixedArrayMatch[1].trim());
    const length = Number.parseInt(fixedArrayMatch[2], 10);
    if (elementBytes && Number.isFinite(length) && length > 0) {
      return elementBytes * length;
    }
  }

  return null;
}

function slotSpanFor(contract, entry) {
  const numberOfBytes = numberOfBytesFor(contract, entry);

  if (!numberOfBytes) {
    return 1;
  }

  return Math.max(1, Math.ceil(numberOfBytes / 32));
}

function isAddressShaped(contract, entry) {
  const label = normalizeTypeLabel(contract, entry);
  const numberOfBytes = numberOfBytesFor(contract, entry);

  return (
    numberOfBytes === 20 &&
    (
      label === "address" ||
      label === "address payable" ||
      /^contract\s+/i.test(label)
    )
  );
}

function isReservedGap(contract, entry) {
  const label = String(entry?.label ?? "");
  const typeLabel = normalizeTypeLabel(contract, entry);

  return /^__gap(?:_\w+)?$/i.test(label) && /^u?int256\[\d+\]$/i.test(typeLabel);
}

function sameStorageShape(currentContract, before, proposedContract, after) {
  return (
    String(before.slot) === String(after.slot) &&
    String(before.offset ?? 0) === String(after.offset ?? 0) &&
    normalizeTypeLabel(currentContract, before) === normalizeTypeLabel(proposedContract, after)
  );
}

function isStorageCompatibleSemanticChange(currentContract, before, proposedContract, after) {
  return (
    String(before.slot) === String(after.slot) &&
    String(before.offset ?? 0) === String(after.offset ?? 0) &&
    isAddressShaped(currentContract, before) &&
    isAddressShaped(proposedContract, after) &&
    normalizeTypeLabel(currentContract, before) !== normalizeTypeLabel(proposedContract, after)
  );
}

function detectReservedGapConsumption(currentContract, currentLayout, currentIndex, proposedContract, proposedLayout, proposedIndex) {
  const beforeGap = slotEntry(currentLayout, currentIndex);

  if (!isReservedGap(currentContract, beforeGap)) {
    return null;
  }

  const beforeGapStart = parseSlot(beforeGap.slot);
  const beforeGapSpan = slotSpanFor(currentContract, beforeGap);
  const beforeGapEnd = beforeGapStart + BigInt(beforeGapSpan);

  for (let gapIndex = proposedIndex + 1; gapIndex < proposedLayout.length; gapIndex += 1) {
    const proposedGap = slotEntry(proposedLayout, gapIndex);

    if (!isReservedGap(proposedContract, proposedGap)) {
      const slot = parseSlot(proposedGap?.slot);
      if (slot >= beforeGapEnd) {
        break;
      }
      continue;
    }

    const proposedGapStart = parseSlot(proposedGap.slot);
    const consumedSlots = Number(proposedGapStart - beforeGapStart);
    const proposedGapSpan = slotSpanFor(proposedContract, proposedGap);

    if (consumedSlots <= 0 || proposedGapSpan <= 0) {
      continue;
    }

    if (consumedSlots + proposedGapSpan !== beforeGapSpan) {
      continue;
    }

    const addedEntries = proposedLayout.slice(proposedIndex, gapIndex);
    const entriesFitInsideGap = addedEntries.every((entry) => {
      const slot = parseSlot(entry.slot);
      return slot >= beforeGapStart && slot < beforeGapEnd;
    });

    if (!entriesFitInsideGap) {
      continue;
    }

    return {
      id: "STORAGE-004",
      category: "storage",
      severity: "info",
      title: "Reserved storage gap was consumed intentionally",
      body: "The proposed implementation consumes slots from a reserved `__gap` region. This is a common upgrade pattern, but it should still be reviewed intentionally.",
      evidence: [
        `Current gap: ${beforeGap.label} (${normalizeTypeLabel(currentContract, beforeGap)}) at slot ${beforeGap.slot}`,
        `Consumed labels: ${addedEntries.map((entry) => entry.label).join(", ")}`,
        `Proposed gap: ${proposedGap.label} (${normalizeTypeLabel(proposedContract, proposedGap)}) at slot ${proposedGap.slot}`
      ],
      recommendation: "Confirm that the consumed slots came from a deliberately reserved gap and that the remaining gap is still large enough for planned future upgrades.",
      tags: ["storage", "upgrade", "gap"],
      currentAdvance: 1,
      proposedAdvance: gapIndex - proposedIndex + 1
    };
  }

  return null;
}

export function analyzeStorageLayout(current, proposed) {
  const findings = [];
  const currentLayout = current.storageLayout?.storage ?? current.storageLayout ?? [];
  const proposedLayout = proposed.storageLayout?.storage ?? proposed.storageLayout ?? [];
  let currentIndex = 0;
  let proposedIndex = 0;

  while (currentIndex < currentLayout.length && proposedIndex < proposedLayout.length) {
    const before = slotEntry(currentLayout, currentIndex);
    const after = slotEntry(proposedLayout, proposedIndex);

    if (sameStorageShape(current, before, proposed, after)) {
      currentIndex += 1;
      proposedIndex += 1;
      continue;
    }

    if (isStorageCompatibleSemanticChange(current, before, proposed, after)) {
      findings.push({
        id: "STORAGE-003",
        category: "storage",
        severity: "medium",
        title: "Storage slot meaning changed without changing the underlying slot shape",
        body: "The slot stayed compatible at the byte level, but the type meaning changed. This is usually safer than a collision, yet it still deserves review because the upgraded contract may interpret live state differently.",
        evidence: [
          `Current slot ${currentIndex}: ${before.label} (${normalizeTypeLabel(current, before)}) at slot ${before.slot}:${parseOffset(before.offset)}`,
          `Proposed slot ${proposedIndex}: ${after.label} (${normalizeTypeLabel(proposed, after)}) at slot ${after.slot}:${parseOffset(after.offset)}`
        ],
        recommendation: "Review the semantic meaning of the slot change and confirm that the new implementation treats the inherited state intentionally.",
        tags: ["storage", "upgrade", "semantic-change"]
      });
      currentIndex += 1;
      proposedIndex += 1;
      continue;
    }

    const reservedGapConsumption = detectReservedGapConsumption(current, currentLayout, currentIndex, proposed, proposedLayout, proposedIndex);
    if (reservedGapConsumption) {
      findings.push({
        id: reservedGapConsumption.id,
        category: reservedGapConsumption.category,
        severity: reservedGapConsumption.severity,
        title: reservedGapConsumption.title,
        body: reservedGapConsumption.body,
        evidence: reservedGapConsumption.evidence,
        recommendation: reservedGapConsumption.recommendation,
        tags: reservedGapConsumption.tags
      });
      currentIndex += reservedGapConsumption.currentAdvance;
      proposedIndex += reservedGapConsumption.proposedAdvance;
      continue;
    }

    const shifted = !sameStorageShape(current, before, proposed, after);
    if (shifted) {
      findings.push({
        id: "STORAGE-001",
        category: "storage",
        severity: "critical",
        title: "Storage layout shifted before the end of the existing slot map",
        body: "An existing storage slot changed position or meaning. In a proxy upgrade this can corrupt live state and should block the rollout.",
        evidence: [
          `Current slot ${currentIndex}: ${before.label} (${normalizeTypeLabel(current, before)}) at slot ${before.slot}`,
          `Proposed slot ${proposedIndex}: ${after.label} (${normalizeTypeLabel(proposed, after)}) at slot ${after.slot}`
        ],
        recommendation: "Append new variables only after the existing layout or move mutable state into namespaced storage.",
        tags: ["storage", "upgrade"]
      });
      break;
    }
  }

  if (!findings.some((finding) => finding.id === "STORAGE-001") && currentIndex < currentLayout.length && proposedIndex >= proposedLayout.length) {
    const removed = currentLayout.slice(currentIndex).map((entry) => entry.label);
    findings.push({
      id: "STORAGE-001",
      category: "storage",
      severity: "critical",
      title: "Storage variables were removed before the previous layout finished",
      body: "The proposed implementation ended before all previous state variables were accounted for. In a proxy upgrade this can cause live state to be reinterpreted incorrectly.",
      evidence: [`Unmatched current variables: ${removed.join(", ")}`],
      recommendation: "Keep the previous storage layout intact and only append new variables at the tail or in reserved namespaced storage.",
      tags: ["storage", "upgrade"]
    });
  }

  if (!findings.some((finding) => finding.id === "STORAGE-001") && proposedIndex < proposedLayout.length) {
    const added = proposedLayout.slice(proposedIndex).map((entry) => entry.label);

    if (added.length > 0) {
      findings.push({
        id: "STORAGE-002",
        category: "storage",
        severity: "info",
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
