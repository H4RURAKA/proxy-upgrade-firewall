import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [sourceFile, outputFile] = process.argv.slice(2);

if (!sourceFile || !outputFile) {
  console.error("Usage: node generate-build-info.mjs <source-file> <output-file>");
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

const raw = execFileSync(
  "npm",
  ["exec", "--yes", "--package", "solc@0.8.25", "solcjs", "--", "--standard-json"],
  {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  }
);

const firstBrace = raw.indexOf("{");
const lastBrace = raw.lastIndexOf("}");
if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
  throw new Error(`Unexpected solc output:\n${raw}`);
}

const output = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
const buildInfo = {
  _format: "manual-solc-build-info-1",
  id: path.basename(absoluteOutput, ".json"),
  solcVersion: "0.8.25",
  input,
  output
};

await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
await fs.writeFile(absoluteOutput, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
