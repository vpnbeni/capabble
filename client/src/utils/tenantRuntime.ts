
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const getHostname = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.hostname.toLowerCase();
};

const getSearchParams = () => {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
};

const sanitizeTenantSlug = (value: string | null | undefined): string | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return TENANT_SLUG_PATTERN.test(normalized) ? normalized : null;
};

export const getRootAppDomain = () => import.meta.env.VITE_ROOT_APP_DOMAIN || 'school.capabble.cloud';
export const getRootApiDomain = () => import.meta.env.VITE_ROOT_API_DOMAIN || 'api.capabble.cloud';
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const isLocalRuntime = () => {
  const hostname = getHostname();
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
};

// Resolves tenant slug from (in priority order):
// 1. URL query param (?tenant=slug) — highest priority, works everywhere
// 2. localStorage — persisted after first login or email resolution
// Subdomain-based resolution is no longer used (single-URL model: school.capabble.cloud).
export const resolveTenantSlug = (): string | null => {
  const params = getSearchParams();
  const fromQuery = sanitizeTenantSlug(params.get('tenant'));

  if (fromQuery) {
    localStorage.setItem('tenantSlug', fromQuery);
    return fromQuery;
  }

  const fromStorage = sanitizeTenantSlug(localStorage.getItem('tenantSlug'));
  if (fromStorage) {
    return fromStorage;
  }

  return null;
};

export const resolveApiBaseUrl = (): string => {
  if (isLocalRuntime()) {
    return trimTrailingSlash(import.meta.env.VITE_LOCAL_API_URL
      || import.meta.env.VITE_API_URL
      || 'http://localhost:5000/api');
  }

  // Single API server at root domain for all tenants.
  const rootApiDomain = getRootApiDomain();
  return `https://${rootApiDomain}/api`;
};

export const resolvePlatformAdminApiBaseUrl = (): string => {
  if (isLocalRuntime()) {
    const localApiBase = trimTrailingSlash(
      import.meta.env.VITE_LOCAL_API_URL
      || import.meta.env.VITE_API_URL
      || 'http://localhost:5000/api'
    );
    return `${localApiBase}/admin`;
  }

  return `https://${getRootApiDomain()}/api/admin`;
};

export const buildTenantAppRedirectUrl = (tenantSlug: string, ticket: string): string => {
  const encodedSlug = encodeURIComponent(tenantSlug);
  const encodedTicket = encodeURIComponent(ticket);

  // Single-URL model: always use current origin (school.capabble.cloud in production)
  return `${window.location.origin}/?tenant=${encodedSlug}#/signup/complete?ticket=${encodedTicket}`;
};

export const getTenantHeader = (): string | null => {
  // Returns the active tenant slug for the x-tenant-slug request header.
  return resolveTenantSlug();
};
