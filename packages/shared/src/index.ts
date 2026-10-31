export const SHARED_HELLO = "office-shared-hello-m0";

export const WORKSPACE_ID = "northwind-demo";

export function sharedHello(): string {
  return SHARED_HELLO;
}

export * from "./catalogue/schema.js";
export * from "./catalogue/builds.js";
export * from "./layouts/index.js";
export * from "./world/index.js";
export * from "./people/index.js";
