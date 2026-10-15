import { loadConfig } from "../src/config.js";
import { registerCommands } from "../src/register.js";
try {
  await registerCommands({ ...loadConfig(), force: true });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
