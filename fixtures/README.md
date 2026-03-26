# Fixtures

Fixtures are small upgrade scenarios used to exercise the analyzer.

Included groups:

- `corpus/`: lightweight handwritten JSON fixtures
- `real-world/`: compiler-backed Solidity scenarios with generated build-info outputs

The legacy `uups-admin-drift` fixture includes:

- a storage slot shift
- weaker governance and upgrade authorization
- a new unguarded privileged function
- unsafe implementation initialization
- a new `delegatecall` signal
