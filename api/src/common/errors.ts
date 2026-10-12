/**
 * Domain errors.
 *
 * Business-rule failures (not enough balance, unknown symbol) are expected
 * outcomes, not bugs — they must reach the client as a readable message with the
 * right status, not a 500. Every service throws these; the filter below turns
 * them into responses.
 */

export class TradeError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

export class NotFoundError extends TradeError {
  constructor(message = 'یافت نشد') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends TradeError {
  constructor(message = 'دسترسی مجاز نیست') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/** The user has more money/gold than the operation allows. */
export class InsufficientFundsError extends TradeError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'InsufficientFundsError';
  }
}

/** A journal entry did not balance — indicates a bug, so 500. */
export class UnbalancedEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnbalancedEntryError';
  }
}
