/**
 * API Client — typed fetch wrapper for the PhotoGenic API.
 */

/** Map technical errors to human-friendly messages. */
function humanizeError(status: number, detail: string): string {
  if (status === 502 || status === 503) return 'We\'re having trouble connecting to our servers. Please try again in a moment.';
  if (status === 504) return 'The request took too long. Please try again.';
  if (status === 413) return 'This file is too large. Please use an image under 20MB.';
  if (status === 404) return 'We couldn\'t find what you\'re looking for. It may have been moved or deleted.';
  if (status === 429) return 'You\'re making requests too quickly. Please wait a moment and try again.';
  if (status === 401 || status === 403) return 'You don\'t have access to this resource. Please check your permissions.';
  if (detail?.toLowerCase().includes('no face')) return 'We couldn\'t detect a face in this photo. Try using a clearer image.';
  if (detail?.toLowerCase().includes('quota')) return 'This project has reached its photo limit. Remove some photos or contact support.';
  if (detail?.toLowerCase().includes('parse') || detail?.toLowerCase().includes('json')) return 'The data format doesn\'t look right. Please check your input and try again.';
  return detail || 'Something went wrong. Please try again.';
}

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/v1`;
const TOKEN_KEY = 'photogenic_access_token';

let authReady: Promise<void> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Bootstrap a development JWT if none is stored. */
export async function ensureAuth(): Promise<void> {
  if (getAccessToken()) return;
  if (!authReady) {
    authReady = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/dev-token`, { method: 'POST' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.access_token) setAccessToken(data.access_token);
      } catch {
        // Gateway may be down or production-locked; leave unauthenticated
      } finally {
        authReady = null;
      }
    })();
  }
  await authReady;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  await ensureAuth();
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };
  // Only set JSON content-type when we are sending a body that isn't FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err.detail === 'string' ? err.detail : res.statusText;
    throw new Error(humanizeError(res.status, detail));
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  await ensureAuth();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err.detail === 'string' ? err.detail : res.statusText;
    throw new Error(humanizeError(res.status, detail));
  }
  return res.json();
}

// --- Types ---
export interface Group {
  id: string;
  tenant_id: string;
  owner_user_id?: string;
  name: string;
  max_active_images: number;
  active_image_count: number;
  quota_remaining: number;
  status: string;
  created_at: string;
}

export interface Person {
  id: string;
  group_id: string;
  name?: string;
  face_count: number;
  rep_face_url?: string;
  consent_state: string;
  is_hidden: boolean;
  created_at: string;
}

export interface PersonFace {
  id: string;
  asset_id: string;
  crop_url?: string;
  quality?: number;
  bbox?: number[];
}

export interface Asset {
  id: string;
  group_id: string;
  filename?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  taken_at?: string;
  status: string;
  face_count: number;
  thumbnail_url?: string;
}

export interface EvidencePayload {
  query_crop_url?: string;
  matched_crop_url?: string;
  cosine_similarity: number;
  quality_score?: number;
  verifier_score?: number;
  source?: string;
  acl_basis?: string;
  group_id: string;
  match_count?: number;
  query_face_id?: string;
  matched_face_id?: string;
}

export interface SearchResult {
  person_id?: string;
  person_name?: string;
  score: number;
  face_count: number;
  evidence: EvidencePayload[];
  assets?: Asset[];
  asset_ids: string[];
}

export interface SearchResponse {
  query_faces_detected: number;
  query_face_used?: {
    bbox: number[];
    det_score: number;
    quality?: number;
  };
  results: SearchResult[];
  total_candidates_scanned: number;
  search_time_ms: number;
}

export interface DETPoint {
  fmr: number;
  fnmr: number;
}

export interface EvalResponse {
  group_id: string;
  tau_assign: number;
  tau_search: number;
  pair_count: number;
  det_curve?: DETPoint[];
  recall_at_50?: number;
  cluster_purity?: number;
  calibrated_at?: string;
}

export interface CalibrateResponse {
  group_id: string;
  tau_assign: number;
  tau_search: number;
  pair_count: number;
  message?: string;
}

export interface ConnectorResponse {
  id: string;
  group_id: string;
  kind: string;
  status: string;
  last_sync_at?: string;
  last_error?: string;
}

export interface HealthDepsResponse {
  status: string;
  dependencies: Record<string, { status: string; type?: string; detail?: string }>;
}

// --- API Methods ---
export const api = {
  // Auth
  ensureAuth,
  getMe: () => request<{ id: string; email: string; name?: string; is_admin: boolean }>('/auth/me'),

  // Groups
  listGroups: () => request<{ groups: Group[]; total: number }>('/groups'),
  getGroup: (id: string) => request<Group>(`/groups/${id}`),
  createGroup: (name: string, max?: number) =>
    request<Group>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, max_active_images: max || 15000 }),
    }),

  // Assets
  uploadAsset: async (groupId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm(`/groups/${groupId}/assets`, form);
  },

  deleteAsset: (groupId: string, assetId: string) =>
    request(`/groups/${groupId}/assets/${assetId}`, { method: 'DELETE' }),

  listAssets: (groupId: string, limit?: number, offset?: number) =>
    request<{ assets: Asset[]; total: number }>(
      `/groups/${groupId}/assets?limit=${limit || 50}&offset=${offset || 0}`,
    ),

  // Search
  searchFace: async (groupId: string, file: File): Promise<SearchResponse> => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<SearchResponse>(`/groups/${groupId}/search/face`, form);
  },

  // Persons
  listPersons: (groupId: string, limit?: number, offset?: number) =>
    request<{ persons: Person[]; total: number }>(
      `/groups/${groupId}/persons?limit=${limit || 50}&offset=${offset || 0}`,
    ),

  listPersonFaces: (groupId: string, personId: string, limit?: number, offset?: number) =>
    request<{ faces: PersonFace[]; total: number }>(
      `/groups/${groupId}/persons/${personId}/faces?limit=${limit || 100}&offset=${offset || 0}`,
    ),

  mergePerson: (groupId: string, targetId: string, sourceIds: string[]) =>
    request(`/groups/${groupId}/persons/${targetId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ source_person_ids: sourceIds }),
    }),

  splitPerson: (groupId: string, personId: string, faceIds: string[]) =>
    request(`/groups/${groupId}/persons/${personId}/split`, {
      method: 'POST',
      body: JSON.stringify({ face_ids: faceIds }),
    }),

  renamePerson: (groupId: string, personId: string, name: string) =>
    request(`/groups/${groupId}/persons/${personId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deletePerson: (groupId: string, personId: string) =>
    request(`/groups/${groupId}/persons/${personId}`, { method: 'DELETE' }),

  // Feedback
  submitFeedback: (groupId: string, queryFace: string, candFace: string, label: boolean) =>
    request(`/groups/${groupId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ query_face: queryFace, cand_face: candFace, label }),
    }),

  // Connectors
  createConnector: (kind: string, groupId: string, config: Record<string, unknown>) =>
    request<ConnectorResponse>(`/connectors/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ group_id: groupId, config }),
    }),
  listConnectors: (groupId: string) =>
    request<ConnectorResponse[]>(`/connectors?group_id=${groupId}`),
  syncConnector: (connectorId: string) =>
    request<{ status: string; queued?: boolean }>(`/connectors/${connectorId}/sync`, {
      method: 'POST',
    }),

  // Admin
  getEval: (groupId: string) =>
    request<EvalResponse>(`/admin/eval/det?group=${groupId}`),
  calibrate: (groupId: string) =>
    request<CalibrateResponse>(`/admin/calibrate?group=${groupId}`, { method: 'POST' }),
  getHealthDeps: async (): Promise<HealthDepsResponse> => {
    await ensureAuth();
    const base = `${window.location.protocol}//${window.location.hostname}:8000`;
    const res = await fetch(`${base}/health/deps`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(humanizeError(res.status, err.detail || res.statusText));
    }
    return res.json();
  },
};

/** Build a URL to stream an asset's original image from the API. */
export function getAssetImageUrl(assetId: string): string {
  return `${API_BASE}/assets/${assetId}/image`;
}

/** Build a URL to stream a face crop. */
export function getFaceCropUrl(faceId: string): string {
  return `${API_BASE}/faces/${faceId}/crop`;
}

/** Absolute crop URL helper when backend already returns a relative path. */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/v1/')) {
    return `${window.location.protocol}//${window.location.hostname}:8000${url}`;
  }
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Fetch a protected media URL with Authorization and return an object URL.
 * Caller must revokeObjectURL when done.
 */
export async function fetchAuthenticatedMedia(url: string): Promise<string> {
  await ensureAuth();
  const resolved = resolveMediaUrl(url) || url;
  const res = await fetch(resolved, { headers: authHeaders() });
  if (!res.ok) throw new Error(humanizeError(res.status, 'Media fetch failed'));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
