import type { components, paths } from "../generated/schema";
import type { UploadFailure } from "./policy";

export type UploadedFile = components["schemas"]["FileView"];
export type UploadForm = paths["/api/files"]["post"]["requestBody"]["content"]["multipart/form-data"];
export type UploadPurpose = UploadForm["purpose"];

export type UploadStatus = "queued" | "preparing" | "uploading" | "waiting" | "done" | "failed" | "cancelled";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  previewBlob?: Blob | null;
}

export interface UploadItem<TMeta = unknown> {
  id: string;
  clientUploadId: string;
  purpose: UploadPurpose;
  name: string;
  status: UploadStatus;
  progress: number;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  sourceBytes: number;
  preparedBytes: number | null;
  previewBlob: Blob | null;
  result: UploadedFile | null;
  failure: UploadFailure | null;
  meta: TMeta;
}

export interface TransportRequest {
  url: string;
  fields: Record<string, string>;
  file: Blob;
  fileName: string;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
}

export interface TransportResponse {
  status: number;
  body: unknown;
  retryAfter: string | null;
  sessionRefreshed: boolean;
}

export type TransportErrorKind = "network" | "timeout" | "aborted";

export class TransportError extends Error {
  readonly kind: TransportErrorKind;

  constructor(kind: TransportErrorKind) {
    super(kind);
    this.name = "TransportError";
    this.kind = kind;
  }
}

export type UploadTransport = (request: TransportRequest) => Promise<TransportResponse>;

export type PrepareFn = (source: Blob, context: { signal: AbortSignal }) => Promise<PreparedImage>;

export class PrepareError extends Error {
  readonly kind: "heic" | "decode" | "tooLarge" | "tooSmall" | "encode";

  constructor(kind: PrepareError["kind"], message: string) {
    super(message);
    this.name = "PrepareError";
    this.kind = kind;
  }
}
