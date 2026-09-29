import axios from "axios";

// Turns a failed request into a message that says what happened and what to do next.
// `action` completes "Couldn't ...", e.g. "start the build".
export function describeRequestError(error: unknown, action: string) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 503) {
    return "No machine is free yet. One is starting, which can take a few minutes, so try again shortly.";
  }
  if (status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (status === 409) {
    return "ndstill is still working on your last message. Stop it or wait for it to finish.";
  }
  if (axios.isAxiosError(error) && !error.response) {
    return "Can't reach ndstill. Check your connection and try again.";
  }
  // The code tells whoever reads the server logs where to look
  return status ? `Couldn't ${action} (error ${status}). Try again.` : `Couldn't ${action}. Try again.`;
}
