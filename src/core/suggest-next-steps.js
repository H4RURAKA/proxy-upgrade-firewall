export function suggestNextSteps(findings, summary) {
  const steps = [];
  const tags = new Set(findings.flatMap((finding) => finding.tags ?? []));

  if (summary.verdict === "block") {
    steps.push("Block the upgrade until the critical findings are resolved.");
  }

  if (tags.has("storage")) {
    steps.push("Generate a compiler-backed storage layout diff and confirm that new variables are appended only at the end or isolated with namespaced storage.");
  }

  if (tags.has("governance") || tags.has("authority")) {
    steps.push("Simulate the governance path and confirm that multisig, timelock, and upgrade authorizer protections are not weakened.");
  }

  if (tags.has("upgrade") || tags.has("funds")) {
    steps.push("Escalate this change to fork simulation or differential fuzzing before approval.");
  }

  if (tags.has("implementation")) {
    steps.push("Review initializer locking and dangerous opcode usage in the new implementation before deployment.");
  }

  if (steps.length === 0) {
    steps.push("No escalations suggested by the current rule set.");
  }

  return steps;
}

