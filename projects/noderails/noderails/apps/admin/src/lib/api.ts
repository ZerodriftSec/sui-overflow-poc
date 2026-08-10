const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((extraHeaders as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...rest,
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }

  if (json.pagination) {
    return {
      items: json.data ?? [],
      ...json.pagination,
      hasMore: json.pagination.page < json.pagination.totalPages,
    } as T;
  }

  return json.data ?? json;
}

// ── Admin Auth ──

export async function adminLogin(email: string, password: string) {
  return apiFetch<{ accessToken: string; admin: { email: string; role: string } }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function adminRefresh() {
  return apiFetch<{ accessToken: string; admin: { email: string; role: string } }>('/admin/auth/refresh', {
    method: 'POST',
  });
}

export async function adminLogout() {
  return apiFetch('/admin/auth/logout', { method: 'POST' });
}

// ── Overview ──

export async function getOverview(token: string) {
  return apiFetch<any>('/admin/overview', { token });
}

// ── Chains ──

export async function getChains(token: string) {
  return apiFetch<any[]>('/admin/chains', { token });
}

export async function createChain(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/chains', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateChain(token: string, chainId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/chains/${chainId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteChain(token: string, chainId: string) {
  return apiFetch<any>(`/admin/chains/${chainId}`, { token, method: 'DELETE' });
}

// ── Tokens ──

export async function getTokens(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/tokens${qs}`, { token });
}

export async function createToken(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/tokens', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateToken(token: string, tokenId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/tokens/${tokenId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteToken(token: string, tokenId: string) {
  return apiFetch<any>(`/admin/tokens/${tokenId}`, { token, method: 'DELETE' });
}

// ── Currencies ──

export async function getCurrencies(token: string) {
  return apiFetch<any[]>('/admin/currencies', { token });
}

export async function createCurrency(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/currencies', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateCurrency(token: string, currencyId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/currencies/${currencyId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCurrency(token: string, currencyId: string) {
  return apiFetch<any>(`/admin/currencies/${currencyId}`, { token, method: 'DELETE' });
}

// ── Merchants ──

export async function getMerchants(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/merchants${qs}`, { token });
}

export async function getMerchantDetail(token: string, merchantId: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}`, { token });
}

export async function suspendMerchant(token: string, merchantId: string, reason?: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}/suspend`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unsuspendMerchant(token: string, merchantId: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}/unsuspend`, { token, method: 'POST' });
}

// ── Apps ──

export async function getAllApps(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/apps${qs}`, { token });
}

// ── Contract Deployments ──

export async function getContractDeployments(token: string) {
  return apiFetch<any[]>('/admin/contracts', { token });
}

export async function createContractDeployment(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/contracts', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateContractDeployment(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/contracts/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteContractDeployment(token: string, id: string) {
  return apiFetch<any>(`/admin/contracts/${id}`, { token, method: 'DELETE' });
}

// ── Timelock Config ──

export async function getTimelockConfig(token: string) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>('/admin/timelock-config', { token });
}

export async function updateTimelockConfig(token: string, data: { disputeStartSeconds?: number; settlementSeconds?: number }) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>('/admin/timelock-config', {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getMerchantTimelockConfig(token: string, merchantId: string) {
  return apiFetch<{
    override: { disputeStartSeconds: number; settlementSeconds: number } | null;
    effective: { disputeStartSeconds: number; settlementSeconds: number };
  }>(`/admin/merchants/${merchantId}/timelock-config`, { token });
}

export async function setMerchantTimelockConfig(
  token: string,
  merchantId: string,
  data: { disputeStartSeconds: number; settlementSeconds: number },
) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>(
    `/admin/merchants/${merchantId}/timelock-config`,
    { token, method: 'PUT', body: JSON.stringify(data) },
  );
}

export async function removeMerchantTimelockConfig(token: string, merchantId: string) {
  return apiFetch<void>(`/admin/merchants/${merchantId}/timelock-config`, { token, method: 'DELETE' });
}

// ── Fee Config ──

export async function getFeeConfig(token: string) {
  return apiFetch<{ feeBps: number }>('/admin/fee-config', { token });
}

export async function updateFeeConfig(token: string, data: { feeBps: number }) {
  return apiFetch<{ feeBps: number }>('/admin/fee-config', {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getMerchantFeeConfig(token: string, merchantId: string) {
  return apiFetch<{
    override: { platformFeeBps: number } | null;
    effective: number;
  }>(`/admin/merchants/${merchantId}/fee-config`, { token });
}

export async function setMerchantFeeConfig(token: string, merchantId: string, data: { feeBps: number }) {
  return apiFetch<{ platformFeeBps: number }>(
    `/admin/merchants/${merchantId}/fee-config`,
    { token, method: 'PUT', body: JSON.stringify(data) },
  );
}

export async function removeMerchantFeeConfig(token: string, merchantId: string) {
  return apiFetch<void>(`/admin/merchants/${merchantId}/fee-config`, { token, method: 'DELETE' });
}

// ── Webhook Delivery Config ──

export async function getWebhookConfig(token: string) {
  return apiFetch<{
    redundantSends: number;
    redundantDelaysMs: number[];
    baseDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
    maxRetries: number;
  }>('/admin/webhook-config', { token });
}

export async function updateWebhookConfig(token: string, data: {
  redundantSends?: number;
  redundantDelaysMs?: number[];
  baseDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  maxRetries?: number;
}) {
  return apiFetch<{
    redundantSends: number;
    redundantDelaysMs: number[];
    baseDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
    maxRetries: number;
  }>('/admin/webhook-config', {
    token, method: 'PUT', body: JSON.stringify(data),
  });
}

// ── Merchant Refunds ──

export async function getMerchantRefunds(token: string, merchantId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/merchants/${merchantId}/refunds${qs}`, { token });
}

// ── Disputes ──

export async function getDisputes(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/disputes/admin${qs}`, { token });
}

export async function getDispute(token: string, disputeId: string) {
  return apiFetch<any>(`/disputes/admin/${disputeId}`, { token });
}

export async function resolveDispute(token: string, disputeId: string, winner: 'MERCHANT' | 'CUSTOMER') {
  return apiFetch<any>(`/disputes/admin/${disputeId}/resolve`, {
    token, method: 'POST', body: JSON.stringify({ winner }),
  });
}

// ── Feedback ──

export async function getFeedbackSubmissions(
  token: string,
  params?: Record<string, string>,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/feedback${qs}`, { token });
}

export async function updateFeedbackSubmissionStatus(
  token: string,
  id: string,
  status: 'NEW' | 'REVIEWED' | 'CLOSED',
) {
  return apiFetch<any>(`/admin/feedback/${id}/status`, {
    token,
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}
