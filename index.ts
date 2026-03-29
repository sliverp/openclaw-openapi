import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { openApiPlugin } from "./src/channel.js";
import { setOpenApiRuntime } from "./src/runtime.js";

const plugin = {
  id: "openclaw-openapi",
  name: "Open API",
  description: "WebSocket-based Open API channel plugin for remote client connections",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setOpenApiRuntime(api.runtime);
    api.registerChannel({ plugin: openApiPlugin });
  },
};

export default plugin;

export { openApiPlugin } from "./src/channel.js";
export { setOpenApiRuntime, getOpenApiRuntime } from "./src/runtime.js";
export * from "./src/types.js";
export * from "./src/config.js";
export * from "./src/gateway.js";
