# Compiler-Backed Fixtures

These fixtures let `check` run against compiler outputs instead of handwritten JSON.

Included inputs:

- `build-info/current.build-info.json`
- `build-info/proposed.build-info.json`
- Hardhat artifacts with sibling `.dbg.json` files
- Foundry artifacts with embedded `storageLayout`
