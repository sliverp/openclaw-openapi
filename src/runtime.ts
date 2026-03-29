import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setOpenApiRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getOpenApiRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("OpenAPI runtime not initialized");
  }
  return runtime;
}
