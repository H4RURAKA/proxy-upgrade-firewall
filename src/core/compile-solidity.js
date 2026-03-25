import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTE_SOLC_RUNNER = path.resolve(__dirname, "../../scripts/run-remote-solc.cjs");
let cachedRemoteSolcNodePath = null;

function parseSolcOutput(raw) {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Unexpected solc output:\n${raw}`);
  }

  const output = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    const formatted = errors.map((entry) => entry.formattedMessage ?? entry.message).join("\n");
    throw new Error(`solc compilation failed:\n${formatted}`);
  }

  return output;
}

export function normalizeSolcPackageVersion(solcVersion) {
  const match = String(solcVersion ?? "").match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Could not derive npm solc package version from ${solcVersion}`);
  }

  return match[1];
}

function resolveRemoteSolcNodePath() {
  if (cachedRemoteSolcNodePath) {
    return cachedRemoteSolcNodePath;
  }

  const envOutput = execFileSync(
    "npm",
    ["exec", "--yes", "--package", "solc@0.8.25", "--", "env"],
    {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    }
  );
  const pathLine = envOutput
    .split("\n")
    .find((line) => line.startsWith("PATH="));

  if (!pathLine) {
    throw new Error("Could not resolve PATH from npm exec environment for fallback solc.");
  }

  const firstPath = pathLine.slice("PATH=".length).split(path.delimiter)[0];
  cachedRemoteSolcNodePath = path.dirname(firstPath);
  return cachedRemoteSolcNodePath;
}

export function compileStandardJson({ input, solcVersion, maxBuffer = 40 * 1024 * 1024 }) {
  const packageVersion = normalizeSolcPackageVersion(solcVersion);
  const serializedInput = JSON.stringify(input);

  const direct = spawnSync(
    "npm",
    ["exec", "--yes", "--package", `solc@${packageVersion}`, "solcjs", "--", "--standard-json"],
    {
      input: serializedInput,
      encoding: "utf8",
      maxBuffer,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  if (direct.status === 0) {
    const raw = direct.stdout ?? "";
    try {
      return parseSolcOutput(raw);
    } catch {
      // Fall through to the remote-compiler path when the direct solcjs output is malformed.
    }
  }

  const fallback = spawnSync("node", [REMOTE_SOLC_RUNNER], {
    input: serializedInput,
    encoding: "utf8",
    maxBuffer,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_PATH: resolveRemoteSolcNodePath(),
      SOLC_VERSION: solcVersion
    }
  });

  if (fallback.status !== 0) {
    const stderr = fallback.stderr ?? direct.stderr ?? "";
    throw new Error(stderr.trim() || `solc compilation failed for ${solcVersion}`);
  }

  return parseSolcOutput(fallback.stdout ?? "");
}

export function buildBuildInfo({ input, output, solcVersion, id }) {
  return {
    _format: "manual-solc-build-info-1",
    id,
    solcVersion: normalizeSolcPackageVersion(solcVersion),
    input,
    output
  };
}
