import { UploadQueue, createXhrTransport, type UploadQueueOptions } from "@lgs/api";
import { endSession } from "@/lib/api/client";
import { browserImageDeps } from "@/lib/image/browser";
import { prepareImage } from "@/lib/image/prepare";

export function createWebUploadQueue<TMeta = undefined>(options: Partial<UploadQueueOptions> = {}): UploadQueue<TMeta> {
  return new UploadQueue<TMeta>({
    transport: createXhrTransport(),
    prepare: (source, context) => prepareImage(source, browserImageDeps, context),
    onUnauthorized: () => endSession("oturum"),
    ...options,
  });
}
