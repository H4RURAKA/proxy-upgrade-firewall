# Fixtures

Fixtures are small upgrade scenarios used to exercise the approval engine.

Two fixture families are included:

- `corpus/`: lightweight handwritten JSON fixtures
- `real-world/`: compiler-backed Solidity corpora with generated build-info outputs

The legacy `uups-admin-drift` case intentionally contains:

- a storage slot shift
- a weaker governance path
- a delay removal
- a weaker upgrade authorizer
- a new unguarded privileged function
- unsafe implementation initialization
- a new `delegatecall` signal

The compiler-backed real-world corpora cover:

- a safe storage append that should stay low risk
- a governance downgrade that should escalate to manual review
- a UUPS unsafe implementation that should be blocked
