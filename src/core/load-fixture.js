import path from "node:path";
import { readJson } from "../utils/file-system.js";

export async function loadFixturePair(fixtureDir) {
  const current = await readJson(path.join(fixtureDir, "current.json"));
  const proposed = await readJson(path.join(fixtureDir, "proposed.json"));
  return { current, proposed };
}

