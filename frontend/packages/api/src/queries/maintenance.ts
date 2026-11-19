import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type FileCleanupResult = components["schemas"]["FileCleanupResult"];

export const maintenanceMutations = {
  cleanupFiles: (client: ApiClient) => unwrap(client.POST("/api/admin/files/cleanup")),
};
