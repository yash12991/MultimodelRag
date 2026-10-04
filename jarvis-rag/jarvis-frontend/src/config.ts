// API configuration
// In local dev, falls back to http://localhost:8000
// In production (e.g. Vercel), set VITE_API_URL in Vercel project environment variables
export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');
