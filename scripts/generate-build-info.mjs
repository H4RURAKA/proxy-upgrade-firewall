import fs from "node:fs/promises";
import path from "node:path";
import { buildBuildInfo, compileStandardJson } from "../src/core/compile-solidity.js";

const [sourceFile, outputFile] = process.argv.slice(2);

if (!sourceFile || !outputFile) {
  console.error("Usage: node scripts/generate-build-info.mjs <source-file> <output-file>");
  process.exit(1);
}

const absoluteSource = path.resolve(sourceFile);
const absoluteOutput = path.resolve(outputFile);
const sourceName = path.relative(process.cwd(), absoluteSource).replaceAll(path.sep, "/");
const content = await fs.readFile(absoluteSource, "utf8");

const input = {
  language: "Solidity",
  sources: {
    [sourceName]: {
      content
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      "*": {
        "": ["ast"],
        "*": [
          "abi",
          "metadata",
          "storageLayout",
          "evm.bytecode.object",
          "evm.bytecode.opcodes",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.opcodes"
        ]
      }
    }
  }
};

const output = compileStandardJson({
  input,
  solcVersion: "0.8.25"
});
const buildInfo = buildBuildInfo({
  input,
  output,
  solcVersion: "0.8.25",
  id: path.basename(absoluteOutput, ".json")
});

await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
await fs.writeFile(absoluteOutput, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
