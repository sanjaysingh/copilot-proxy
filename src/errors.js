export class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function toOpenAiError(error) {
  return {
    error: {
      message: error.message || "Unexpected error",
      type: error.type || "server_error",
      code: error.code || null
    }
  };
}
