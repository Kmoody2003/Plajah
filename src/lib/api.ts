
/**
 * Simple API wrapper for Plajah's backend and external services.
 */
export const api = {
  get: async <T>(url: string, headers?: Record<string, string>): Promise<T> => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.statusText}`);
    return res.json();
  },
  post: async <T>(url: string, body: any, headers?: Record<string, string>): Promise<T> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.statusText}`);
    return res.json();
  },
};
