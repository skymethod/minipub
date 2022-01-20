export type Fetcher = (url: string, opts?: { method?: 'GET' | 'POST', headers?: Record<string, string>, body?: string }) => Promise<Response>;
