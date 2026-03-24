export function analyzeImplementationSafety(current, proposed) {
  const findings = [];
  const currentSignals = current.securitySignals ?? {};
  const proposedSignals = proposed.securitySignals ?? {};

  if (currentSignals.delegatecall === false && proposedSignals.delegatecall === true) {
    findings.push({
      id: "IMPL-001",
      category: "implementation",
      severity: "high",
      title: "The proposed implementation introduces delegatecall usage",
      body: "New delegatecall pathways increase the blast radius of upgrade mistakes and can enable storage corruption or unexpected code execution.",
      evidence: [
        `Current delegatecall flag: ${Boolean(currentSignals.delegatecall)}`,
        `Proposed delegatecall flag: ${Boolean(proposedSignals.delegatecall)}`
      ],
      recommendation: "Review every delegatecall target and prove that storage and code execution boundaries remain safe.",
      tags: ["implementation", "upgrade"]
    });
  }

  if (currentSignals.selfdestruct === false && proposedSignals.selfdestruct === true) {
    findings.push({
      id: "IMPL-002",
      category: "implementation",
      severity: "critical",
      title: "The proposed implementation introduces selfdestruct usage",
      body: "Selfdestruct-related logic in upgradeable implementations is high risk and should be treated as a release blocker unless there is an exceptional reason.",
      evidence: [
        `Current selfdestruct flag: ${Boolean(currentSignals.selfdestruct)}`,
        `Proposed selfdestruct flag: ${Boolean(proposedSignals.selfdestruct)}`
      ],
      recommendation: "Remove selfdestruct from the implementation or justify it with a narrowly reviewed exception process.",
      tags: ["implementation", "upgrade"]
    });
  }

  if (
    currentSignals.disableInitializersInConstructor === true &&
    proposedSignals.disableInitializersInConstructor === false
  ) {
    findings.push({
      id: "IMPL-003",
      category: "implementation",
      severity: "high",
      title: "Initializer locking appears weaker in the proposed implementation",
      body: "Upgradeable implementations should normally lock initializers in the constructor. Regressing that protection can reopen the class of uninitialized implementation issues seen in past UUPS incidents.",
      evidence: [
        `Current disableInitializersInConstructor: ${Boolean(currentSignals.disableInitializersInConstructor)}`,
        `Proposed disableInitializersInConstructor: ${Boolean(proposedSignals.disableInitializersInConstructor)}`
      ],
      recommendation: "Restore initializer locking and add a deployment-time assertion that the implementation is not left initializable.",
      tags: ["implementation", "upgrade"]
    });
  }

  return findings;
}
