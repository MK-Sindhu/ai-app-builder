
// Set NEXT_PUBLIC_BACKEND_URL when building for production. It's baked into the bundle at build time.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:9090";
