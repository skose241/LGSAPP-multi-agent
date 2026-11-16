import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../client";
import { solutionMutations } from "../queries/solutions";

function fakeClient() {
  const patch = vi.fn().mockResolvedValue({ data: { id: 1 }, response: new Response(null, { status: 200 }) });
  return { client: { PATCH: patch } as unknown as ApiClient, patch };
}

describe("çözüm güncelleme", () => {
  it("mevcut görsel kimliğini korur", async () => {
    const { client, patch } = fakeClient();
    await solutionMutations.update(client, 7, "yeni metin", 42, "rv");
    expect(patch.mock.calls[0]![1].body).toEqual({ text: "yeni metin", imageFileId: 42, rowVersion: "rv" });
  });

  it("görseli olmayan çözümde null gönderir", async () => {
    const { client, patch } = fakeClient();
    await solutionMutations.update(client, 7, "yeni metin", null, "rv");
    expect(patch.mock.calls[0]![1].body.imageFileId).toBeNull();
  });
});
