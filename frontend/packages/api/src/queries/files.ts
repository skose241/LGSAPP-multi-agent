import type { ApiClient } from "../client";
import { unwrap } from "../errors";

export const fileMutations = {
  remove: (client: ApiClient, id: number) => unwrap(client.DELETE("/api/files/{id}", { params: { path: { id } } })),
};
