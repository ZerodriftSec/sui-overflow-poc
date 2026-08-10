import {
  ApiError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./errors";

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  apiVersion?: string;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly apiVersion?: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
    this.apiVersion = config.apiVersion;
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (this.apiVersion) {
      headers["NodeRails-Version"] = this.apiVersion;
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    return { ...headers, ...options.headers };
  }

  /**
   * Make a request and unwrap the `{ success, data }` envelope.
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(
          `Request to ${options.method} ${options.path} timed out after ${this.timeout}ms`,
        );
      }
      throw new ConnectionError(
        `Failed to connect to ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      this.throwApiError(response.status, body);
    }

    const apiResponse = body as ApiSuccessResponse<T>;
    return apiResponse.data;
  }

  /**
   * Make a request that returns a paginated list.
   */
  async requestPaginated<T>(options: RequestOptions): Promise<PaginatedResult<T>> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(
          `Request to ${options.method} ${options.path} timed out after ${this.timeout}ms`,
        );
      }
      throw new ConnectionError(
        `Failed to connect to ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      this.throwApiError(response.status, body);
    }

    const apiResponse = body as ApiPaginatedResponse<T>;
    return {
      data: apiResponse.data,
      pagination: apiResponse.pagination,
    };
  }

  /**
   * Make a request that returns a raw array (non-paginated list).
   */
  async requestList<T>(options: RequestOptions): Promise<T[]> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(
          `Request to ${options.method} ${options.path} timed out after ${this.timeout}ms`,
        );
      }
      throw new ConnectionError(
        `Failed to connect to ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      this.throwApiError(response.status, body);
    }

    const apiResponse = body as ApiSuccessResponse<T[]>;
    return apiResponse.data;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private throwApiError(status: number, body: unknown): never {
    const errorBody = body as ApiErrorResponse | null;
    const code = errorBody?.error?.code ?? "UNKNOWN_ERROR";
    const message = errorBody?.error?.message ?? `API request failed with status ${status}`;
    const details = errorBody?.error?.details;

    switch (status) {
      case 401:
        throw new AuthenticationError(message, details);
      case 403:
        throw new PermissionError(message, details);
      case 404:
        throw new NotFoundError(message, details);
      case 400:
      case 422:
        throw new ValidationError(status, message, details);
      case 429: {
        const retryAfter = undefined; // Could parse Retry-After header if available
        throw new RateLimitError(message, retryAfter, details);
      }
      default:
        throw new ApiError(status, code, message, details);
    }
  }
}
