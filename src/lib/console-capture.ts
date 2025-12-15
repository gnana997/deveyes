/**
 * Console Capture
 * Captures browser console output and network errors
 */

import { Page, ConsoleMessage, Request, Response } from 'playwright';

/**
 * Captured console output data
 */
export interface ConsoleCaptureResult {
  /** Console error messages */
  errors: string[];
  /** Console warning messages */
  warnings: string[];
  /** Network errors (4xx, 5xx responses) */
  networkErrors: string[];
  /** Info messages (optional, disabled by default) */
  info?: string[];
  /** Log messages (optional, disabled by default) */
  logs?: string[];
}

/**
 * Options for console capture
 */
export interface ConsoleCaptureOptions {
  /** Capture info messages (default: false) */
  captureInfo?: boolean;
  /** Capture log messages (default: false) */
  captureLogs?: boolean;
  /** Maximum messages per category (default: 50) */
  maxMessages?: number;
}

/**
 * Console capture handler class
 */
export class ConsoleCaptureHandler {
  private errors: string[] = [];
  private warnings: string[] = [];
  private networkErrors: string[] = [];
  private info: string[] = [];
  private logs: string[] = [];
  private options: Required<ConsoleCaptureOptions>;
  private consoleHandler: ((msg: ConsoleMessage) => void) | null = null;
  private responseHandler: ((response: Response) => void) | null = null;
  private requestFailedHandler: ((request: Request) => void) | null = null;

  constructor(options: ConsoleCaptureOptions = {}) {
    this.options = {
      captureInfo: options.captureInfo ?? false,
      captureLogs: options.captureLogs ?? false,
      maxMessages: options.maxMessages ?? 50,
    };
  }

  /**
   * Attach console listeners to a page
   */
  attach(page: Page): void {
    // Console message handler
    this.consoleHandler = (msg: ConsoleMessage) => {
      const type = msg.type();
      const text = msg.text();

      switch (type) {
        case 'error':
          this.addMessage(this.errors, text);
          break;
        case 'warning':
          this.addMessage(this.warnings, text);
          break;
        case 'info':
          if (this.options.captureInfo) {
            this.addMessage(this.info, text);
          }
          break;
        case 'log':
          if (this.options.captureLogs) {
            this.addMessage(this.logs, text);
          }
          break;
      }
    };

    // Network response handler (4xx, 5xx)
    this.responseHandler = (response: Response) => {
      const status = response.status();
      if (status >= 400) {
        const request = response.request();
        const method = request.method();
        const url = this.truncateUrl(request.url());
        const message = `${method} ${url} ${status}`;
        this.addMessage(this.networkErrors, message);
      }
    };

    // Request failed handler (network errors)
    this.requestFailedHandler = (request: Request) => {
      const failure = request.failure();
      if (failure) {
        const method = request.method();
        const url = this.truncateUrl(request.url());
        const message = `${method} ${url} FAILED: ${failure.errorText}`;
        this.addMessage(this.networkErrors, message);
      }
    };

    page.on('console', this.consoleHandler);
    page.on('response', this.responseHandler);
    page.on('requestfailed', this.requestFailedHandler);
  }

  /**
   * Detach console listeners from a page
   */
  detach(page: Page): void {
    if (this.consoleHandler) {
      page.off('console', this.consoleHandler);
      this.consoleHandler = null;
    }
    if (this.responseHandler) {
      page.off('response', this.responseHandler);
      this.responseHandler = null;
    }
    if (this.requestFailedHandler) {
      page.off('requestfailed', this.requestFailedHandler);
      this.requestFailedHandler = null;
    }
  }

  /**
   * Get captured console output
   */
  getCapture(): ConsoleCaptureResult {
    const result: ConsoleCaptureResult = {
      errors: [...this.errors],
      warnings: [...this.warnings],
      networkErrors: [...this.networkErrors],
    };

    if (this.options.captureInfo) {
      result.info = [...this.info];
    }

    if (this.options.captureLogs) {
      result.logs = [...this.logs];
    }

    return result;
  }

  /**
   * Clear all captured messages
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.networkErrors = [];
    this.info = [];
    this.logs = [];
  }

  /**
   * Check if there are any errors or warnings
   */
  hasIssues(): boolean {
    return this.errors.length > 0 || this.warnings.length > 0 || this.networkErrors.length > 0;
  }

  /**
   * Add a message to a category, respecting max limit
   */
  private addMessage(array: string[], message: string): void {
    if (array.length < this.options.maxMessages) {
      array.push(message);
    } else if (array.length === this.options.maxMessages) {
      array.push(`... (truncated, max ${this.options.maxMessages} messages)`);
    }
  }

  /**
   * Truncate URL for readability
   */
  private truncateUrl(url: string, maxLength: number = 100): string {
    if (url.length <= maxLength) {
      return url;
    }
    return url.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Create a new console capture instance
 */
export function createConsoleCapture(options?: ConsoleCaptureOptions): ConsoleCaptureHandler {
  return new ConsoleCaptureHandler(options);
}
