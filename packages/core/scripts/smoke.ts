import { fileURLToPath } from "node:url";
import {
  completeWithRef,
  createProviderRegistry,
  listAllModels,
  loadProviderConfigs,
} from "../src/index.js";

const configDir = fileURLToPath(new URL("../../../config", import.meta.url));
const configs = loadProviderConfigs(configDir);
const ref = process.argv[2];

if (!ref) {
  // No argument: list models from every provider
  console.log(JSON.stringify(await listAllModels(configs), null, 2));
  process.exit(0);
}

// With argument: send a message, e.g. 9router/claude-haiku-4.5-combo
const registry = createProviderRegistry(configs);
const reply = await completeWithRef(registry, ref, [
  { role: "user", content: "Say hi in one short sentence." },
]);
console.log(reply);
