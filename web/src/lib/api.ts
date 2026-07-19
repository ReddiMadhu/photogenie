/**
 * API Client — typed fetch wrapper for the PhotoGenic API.
 */

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
    throw new Error(err.detail || `API Error ${res.status}`);
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
  };
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
      throw new Error(err.detail || `Upload Error ${res.status}`);
    }
    return res.json();
  },

  deleteAsset: (groupId: string, assetId: string) =>
    request(`/groups/${groupId}/assets/${assetId}`, { method: 'DELETE' }),

  // Search
  searchFace: async (groupId: string, file: File): Promise<SearchResponse> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/groups/${groupId}/search/face`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`Search Error ${res.status}`);
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
    request(`/connectors/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ group_id: groupId, config }),
    }),

  // Admin
  getEval: (groupId: string) =>
    request<EvalResponse>(`/admin/eval/det?group=${groupId}`),
};
