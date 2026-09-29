import axios from "axios";

// Turns a failed request into a message that says what happened and what to do next
export function describeRequestError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 503) {
      return "All machines are busy. A new one is starting, so try again in about a minute.";
    }
    if (error.response?.status === 401) {
      return "Your session has ended. Sign in again to continue.";
    }
    if (!error.response) {
      return "Can't reach ndstill. Check your connection and try again.";
    }
  }
  return fallback;
}
