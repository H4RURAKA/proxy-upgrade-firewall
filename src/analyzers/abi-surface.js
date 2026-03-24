function functionSignature(abiItem) {
  const inputs = (abiItem.inputs ?? []).map((input) => input.type).join(",");
  return `${abiItem.name}(${inputs})`;
}

function isMutableFunction(abiItem) {
  return abiItem.type === "function" && !["view", "pure"].includes(abiItem.stateMutability);
}

function looksPrivileged(signature) {
  return /(upgrade|admin|owner|pause|sweep|rescue|oracle|guardian|set[A-Z])/.test(signature);
}

export function analyzeAbiSurface(current, proposed) {
  const findings = [];
  const currentFunctions = new Map(
    (current.abi ?? [])
      .filter((item) => item.type === "function")
      .map((item) => [functionSignature(item), item])
  );
  const proposedFunctions = new Map(
    (proposed.abi ?? [])
      .filter((item) => item.type === "function")
      .map((item) => [functionSignature(item), item])
  );

  const addedMutable = [];
  const removedFunctions = [];
  const mutabilityChanges = [];

  for (const [signature, proposedFunction] of proposedFunctions.entries()) {
    const currentFunction = currentFunctions.get(signature);
    if (!currentFunction) {
      if (isMutableFunction(proposedFunction)) {
        addedMutable.push(signature);
      }
      continue;
    }

    if (currentFunction.stateMutability !== proposedFunction.stateMutability) {
      mutabilityChanges.push({
        signature,
        current: currentFunction.stateMutability,
        proposed: proposedFunction.stateMutability
      });
    }
  }

  for (const signature of currentFunctions.keys()) {
    if (!proposedFunctions.has(signature)) {
      removedFunctions.push(signature);
    }
  }

  if (addedMutable.length > 0) {
    const privileged = addedMutable.some(looksPrivileged);
    findings.push({
      id: "ABI-001",
      category: "abi",
      severity: privileged ? "high" : "medium",
      title: "The proposed implementation adds new mutable external functions",
      body: "New state-changing entrypoints expand the review surface. Even before guard analysis is available, reviewers should confirm which actor is meant to call them.",
      evidence: addedMutable.map((signature) => `Added mutable function: ${signature}`),
      recommendation: "Review the authorization model and intended callers for every newly added mutable function.",
      tags: ["abi"]
    });
  }

  if (mutabilityChanges.length > 0) {
    findings.push({
      id: "ABI-002",
      category: "abi",
      severity: "medium",
      title: "One or more function mutability declarations changed",
      body: "Mutability changes can alter how integrators and auditors reason about side effects, and they can signal meaningful behavior changes even when function names stay the same.",
      evidence: mutabilityChanges.map(
        (change) => `${change.signature}: ${change.current} -> ${change.proposed}`
      ),
      recommendation: "Confirm that each mutability change is intentional and covered by updated tests and documentation.",
      tags: ["abi"]
    });
  }

  if (removedFunctions.length > 0) {
    findings.push({
      id: "ABI-003",
      category: "abi",
      severity: "low",
      title: "The external function surface changed by removing callable functions",
      body: "Removed functions can break integrations and governance tooling that expect the older interface.",
      evidence: removedFunctions.map((signature) => `Removed function: ${signature}`),
      recommendation: "Document removed functions and check downstream integrations for compatibility assumptions.",
      tags: ["abi"]
    });
  }

  return findings;
}

