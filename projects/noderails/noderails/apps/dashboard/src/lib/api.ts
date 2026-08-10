const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  import('posthog-js').then(({ default: posthog }) => {
    posthog.capture(event, properties);
  });
}

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

  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }

  // For paginated responses, return { items, total, page, pageSize, totalPages, hasMore }
  if (json.pagination) {
    return {
      items: json.data ?? [],
      ...json.pagination,
      hasMore: json.pagination.page < json.pagination.totalPages,
    } as T;
  }

  return json.data ?? json;
}

// ── Public (no auth) ──

export async function getChainRegistry() {
  return apiFetch<{ chains: import('@noderails/common').MergedChainRegistryEntry[]; updatedAt: string }>(
    '/public/chain-registry',
  );
}

// ── Auth ──

export async function login(email: string, password: string) {
  return apiFetch<{ merchant?: any; member?: any; accessToken: string; isTeamMember?: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string) {
  return apiFetch<{ merchant: any; accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken() {
  return apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
}

export async function getProfile(token: string) {
  return apiFetch<any>('/auth/me', { token });
}

export async function logout() {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export async function updateProfile(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/auth/me', { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function sendOtp(token: string) {
  return apiFetch<{ expiresAt: string }>('/auth/send-otp', { token, method: 'POST' });
}

export async function verifyOtp(token: string, code: string) {
  return apiFetch<{ verified: boolean }>('/auth/verify-otp', {
    token,
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ reset: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

// ── Apps ──

export async function getApps(token: string) {
  return apiFetch<any[]>('/apps', { token });
}

export async function getApp(token: string, appId: string) {
  return apiFetch<any>(`/apps/${appId}`, { token });
}

export async function createApp(token: string, data: { name: string; environment?: string }) {
  const result = await apiFetch<any>('/apps', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_app_created', {
    environment: data.environment ?? 'PRODUCTION',
    app_id: result?.id,
  });
  return result;
}

export async function updateApp(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

// ── App Chains ──

export async function getAppChains(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/chains`, { token });
}

export async function enableAppChain(token: string, appId: string, chainId: string) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}`, { token, method: 'POST' });
}

export async function disableAppChain(token: string, appId: string, chainId: string) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}`, { token, method: 'DELETE' });
}

export async function updateAppChainSettlement(
  token: string,
  appId: string,
  chainId: string,
  settlementAddress: string | null,
) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}/settlement`, {
    token,
    method: 'PATCH',
    body: JSON.stringify({ settlementAddress }),
  });
}

// ── App Tokens ──

export async function getAppTokens(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/tokens`, { token });
}

export async function enableAppToken(token: string, appId: string, tokenId: string) {
  return apiFetch<any>(`/apps/${appId}/tokens/${tokenId}`, { token, method: 'POST' });
}

export async function disableAppToken(token: string, appId: string, tokenId: string) {
  return apiFetch<any>(`/apps/${appId}/tokens/${tokenId}`, { token, method: 'DELETE' });
}

// ── Available Chains & Tokens ──

export async function getAvailableChains(token: string, environment?: 'TEST' | 'PRODUCTION') {
  const params = environment ? `?environment=${environment}` : '';
  return apiFetch<any[]>(`/apps/available-chains${params}`, { token });
}

export async function getAvailableTokens(token: string, environment?: 'TEST' | 'PRODUCTION') {
  const params = environment ? `?environment=${environment}` : '';
  return apiFetch<any[]>(`/apps/available-tokens${params}`, { token });
}

export async function getAvailableCurrencies(token: string) {
  return apiFetch<any[]>(`/apps/available-currencies`, { token });
}

// ── API Keys ──

export async function getApiKeys(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/api-keys`, { token });
}

export async function createApiKey(token: string, appId: string, data: { name?: string; type: 'PUBLIC' | 'SECRET' }) {
  return apiFetch<any>(`/apps/${appId}/api-keys`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function revokeApiKey(token: string, appId: string, keyId: string) {
  return apiFetch<void>(`/apps/${appId}/api-keys/${keyId}`, { token, method: 'DELETE' });
}

// ── Payments ──

export async function getPayments(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payments/intents${qs}`, { token });
}

export async function getPayment(token: string, id: string) {
  return apiFetch<any>(`/payments/intents/${id}`, { token });
}

export async function refundPayment(token: string, id: string, reason: string) {
  return apiFetch<any>(`/payments/intents/${id}/refund`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── Payouts ──

export async function getPayouts(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payouts${qs}`, { token });
}

export async function createPayout(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/payouts', { token, method: 'POST', body: JSON.stringify(data) });
}

// ── Subscriptions ──

export async function getSubscriptions(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/subscriptions${qs}`, { token });
}

export async function createSubscription(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/subscriptions', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_subscription_created', {
    subscription_id: result?.id,
  });
  return result;
}

export async function getSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}`, { token });
}

export async function pauseSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}/pause`, { token, method: 'POST' });
}

export async function resumeSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}/resume`, { token, method: 'POST' });
}

export async function cancelSubscription(token: string, id: string, cancelAtPeriodEnd = false) {
  return apiFetch<any>(`/subscriptions/${id}/cancel`, {
    token,
    method: 'POST',
    body: JSON.stringify({ cancelAtPeriodEnd }),
  });
}

export async function createSubscriptionCheckout(token: string, subscriptionId: string) {
  return apiFetch<any>(`/subscriptions/${subscriptionId}/checkout`, { token, method: 'POST' });
}

// ── Invoices ──

export async function getInvoices(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/invoices${qs}`, { token });
}

export async function createInvoice(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/invoices', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_invoice_created', {
    invoice_id: result?.id,
  });
  return result;
}

export async function getInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}`, { token });
}

export async function openInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}/open`, { token, method: 'POST' });
}

export async function voidInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}/void`, { token, method: 'POST' });
}

export async function sendInvoiceEmail(token: string, id: string) {
  return apiFetch<{ sent: boolean }>(`/invoices/${id}/send`, { token, method: 'POST' });
}

// ── Prices ──

export async function getPrices(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/prices${qs}`);
}

// ── Product Plans ──

export async function getProductPlans(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/product-plans${qs}`, { token });
}

export async function createProductPlan(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/product-plans', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getProductPlan(token: string, planId: string) {
  return apiFetch<any>(`/product-plans/${planId}`, { token });
}

export async function updateProductPlan(token: string, planId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function addProductPlanPrice(token: string, planId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}/prices`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateProductPlanPrice(token: string, planId: string, priceId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}/prices/${priceId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deactivateProductPlanPrice(token: string, planId: string, priceId: string) {
  return apiFetch<any>(`/product-plans/${planId}/prices/${priceId}`, { token, method: 'DELETE' });
}

// ── Customer Accounts ──

export async function getCustomers(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/customers${qs}`, { token });
}

export async function createCustomer(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/customers', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getCustomer(token: string, customerId: string) {
  return apiFetch<any>(`/customers/${customerId}`, { token });
}

export async function updateCustomer(token: string, customerId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/customers/${customerId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

// ── Checkout Sessions ──

export async function getCheckoutSessions(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/checkout-sessions${qs}`, { token });
}

export async function createCheckoutSession(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/checkout-sessions', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_checkout_session_created', {
    checkout_session_id: result?.id,
  });
  return result;
}

// ── Payment Links ──

export async function getPaymentLinks(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payment-links${qs}`, { token });
}

export async function createPaymentLink(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/payment-links', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_payment_link_created', {
    payment_link_id: result?.id,
  });
  return result;
}

export async function getPaymentLink(token: string, id: string) {
  return apiFetch<any>(`/payment-links/${id}`, { token });
}

export async function updatePaymentLink(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/payment-links/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePaymentLink(token: string, id: string) {
  return apiFetch<any>(`/payment-links/${id}`, { token, method: 'DELETE' });
}

// ── Webhooks ──

export async function getWebhooks(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/webhooks`, { token });
}

export async function createWebhook(token: string, appId: string, data: { url: string; events: string[] }) {
  return apiFetch<any>(`/apps/${appId}/webhooks`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(token: string, appId: string, webhookId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(token: string, appId: string, webhookId: string) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}`, { token, method: 'DELETE' });
}

export async function rotateWebhookSecret(token: string, appId: string, webhookId: string) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}/rotate-secret`, { token, method: 'POST' });
}

export async function testPingWebhook(token: string, appId: string, webhookId: string) {
  return apiFetch<{ success: boolean; statusCode: number | null; responseBody: string | null; error: string | null }>(
    `/apps/${appId}/webhooks/${webhookId}/test-ping`, { token, method: 'POST' },
  );
}

export async function getWebhookDeliveries(
  token: string,
  appId: string,
  webhookId: string,
  params?: { status?: string; cursor?: string; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<{ items: any[]; nextCursor: string | null }>(
    `/apps/${appId}/webhooks/${webhookId}/deliveries${query}`, { token },
  );
}

// ── Stats ──

export async function getStats(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/stats${qs}`, { token });
}

// ── Tax Rates ──

export async function getTaxRates(token: string, includeInactive = false) {
  const params = includeInactive ? '?includeInactive=true' : '';
  return apiFetch<any[]>(`/tax-rates${params}`, { token });
}

export async function createTaxRate(token: string, data: {
  displayName: string;
  percentage: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
}) {
  return apiFetch<any>('/tax-rates', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getTaxRate(token: string, id: string) {
  return apiFetch<any>(`/tax-rates/${id}`, { token });
}

export async function updateTaxRate(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/tax-rates/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function archiveTaxRate(token: string, id: string) {
  return apiFetch<any>(`/tax-rates/${id}`, { token, method: 'DELETE' });
}

// ── Disputes (merchant) ──

export async function getMerchantDisputes(
  token: string,
  params: { appId?: string; status?: string; page?: number; pageSize?: number } = {},
) {
  const query = new URLSearchParams();
  if (params.appId) query.set('appId', params.appId);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<any>(`/disputes/merchant${qs}`, { token });
}

export async function getMerchantDispute(token: string, disputeId: string) {
  return apiFetch<any>(`/disputes/merchant/${disputeId}`, { token });
}

export async function respondToDispute(
  token: string,
  disputeId: string,
  response: string,
  proofFile?: File,
) {
  const formData = new FormData();
  formData.append('response', response);
  if (proofFile) formData.append('proof', proofFile);

  const res = await fetch(`${API_BASE}/disputes/merchant/${disputeId}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  return json.data ?? json;
}

// ── Team Members ──

export async function listTeamMembers(token: string) {
  return apiFetch<any[]>('/team', { token });
}

export async function addTeamMember(
  token: string,
  data: { email: string; name?: string; permissions: string[]; allAppsAccess: boolean; appIds?: string[] },
) {
  const result = await apiFetch<any>('/team', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_team_invite_sent', {
    permissions_count: data.permissions.length,
    all_apps_access: data.allAppsAccess,
  });
  return result;
}

export async function updateTeamMember(
  token: string,
  memberId: string,
  data: { name?: string; permissions?: string[]; allAppsAccess?: boolean; appIds?: string[] },
) {
  return apiFetch<any>(`/team/${memberId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function removeTeamMember(token: string, memberId: string) {
  return apiFetch<void>(`/team/${memberId}`, { token, method: 'DELETE' });
}

export async function resendTeamInvite(token: string, memberId: string) {
  const result = await apiFetch<any>(`/team/${memberId}/resend-invite`, { token, method: 'POST' });
  track('dashboard_team_invite_resent');
  return result;
}

// ── Team Member Auth ──

export async function teamRefreshToken() {
  const data = await apiFetch<{ accessToken: string }>('/team/refresh', { method: 'POST' });
  // Decode the access token payload (base64)
  const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
  return {
    accessToken: data.accessToken,
    member: {
      id: payload.sub,
      email: payload.email,
      permissions: payload.permissions ?? [],
      allAppsAccess: payload.allAppsAccess ?? false,
      appIds: payload.appIds ?? [],
      merchantId: payload.merchantId,
      orgName: payload.orgName ?? null,
    },
  };
}

export async function teamLogout() {
  return apiFetch('/team/logout', { method: 'POST' });
}

export async function getInviteInfo(inviteToken: string) {
  return apiFetch<{ email: string; name: string | null; permissions: string[]; orgName: string | null }>(`/team/invite?token=${encodeURIComponent(inviteToken)}`);
}

export async function acceptInvite(inviteToken: string, password: string) {
  return apiFetch<{ member: any; accessToken: string }>('/team/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ inviteToken, password }),
  });
}
