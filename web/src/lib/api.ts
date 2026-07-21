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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(humanizeError(res.status, err.detail));
  }

  return res.json();
}

// --- Types ---
export interface Group {
  id: string;
  tenant_id: string;
  name: string;
  owner_user_id?: string;
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

export interface SearchResult {
  person_id?: string;
  person_name?: string;
  score: number;
  face_count: number;
  evidence: {
    cosine_similarity: number;
    quality_score?: number;
    verifier_score?: number;
    group_id: string;
    match_count?: number;
  }[];
  asset_ids: string[];
}

export interface SearchResponse {
  query_faces_detected: number;
  results: SearchResult[];
  total_candidates_scanned: number;
  search_time_ms: number;
}

export interface EvalResponse {
  group_id: string;
  tau_assign: number;
  tau_search: number;
  pair_count: number;
  recall_at_50?: number;
  cluster_purity?: number;
  calibrated_at?: string;
}

export interface ConnectorResponse {
  id: string;
  group_id: string;
  kind: string;
  status: string;
}

// --- API Methods ---
export const api = {
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
    const res = await fetch(`${API_BASE}/groups/${groupId}/assets`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(humanizeError(res.status, err.detail));
    }
    return res.json();
  },

  deleteAsset: (groupId: string, assetId: string) =>
    request(`/groups/${groupId}/assets/${assetId}`, { method: 'DELETE' }),

  listAssets: (groupId: string, limit?: number, offset?: number) =>
    request<{ assets: Asset[]; total: number }>(`/groups/${groupId}/assets?limit=${limit || 50}&offset=${offset || 0}`),

  // Search
  searchFace: async (groupId: string, file: File): Promise<SearchResponse> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/groups/${groupId}/search/face`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '' }));
      throw new Error(humanizeError(res.status, err.detail));
    }
    return res.json();
  },

  // Persons
  listPersons: (groupId: string) =>
    request<{ persons: Person[]; total: number }>(`/groups/${groupId}/persons`),

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

  // Admin
  getEval: (groupId: string) =>
    request<EvalResponse>(`/admin/eval/det?group=${groupId}`),
};

/** Build a URL to stream an asset's original image from the API. */
export function getAssetImageUrl(assetId: string): string {
  return `${API_BASE}/assets/${assetId}/image`;
}
