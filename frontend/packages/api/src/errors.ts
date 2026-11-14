import { parseProblem, type ParsedProblem } from "./problem";

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ParsedProblem;

  constructor(status: number, problem: ParsedProblem) {
    super(problem.message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

interface RawResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export async function unwrap<T>(operation: Promise<RawResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.response.ok) {
    throw new ApiError(result.response.status, parseProblem(result.error, result.response.headers.get("retry-after")));
  }
  return result.data as T;
}
