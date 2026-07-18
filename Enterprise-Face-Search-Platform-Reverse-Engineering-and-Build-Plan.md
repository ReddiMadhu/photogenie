# Reverse-Engineering Immich, PhotoPrism, DeepFace & InsightFace
## Module-by-Module Source Analysis + Implementation Plan for the Enterprise Face Search Platform

**Prepared:** July 2026 · **Revised:** July 2026 (15K-per-group sizing) · **Scope:** source-level architecture analysis of the four reference projects, a module-by-module comparison (what each component does, which algorithm, where data is stored, where it can be improved), and a phased build plan for your Enterprise Face Search Platform (InsightFace + FAISS→Qdrant + PostgreSQL + FastAPI + React + Celery).

**Operating constraint (load-bearing):** each **search group** (a user-selected/uploaded folder or section) holds at most **15,000 active images**. Face search, clustering, and hybrid retrieval are always scoped to one group. The platform may host many users and many groups; 15K is a **per-group** hard limit, not a platform-wide ceiling.

---

# Executive Summary

The four projects sit at **three different layers of the stack**, and understanding that is the key to the whole comparison:

| Project | What it actually is | Layer |
|---|---|---|
| **Immich** (v3.0, 2026) | Self-hosted photo-management *platform* (the closest thing to your product) | Full product: ingestion → ML → storage → search → UI |
| **PhotoPrism** | Self-hosted photo-management *platform* with a much weaker ML core | Full product, 2018-era ML |
| **DeepFace** | Python *library* wrapping 11+ recognition models and 13 detectors behind one API | Model wrapper / benchmarking tool |
| **InsightFace** | The CV *model zoo + inference toolkit* that Immich itself is built on | Model layer: detection, alignment, recognition, training code |

The single most important finding from the source: **Immich uses exactly your chosen stack** — InsightFace RetinaFace (`det_10g`) + ArcFace (`w600k_r50`, 512-D) + PostgreSQL for metadata — and its face recognition quality is still its users' #1 complaint. The gap is not the models; it is everything *above* the models: Immich has no face-quality gating, no real clustering (it does single-pass nearest-neighbor person assignment), no reranking, no feedback-driven threshold calibration, and no hybrid retrieval. PhotoPrism is worse at the model layer (Pigo cascades + 128-D FaceNet, brute-force matching). DeepFace and InsightFace ship nothing above the embedding.

**That gap is your product.** The build plan in Part 5 takes your already-decided stack and adds the layers all four projects lack: a person/identity entity layer, quality-weighted two-stage retrieval, offline+online clustering, feedback-driven calibration, dedup, OCR/CLIP hybrid search, and enterprise governance — **sized for ≤15K images per searchable group**, with an explicit upgrade path when aggregate scale or concurrency demands it.

One critical licensing finding (verified July 2026): **InsightFace model packs (buffalo_l etc.) are non-commercial research only**; the code is MIT. InsightFace began offering commercial model licensing in Nov 2025 (`recognition-oss-pack@insightface.ai`). For an enterprise commercial product this must be resolved in week 0 — see §5.13.

**Sizing assumptions used throughout Part 5:**
| Assumption | Value | Rationale |
|---|---|---|
| Max active images / search group | **15,000** | Hard product quota |
| Faces / image (p50 / p95 / worst) | ~2 / ~8 / ~50 | Mixed portraits + group photos |
| Face vectors / group (design envelope) | **~30K typical, ≤150K worst** | 15K × faces/image |
| Platform scale | Many tenants × many groups | Isolation via `group_id`, not one global corpus |
| v1 infra posture | Lean single-node / Compose | Distributed stack deferred until §5.14 triggers |

---

# Part 1 — The Four Projects at a Glance

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Repo | `immich-app/immich` | `photoprism/photoprism` | `serengil/deepface` | `deepinsight/insightface` |
| Type | Self-hosted photo cloud | Self-hosted photo archive | Python FR library | Face analysis toolbox + model zoo |
| Language | TypeScript (NestJS) + Python ML service + SvelteKit + Flutter | Go + Vue | Python | Python (PyTorch/MXNet training, ONNX inference) |
| Current state (Jul 2026) | v3.0.0 — stable since v2.0 (Oct 2025); very active | Actively maintained; "Vision" sidecar added for AI captions/labels | v0.0.9x; 11 models, 13 detectors | **InsightFace 1.0** (May 2026): lighter install, Evaluation Studio GUI; commercial model licensing introduced Nov 2025 |
| DB | PostgreSQL 14 + pgvector + **VectorChord** (migrated off pgvecto.rs in v1.133) | MariaDB / SQLite | None (pickle caches) | None |
| Vector search | VectorChord `vchordrq` index inside Postgres | Brute force in Go over embeddings stored as JSON in MariaDB | Brute force over `.pkl`; optional FAISS in recent releases | None (leaves it to the user) |
| Queue | BullMQ on Redis (Valkey) | In-process workers | None | None |
| Face models | InsightFace **buffalo_l**: RetinaFace `det_10g` + ArcFace `w600k_r50` (512-D) | **Pigo** cascade detector + **FaceNet** 128-D (TensorFlow 1.x C API) | Wrapper: VGG-Face, FaceNet/512, OpenFace, DeepFace, DeepID, ArcFace, Dlib, SFace, GhostFaceNet, buffalo_l | **The source**: RetinaFace/SCRFD detectors, ArcFace/GlintR100 recognizers, alignment, attributes |
| Semantic search | OpenCLIP text→image search | Labels via NasNet; captions via Vision sidecar (Ollama) | None | None |
| Multi-user / auth | Multi-user, OIDC, API keys, partner sharing | Single-admin orientation, basic multi-user | None | None |
| License | AGPLv3 | AGPLv3 (+ paid Essentials/Plus) | MIT | Code MIT; **models non-commercial** (commercial license now available) |

---

# Part 2 — Source-Level Deep Dives

## 2.1 Immich — the closest architectural relative (and cautionary tale)

### 2.1.1 Repository & service map

```
immich-app/immich (monorepo)
├── server/                  NestJS + TypeScript API server (port 2283)
│   └── src/
│       ├── services/        person.service, asset.service, metadata.service,
│       │                    search.service, smart-info.service, duplicate.service,
│       │                    media.service, library.service, job.service …
│       ├── repositories/    Kysely (type-safe SQL) — replaced TypeORM in 2024
│       ├── dtos/            OpenAPI-generated DTOs
│       └── queues/          BullMQ queue definitions (Redis/Valkey)
├── machine-learning/        Python 3 FastAPI service (the entire ML brain)
│   └── immich_ml/
│       ├── models/          facial_recognition/, clip/, (ocr added 2025–26)
│       ├── sessions/        ONNXRuntime session management, model cache
│       └── main.py          /facial-recognition, /clip-textual, /clip-visual
├── web/                     SvelteKit SPA
├── mobile/                  Flutter app
└── docker/                  compose: server + machine-learning + redis(valkey) + postgres
```

Runtime topology (verified from the current `docker-compose.yml`, v3.0):

- `immich-server` — one process serving API + websockets; BullMQ workers run in-process against **Redis (Valkey)** queues.
- `immich-machine-learning` — stateless Python inference service; models cached in a `model-cache` volume at `/cache`; hardware-accelerated image variants (`-cuda`, `-openvino`, `-armnn`, `-rocm`, `-rknn`).
- `database` — PostgreSQL 14 image bundled with **VectorChord 0.4.x + pgvector 0.2.x** extensions.
- Filesystem (`UPLOAD_LOCATION`) — originals, generated thumbnails, encoded videos, profile images.

### 2.1.2 The face pipeline, exactly as the code does it

1. **Upload / library scan** → asset row created; SHA-1 checksum deduped at ingest; jobs enqueued on BullMQ (`METADATA_EXTRACTION`, `THUMBNAIL_GENERATION`, `SMART_SEARCH`, `FACIAL_RECOGNITION` …).
2. **`FACIAL_RECOGNITION` job** (`server/src/services/person.service.ts`) fetches the *preview-sized* image and POSTs it to the ML service `/facial-recognition` endpoint.
3. **ML service — detection** (`machine-learning/immich_ml/models/facial_recognition/`): loads InsightFace model pack **buffalo_l**. Detector = `det_10g.onnx` — **RetinaFace** (MobileNet-0.25 backbone, single 640×640 input scale, anchor-based, 5-point landmarks, NMS). Returns boxes, landmarks, det-score. **One pass, one scale.**
4. **ML service — alignment + embedding**: per face, `insightface.utils.face_align.norm_crop` (similarity transform from the 5 landmarks to the canonical 112×112 ArcFace template) → `w600k_r50.onnx` (**ArcFace ResNet-50 trained on WebFace600K**) → 512-D L2-normalized embedding.
5. **Server — persistence**: writes one `asset_faces` row per face (bbox, landmarks-as-geometry, personId nullable) and one row in **`face_search`** (`assetId`, `embedding vector(512)`) with a **VectorChord `vchordrq` HNSW-style index** on the embedding.
6. **Server — person assignment** (this is Immich's entire "clustering"): for each new face, run an ANN search over `face_search` for faces within a configurable cosine-distance threshold (default ≈ 0.5 distance, admin-tunable min-score/min-faces); take the **majority `personId` among the matches**; if a majority exists, assign the face to that person, else create a new anonymous person. Re-running the job can re-assign. **There is no global clustering pass, no cluster-quality model, no automatic merge/split** — merges and renames are manual UI operations.
7. **People UI**: person thumbnails (`person.faceAssetId`), manual merge, hide, rename, "feature face" selection.

### 2.1.3 Smart search (CLIP) — a second, disconnected index

`smart-info.service` sends the preview image to the ML service CLIP encoder (OpenCLIP visual ONNX; default ViT-B-32 family, with newer SigLIP-family options in 2025–26 releases) → 512-D embedding stored in **`smart_search.clipEmbedding`** (also VectorChord-indexed). Text search encodes the query with the CLIP text encoder and runs ANN over `smart_search`. **Face search and CLIP search are completely separate features with no fusion.**

### 2.1.4 Where Immich stores data

| Data | Location |
|---|---|
| Originals, thumbnails, transcoded video | Filesystem `UPLOAD_LOCATION` (`library/`, `thumbs/`, `encoded-video/`, `profile/`) |
| Asset metadata, albums, users, shares | PostgreSQL tables (`asset`, `exif`, `album`, `user`, `partner` …) |
| Face boxes/landmarks/person link | `asset_faces` |
| Face embeddings (512-D) | `face_search` — VectorChord `vchordrq` index |
| CLIP embeddings | `smart_search` |
| Persons | `person` (name, birthDate, faceAssetId, isHidden) |
| Job state | Redis (BullMQ) |
| ML models | `model-cache` volume (`/cache`), auto-downloaded from HuggingFace/GitHub |
| EXIF | `exif` table (via exiftool), incl. GPS → reverse-geocoded place names |

### 2.1.5 Weaknesses → improvement opportunities (your opening #1)

1. **Single-scale RetinaFace on the preview image** → misses small faces in group shots. No tiling, no multi-scale, preview resolution caps detection quality.
2. **No face quality assessment** → blurry/profile faces enter the index, pollute person assignment, and degrade the people page.
3. **Nearest-neighbor majority-vote person assignment with one global threshold** → transitive contamination (one bad merge snowballs), cold-start person fragmentation, no re-clustering.
4. **No reranking / no person-level set aggregation** at search time.
5. **No feedback loop into thresholds** — user merges/renames change state but never recalibrate anything.
6. **Two isolated indexes** (face / CLIP) with no hybrid fusion, and OCR only arrived in 2025–26 as a young feature.
7. **Postgres holds everything** — fine at 100k assets, a contention ceiling at enterprise write rates (OLTP + vector + full-text in one system).
8. **No per-tenant isolation model** — owner/sharing ACLs only; no audit trail for biometric operations; erasure = delete rows, but no crypto-shredding or provenance.
9. **Model upgrades trigger full reprocessing** without embedding versioning or parity checking (they do force re-runs on model change, but blind — no recall-parity gate).
10. Duplicate handling is essentially checksum + a basic perceptual-hash utility — no burst grouping or best-shot curation.

---

## 2.2 PhotoPrism — great librarian, weak ML core

### 2.2.1 Repository & runtime map

```
photoprism/photoprism
├── internal/
│   ├── photoprism/     indexing orchestration: index.go, mediafile.go, faces.go,
│   │                   classify.go, moments.go, import/convert/cleanup workers
│   ├── face/           embedding net (TF), marker points, distance math
│   │                   net.go (FaceNet via TensorFlow C bindings), embeddings.go,
│   │                   points.go
│   ├── classify/       NasNet label classifier (tensorflow C bindings)
│   ├── entity/         GORM models: Photo, File, Marker, Face, Subject, Label, …
│   ├── query/          SQL builders
│   ├── api/            REST handlers (gin)
│   ├── workers/        background jobs (in-process scheduler)
│   └── ffmpeg/, thumb/  transcode + thumbnail generation (libvips/imaging)
├── frontend/           Vue SPA
└── docker/             app + mariadb (+ optional photoprism-vision sidecar)
```

Single Go binary; MariaDB (recommended) or SQLite; filesystem `originals/` + `storage/` (cache, sidecar YAML, config). Optional **`photoprism/vision`** sidecar (added 2024–25) exposes captions/labels via pluggable backends (NasNet by default; Ollama-hosted VLMs for captions).

### 2.2.2 Face pipeline, exactly as the code does it

1. **Index** (`internal/photoprism/index.go`): walks `originals/`, computes hashes, extracts EXIF (incl. GPS → reverse-geocode), generates thumbnails, runs classify (labels) and face detection per file.
2. **Detection**: **Pigo** (`github.com/esimov/pigo`) — a pure-Go **pixel-intensity-comparison cascade** (Viola-Jones-family, *not* a CNN). Fast and dependency-free, but a 2018-era algorithm: weak on small faces, profile poses, occlusion, unusual lighting. Eye positions refined with Pigo's `puploc` landmark localizer.
3. **Embedding** (`internal/face/net.go`): face crop → TensorFlow C API (libtensorflow 1.15-era fork, CPU) → **FaceNet 128-D** embedding (Inception-ResNet-style, 2015 Google model).
4. **Storage**: one **`markers`** row per detected face (embedding stored as **JSON text in MariaDB**), plus crop thumbnail files.
5. **Clustering/matching** (`internal/photoprism/faces.go`): embeddings are compared **brute-force in Go** (no ANN index — the whole marker set is scanned with a distance threshold). Markers closer than a fixed euclidean threshold to an existing cluster merge into a **`faces`** row (a face cluster); **`subjects`** (people) attach to face clusters. Naming a subject retroactively re-matches markers. The community's most persistent complaint is recognition quality: missed detections (Pigo) and both over- and under-merging (fixed threshold, weak 128-D model).
6. **Curation**: manual confirm/reject per face, hidden faces, moments/albums.

### 2.2.3 Where PhotoPrism stores data

| Data | Location |
|---|---|
| Originals | `originals/` filesystem |
| Metadata, markers, faces, subjects, labels | MariaDB/SQLite (`photos`, `files`, `markers`, `faces`, `subjects`, `labels`, `photos_labels`) |
| Face embeddings | **JSON column on `markers`** — scanned brute-force, O(N) per match |
| Thumbnails/crops | `storage/cache/thumbnails` |
| Sidecar metadata | YAML files in `storage/sidecar` |
| ML models | bundled TensorFlow graphs (FaceNet, NasNet, NSFW) |
| Captions/labels (Vision) | returned by sidecar, stored on photos/labels |

### 2.2.4 Weaknesses → improvement opportunities

1. **Pigo cascade detection** — the single biggest quality problem; replace with any CNN detector.
2. **FaceNet-128 on CPU** — decade-old embedding.
3. **Brute-force O(N) matching with embeddings as JSON in MariaDB** — does not scale past ~10⁵ faces.
4. **Fixed global merge threshold** — no quality gating, no calibration, transitive contamination.
5. **No ANN, no vector DB, no CLIP-native search** (Vision captions bolted on), no OCR in core.
6. Strengths worth stealing: excellent EXIF/folder/sidecar librarian workflows, reverse geocoding, moments/album generation, mature indexing state machine.

---

## 2.3 DeepFace — a benchmarking wrapper, not a platform

### 2.3.1 Repository map

```
serengil/deepface
├── deepface/
│   ├── DeepFace.py            facade: verify, find, analyze, represent,
│   │                          extract_faces, stream (webcam), build_model
│   ├── modules/
│   │   ├── detection.py       DetectorWrapper + 13 detector backends
│   │   ├── preprocessing.py   resize/normalize per model
│   │   ├── representation.py  represent() orchestration
│   │   ├── verification.py    verify(): distance + threshold lookup
│   │   ├── recognition.py     find(): scan db_path, match against stored reps
│   │   ├── demography.py      Age/Gender/Race/Emotion models
│   │   ├── modeling.py        model registry + weight auto-download
│   │   └── streaming.py       real-time webcam loop
│   ├── commons/
│   │   ├── package_utils.py, folder_utils.py (~/.deepface/weights)
│   │   ├── distance.py        cosine / euclidean / euclidean_l2 + tuned thresholds
│   │   └── image_utils.py     load_image (path/URL/base64/np)
│   └── api/                   optional REST API + Docker image (serengil/deepface)
```

### 2.3.2 What each module actually does

**Detection (`detection.py`)** — a uniform wrapper over 13 backends, each returning `(x, y, w, h, landmarks)`:

| Backend | Algorithm |
|---|---|
| opencv | Haar cascade |
| ssd | Single Shot Detector (Caffe, OpenCV DNN) |
| dlib | HOG + linear SVM |
| mtcnn / fastmtcnn | Multi-task cascaded CNN (P/R/O-Net) |
| retinaface | RetinaFace re-implemented in TF/Keras (`deepface/models/retinaface`) |
| mediapipe | BlazeFace |
| yolov8 / yolov11 / yolov12 | YOLO-face ONNX weights |
| yunet | YuNet (OpenCV Zoo) |
| centerface | CenterFace anchor-free |

**Alignment** — per-backend landmarks drive an affine warp: eye-center alignment for Haar/dlib-style outputs (`align_img_wrt_eyes`), 5-point similarity alignment for RetinaFace outputs. No single canonical template enforced across models (each recognizer just gets a "reasonably aligned" crop).

**Recognition (`representation.py`, `modeling.py`)** — 11 embedding models with auto-downloaded weights into `~/.deepface/weights`:

| Model | Dim | Paper |
|---|---|---|
| VGG-Face | 2622 | 2015 |
| FaceNet / FaceNet512 | 128 / 512 | 2015 |
| OpenFace | 128 | 2016 |
| DeepFace (FB) | 4096 | 2014 |
| DeepID | 160 | 2014 |
| ArcFace | 512 | CVPR 2019 |
| Dlib ResNet | 128 | 2017 |
| SFace | 128 | 2021 |
| GhostFaceNet | 512 | 2022 |
| buffalo_l | 512 | via InsightFace pack |

**Verification (`verification.py`)** — cosine/euclidean/euclidean_l2 distance + a **hard-coded per-(model, metric) threshold table** tuned on LFW-style sets. No calibration against your domain, no confidence intervals.

**Recognition / `find()` (`recognition.py`)** — walks `db_path`, extracts + embeds every face in every image, caches results in `representations_<model>_<detector>.pkl` (a pickled pandas DataFrame), then matches the query by brute-force distance sort. Recent releases added optional FAISS indexing and vector-store connectors, but the default path is still **re-embed-everything + pickle + brute force**.

**`analyze()` (`demography.py`)** — Age, Gender, Race, Emotion CNNs (separate TF models). **`stream()`** — webcam loop chaining detection → optional recognition per frame.

### 2.3.3 Where DeepFace stores data

- Nowhere durable, by design: pickle caches beside the image folder, weights in `~/.deepface/weights`. No database, no index lifecycle, no identity concept, no incremental ingestion, no multi-tenancy, no audit.

### 2.3.4 Weaknesses → improvement opportunities

1. Re-embedding entire collections on every run (cache invalidation by file listing only) — no incremental indexing.
2. Pickle-based cache (security and fragility), brute-force matching.
3. Static LFW-tuned thresholds — wrong for enterprise domain data.
4. Heavy TF/Keras re-implementations (incl. its own ArcFace) rather than the reference ONNX checkpoints — subtle numeric divergence from published benchmarks.
5. **Correct role in your architecture:** a *verification-model sandbox* for A/B-testing reranker candidates — never production infrastructure.

---

## 2.4 InsightFace — the model layer everything else builds on

### 2.4.1 Repository map

```
deepinsight/insightface
├── python-package/insightface/
│   ├── app/face_analysis.py     FaceAnalysis — the orchestrator everyone uses
│   ├── model_zoo/
│   │   ├── scrfd/               SCRFD detector (ONNX)
│   │   ├── retinaface.py        RetinaFace detector
│   │   ├── arcface_onnx.py      ArcFaceONNX recognizer (112×112 → 512-D)
│   │   ├── attribute.py         gender/age
│   │   └── landmark/            2D-106 & 3D-68 landmark models
│   ├── utils/face_align.py      norm_crop / norm_crop2 (5-point → 112×112)
│   └── data/                    model auto-download (~/.insightface/models)
├── recognition/                 TRAINING code: arcface_torch (PyTorch, IResNet,
│                                PartialFC, SubCenter ArcFace, VPL), MXNet variants
├── detection/                   SCRFD + RetinaFace training
├── alignment/                   SDUNets (BMVC'18), SimpleRegression
├── parsing/                     BiSeNet face parsing
└── (InspireFace: separate commercial C/C++ SDK, 2024)
```

### 2.4.2 The pipeline everyone actually runs (`FaceAnalysis.get()`)

1. **Prepare**: `FaceAnalysis(name='buffalo_l')` downloads the model pack from GitHub releases into `~/.insightface/models/buffalo_l/` and builds ONNXRuntime sessions (`ctx_id` selects CPU/CUDA; `det_size` sets detector input, default 640).
2. **Detect**: RetinaFace (`det_10g.onnx` in buffalo_l; **SCRFD** in `antelopev2`/`buffalo_sc`) — single-stage anchor-based detector over a **single resized input scale**, FPN with 3 strides, per-anchor 5-point landmark regression, NMS.
3. **Align**: `norm_crop(img, kps)` — Umeyama similarity estimate from the 5 landmarks to the canonical ArcFace 112×112 template, warpAffine.
4. **Embed**: `arcface_onnx.ArcFaceONNX` — 112×112 BGR, normalized, NCHW → 512-D → L2-normalize.
5. **Optional**: gender/age, 106-point landmarks, mask/anti-spoofing packs.

### 2.4.3 Model packs (what you can download)

| Pack | Detector | Recognizer | Notes |
|---|---|---|---|
| **buffalo_l** | RetinaFace MobileNet-0.25 (`det_10g`) | ArcFace R50 `w600k_r50` (WebFace600K) | The pack Immich uses; your current baseline |
| buffalo_m | RetinaFace `det_500m` | ArcFace MobileFaceNet `w600k_mbf` | lighter |
| buffalo_s / buffalo_sc | SCRFD 500M / 2.5G | `w600k_mbf` | edge-oriented |
| **antelopev2** | SCRFD 10G (`scrfd_10g_bnkps`) | **GlintR100** (IResNet-100, Glint360K) | strongest OSS pack; better detector + better recognizer |
| + `1k3d68`, `2d106det`, `genderage` | landmarks/attributes in every pack | | |

Training side: `arcface_torch` is the reference PyTorch implementation (IResNet-50/100, margin losses incl. SubCenter ArcFace for noisy web data, **PartialFC** for million-identity softmax on limited GPUs) — this is how you'd fine-tune or retrain if you ever need your own licensed embedding weights.

### 2.4.4 Where InsightFace stores data

Nothing. Models on disk, everything else in memory. No storage, no clustering, no serving framework (third-party `InsightFace-REST` exists), no identity lifecycle. **It ends exactly where your platform begins.**

### 2.4.5 Licensing (verified July 2026 — load-bearing for your product)

- Code: MIT.
- **Pre-trained model packs: non-commercial research only** (trained on MS1M/WebFace/Glint360K-family data). Since Nov 2025 InsightFace offers commercial licensing (`recognition-oss-pack@insightface.ai` for packs like buffalo_l) and the InspireFace SDK for commercial deployment. InsightFace 1.0 (May 2026) added an Evaluation Studio GUI and removed the Cython build requirement.
- **Action for you:** either license the packs commercially, or train your own ArcFace weights via `arcface_torch` on appropriately licensed data. Do not ship buffalo_l in a paid enterprise product unlicensed. See §5.13.

### 2.4.6 Weaknesses → improvement opportunities

1. Fixed single `det_size` — no tiling/multi-scale orchestration (you build that).
2. No batching/serving layer — you build ONNXRuntime batching for v1; Triton only after GPU concurrency requires it (§5.14).
3. No quality estimation in the pack (det-score only) — you add CR-FIQA/SER-FIQ.
4. No identity layer at all — by design; your moat.
5. Model license — resolved commercially (above), or retrain.

---

# Part 3 — Module-by-Module Comparison

For each module: what each project does (from source), the algorithm, where the data lives, and the improvement opportunity. "—" means the capability does not exist in that project.

## 3.1 Ingestion & file handling

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| What it does | Upload API + mobile backup + external-library scan; jobs enqueued per asset | Filesystem watcher/indexer over `originals/`; import/copy mode; sidecar YAML | `load_image()` from path/URL/base64 | `cv2.imread` |
| Algorithm | SHA-1 checksum, MIME sniffing, EXIF date normalization | hashing + EXIF + sidecar merge | — | — |
| Storage | `UPLOAD_LOCATION` + Postgres `asset`/`exif` | `originals/` + MariaDB `photos`/`files` | — | — |
| **Improve for you** | Immich's job-per-asset model is right; **you need connectors** (Drive delta API, SharePoint delta, S3 events) + idempotency keys + tombstone events — none of the four has source connectors. At ≤15K/group, **Celery + Redis** is enough; Kafka/Temporal only after §5.14 triggers |

## 3.2 Duplicate detection

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| What it does | SHA-1 exact dedup; basic perceptual-hash duplicate finder utility | Hash-based dedup at index time | — | — |
| Algorithm | checksum + pHash-style comparison | checksum | — | — |
| Storage | checksum column on `asset` | hash on `files` | — | — |
| **Improve for you** | Add **SSCD** (Meta, 2021) / DINOv2 near-dup + **burst grouping + best-shot**; cross-repository identity ("same asset in Drive + SharePoint") — a real enterprise need nobody here solves |

## 3.3 Face detection

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Component | ML service `/facial-recognition` | `internal/photoprism` + `internal/face` | `modules/detection.py` | `model_zoo` |
| Algorithm | **RetinaFace** det_10g, single 640px pass on preview image | **Pigo** pixel-comparison cascade (not CNN) + puploc eyes | 13 backends; best = RetinaFace/YuNet/YOLO-face | **RetinaFace / SCRFD**, single-scale |
| Output | bbox + 5 landmarks + det score | bbox + eye points | bbox + landmarks | bbox + 5 landmarks + score |
| Storage | `asset_faces` (Postgres) | `markers` (MariaDB) | in-memory | in-memory |
| **Improve for you** | All four are **single-scale**. Add **SAHI tiling** (overlap slices + merged NMS) for small faces in high-res group photos, per-source `min_face_size`, det-score floors — biggest detection-recall lever |

## 3.4 Alignment

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Algorithm | `norm_crop` 5-point similarity → 112×112 (InsightFace util) | eye-based crop, model-specific | eye-based affine or 5-point, per backend | `face_align.norm_crop` (Umeyama → canonical 112×112) |
| Storage | landmarks on `asset_faces` | eye points on `markers` | — | — |
| **Improve for you** | Reuse untouched (changing the template invalidates pretrained weights). **Store the alignment transform per face** — needed for explainability overlays and SR pipelines |

## 3.5 Embedding generation

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Model | ArcFace R50 `w600k_r50` (buffalo_l) | **FaceNet 128-D**, TF 1.x, CPU | 11 models; ArcFace = TF re-implementation | ArcFace R50/R100, GlintR100 (antelopev2) |
| Dim / metric | 512 / cosine (VectorChord distance) | 128 / euclidean | 128–4096 / cosine+euclidean | 512 / cosine |
| Runtime | ONNXRuntime (CPU/CUDA/OpenVINO) | libtensorflow C, CPU | TF/Keras (heavy) | ONNXRuntime |
| Storage | `face_search.embedding vector(512)` | JSON on `markers` | `.pkl` cache | — |
| **Improve for you** | Keep ArcFace (decided). Add: ONNXRuntime (+ optional TensorRT later), flip-TTA for low-quality queries only, **embedding versioning** `(model_id, version)` on every vector, dual-collection migration with recall-parity gate. Optional **AdaFace** as a secondary verifier embedding for low-quality faces — never a replacement. At ≤150K faces/group, fp32 + HNSW is enough; defer SQ8/PQ |

## 3.6 Face quality assessment

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| What exists | det-score only | det-score only | — | det-score only |
| **Improve for you** | **Nobody has this — build it.** CR-FIQA (CVPR 2023, single forward pass) or SER-FIQ (CVPR 2020, stochastic robustness on your ArcFace). Wire into: index gating, aggregation weights, representative-crop selection, explainability |

## 3.7 Clustering & identity resolution

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Algorithm | **None** (single-pass NN majority-vote assignment to persons, global threshold) | Fixed-threshold euclidean merge of markers into `faces`; subjects attached | — | — |
| Storage | `person`, `asset_faces.personId` | `faces`, `subjects`, `markers.face_id` | — | — |
| Merge/split | manual UI merge, rename | manual confirm/reject | — | — |
| **Improve for you** | **The biggest gap in all four.** Build: online assignment to quality-weighted person centroids + unknown-singleton buffer; periodic **group-scoped** re-clustering (**HDBSCAN** is the production algorithm at ≤150K faces/group; **STAR-FC** only if a single group or aggregate graph later exceeds million-scale — see §5.14); merge/split/label as replayable provenance events |

## 3.8 Person entity layer

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Exists? | Yes — `person` table, thumbnails, merge/hide/rename | Yes — `subjects` + `faces` | No | No |
| **Improve for you** | First-class `persons` with lifecycle (create/merge/split/label/delete-everywhere), representative-face selection by quality, per-person consent flags, per-person erasure (crypto-shredding) |

## 3.9 Vector indexing & storage

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Store | PostgreSQL + **VectorChord** (`vchordrq` index; migrated off pgvecto.rs v1.133) | MariaDB JSON column | `.pkl` (+ optional FAISS recently) | — |
| Scale ceiling | ~10⁷ faces comfortably | ~10⁵ (brute force) | ~10⁵ | — |
| Tenancy/filters | none (owner filter post-hoc) | none | none | — |
| **Improve for you** | **Qdrant** for v1 (single node). Shared collections with mandatory **`tenant_id` + `group_id` payload filters** (payload indexes) — not a collection per folder, not shard keys yet. Keep **fp32**; skip SQ8/PQ until aggregate vectors force memory pressure. Milvus / multi-node Qdrant only after §5.14. Embedding versioning + delete-by-payload for erasure remain required |

## 3.10 ANN search

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Algorithm | VectorChord HNSW-style graph | none (O(N) scan) | none (O(N)) | — |
| Query-time knobs | threshold only | none | none | — |
| **Improve for you** | HNSW `efSearch` as per-query knob (investigation vs interactive), oversample 4–10× then exact rescoring within the group filter. GPU ANN (cuVS/CAGRA) is unnecessary at ≤150K faces/group |

## 3.11 Reranking

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Exists? | No | No | No | No |
| **Improve for you** | **Your #1 retrieval-quality lever — nobody has it.** Candidate top-N → group by person → quality-weighted **set aggregation** (IJB-C template protocol) → pairwise verifier (MLP on [cos, Δ, quality]) → priors (co-occurrence, time, ACL) → later LightGBM LTR trained on your feedback data |

## 3.12 Metadata & full-text indexing

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| What | exiftool → `exif` table; filename/date/GPS filters | rich EXIF + folders + sidecar YAML; reverse geocoding | — | — |
| Full-text | Postgres trigram | MariaDB | — | — |
| **Improve for you** | Postgres = OLTP truth **and** v1 full-text (tsvector/trigram on OCR, filenames, captions, EXIF). Redis = cache. Vector DB = embeddings. **OpenSearch only after** text-search volume / facet complexity hits §5.14. Mirror **source ACLs** and enforce at query time with `group_id` |

## 3.13 Semantic search & OCR

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| CLIP | Yes (OpenCLIP, isolated index) | Via Vision sidecar (captions/labels, Ollama) | No | No |
| OCR | Added 2025–26 (young) | Via Vision sidecar | No | No |
| Fusion | **None** — face and CLIP are separate features | None | — | — |
| **Improve for you** | Unified hybrid retrieval: face-vector + CLIP/SigLIP + OCR (PaddleOCR/Surya) + BM25 metadata, fused with **Reciprocal Rank Fusion**; OCR name tokens cross-linked to person entities (badge/name-tent disambiguation) |

## 3.14 Job processing & incremental indexing

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Queue | BullMQ on Redis, per-job-type queues, admin UI | in-process Go workers | — | — |
| Incremental | per-asset jobs; library rescan | rescan indexer | re-embeds everything | — |
| Re-embedding | full reprocess on model change (no versioning/parity gate) | full reprocess | n/a | — |
| **Improve for you** | **Celery + Redis** with idempotency keys `(source_id, object_id, etag, group_id)` and durable task state is correct at 15K/group. Kafka topics + Temporal workflows are upgrade-path items (§5.14), not v1 requirements. Tombstones must still propagate to vectors, clusters, caches, audit |

## 3.15 API & auth

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| API | REST + OpenAPI + websockets | REST (gin) | optional Flask/FastAPI wrapper | none |
| Auth | OIDC/OAuth, API keys, multi-user sharing | session auth, limited multi-user | API key on wrapper | — |
| **Improve for you** | FastAPI gateway + OIDC SSO + **RBAC on persons and search groups**; immutable audit log; per-tenant encryption keys. Full OPA/ABAC + crypto-shredding plane is Phase 3, not day-one infra |

## 3.16 Deployment & licensing

| | Immich | PhotoPrism | DeepFace | InsightFace |
|---|---|---|---|---|
| Deploy | docker-compose (server, ML, redis, postgres) | docker-compose (app, mariadb, vision) | pip / docker | pip |
| License | AGPLv3 | AGPLv3 + paid tiers | MIT | **Code MIT / models non-commercial** (commercial license available since Nov 2025) |
| **Improve for you** | **Docker Compose / single VM** for v1 (≤15K/group). K8s + GPU pools + KEDA only after concurrency/HA triggers in §5.14. Resolve InsightFace model licensing (or self-train with arcface_torch) **before** any commercial pilot |

---

# Part 4 — Where the Opportunities Are (ranked synthesis)

Everything below is absent from **all four** projects. Ranked by (user-value × defensibility) ÷ effort:

| # | Opportunity | Why it wins | Evidence from source |
|---|---|---|---|
| 1 | **Person entity layer + real clustering** (online assignment + offline re-clustering + merge/split events) | Immich's NN-assignment and PhotoPrism's fixed-threshold merge are the #1 quality complaint in both communities | §3.7, §3.8 |
| 2 | **Face quality assessment wired everywhere** (gating, aggregation, curation, explainability) | Cheap to add (CR-FIQA = one forward pass), compounds everywhere | §3.6 |
| 3 | **Two-stage retrieval with set aggregation + verifier rerank** | Turns "top-k face similarity" into "find this person" — your actual use case | §3.11 |
| 4 | **Tiled detection (SAHI) for small faces in group photos** | Directly attacks your stated use case; 20–50% more faces recovered in event photos | §3.3 |
| 5 | **Feedback loop → threshold calibration → trained reranker** | The compounding moat; zero OSS photo apps do this | §3.7/§3.11 |
| 6 | **Hybrid retrieval (face + CLIP + OCR + metadata, RRF-fused)** | Immich proves CLIP demand; its two isolated indexes prove the fusion gap | §3.13 |
| 7 | **Dedup + burst grouping + cross-repository asset identity** | Enterprise repos are 15–40% duplicates; nobody solves "same photo, 4 repositories" | §3.2 |
| 8 | **Group-scoped enterprise governance** (15K quota, ACL, audit, erasure) | Isolation + compliance without Google Photos / Rekognition lock-in; no OSS has group-quota + biometric erasure together | §3.9/§3.15 |
| 9 | **Embedding versioning + shadow-index migration** | Model upgrades stop being blind reprocessing gambles | §3.5/§3.14 |
| 10 | **Explainability payloads** (aligned pair, score decomposition, provenance) | Converts "AI said so" into auditable evidence — required for enterprise trust | §3.4 |

---

# Part 5 — Build Plan: Enterprise Face Search Platform
## Sized for ≤15,000 images per searchable group (lean v1 + upgrade path)

Your decided stack is kept as-is for the **model layer** (InsightFace RetinaFace/SCRFD + ArcFace 512-D) and the **application layer** (PostgreSQL + FastAPI + React + Celery). Production vector search is **single-node Qdrant** (FAISS remains a prototype/local tool). The plan still adds the quality layers Immich/PhotoPrism lack — but **defers** Kafka, Temporal, Kubernetes/KEDA, OpenSearch, Milvus, Triton, Neo4j, quantization, and distributed sharding until the measurable triggers in §5.14.

**Capability tiers (so the plan is not misread as Fortune-500 day-one infra):**

| Tier | What | When |
|---|---|---|
| **Required at 15K/group** | Search groups + 15K quota, tiled detection, quality gating, ArcFace indexing, HDBSCAN + online assignment, two-stage retrieval, dedup, Celery ingest, group-scoped ACL, eval harness | Phases 0–2 |
| **Optional differentiators** | CLIP/OCR hybrid RRF, explainability UI, feedback→calibration→verifier, burst/best-shot curation | Phase 2–3 |
| **Future distributed-scale** | Kafka/Temporal, OpenSearch, Qdrant cluster/Milvus, Triton/K8s, STAR-FC, SQ8/PQ, predicate-aware ANN, graph DB | Only after §5.14 |

## 5.1 Product definition

> A user creates or selects a **search group** (folder/section), uploads images into it (hard cap **15,000 active images**), then uploads one photo of a person. The platform returns every image **inside that group** where the person appears — individual photos, group photos, small faces, different dates — with auditable evidence per result.

**Isolation rules (non-negotiable):**
- Search, clustering, person pages, dedup, and caches are always scoped to `(tenant_id, group_id)`.
- A user cannot search across groups unless an explicit product feature later adds multi-group queries (out of scope for v1).
- 15K is enforced **transactionally** at ingest reservation time; soft UI warnings are not enough.

Non-goals for v1: video, face swap, attribute inference beyond quality, public multi-tenant SaaS at planet scale, cross-group global people graph, Kafka/Temporal.

## 5.2 Target architecture (lean v1)

```
 SOURCES / UPLOADS              INGESTION (Celery)           ML PIPELINE (per asset)
┌──────────────┐  enqueue      ┌─────────────┐   ┌──────────────────────────────────┐
│ GDrive folder│──────────────▶│ Redis queue │──▶│ reserve quota(group)              │
│ Local upload │  + recon scan │ Celery tasks│   │ fetch→hash→EXIF→thumb             │
│ (SharePoint/ │               │ idempotent  │   │ tiled SCRFD/RetinaFace (SAHI)     │
│  S3 later)   │               └──────┬──────┘   │ align→CR-FIQA→ArcFace 512        │
└──────────────┘                      │          │ exact+pHash(+SSCD) dedup          │
                                      │          │ optional OCR/CLIP (Phase 3)       │
                                      ▼          └──────────────┬────────────────────┘
 STORAGE PLANE (single node / Compose)                          │
┌───────────────────────────────────────────────────────────────┴───────────────────┐
│ Postgres — tenants, search_groups, assets, faces, persons, events, ACL, audit,    │
│            OCR/filename/caption tsvector (v1 full-text; no OpenSearch yet)        │
│ Qdrant (1 node) — faces_v1 + clip_v1 (fp32, payload filter tenant+group)          │
│ Object store (MinIO/S3) — originals/crops/thumbs                                  │
│ Redis — Celery broker + query/person caches                                       │
└────────────────────────────────┬──────────────────────────────────────────────────┘
                                 ▼
 IDENTITY (group-scoped)         RETRIEVAL (group-scoped)
┌─────────────────────────┐     ┌─────────────────────────────────────────┐
│ Person service: online  │────▶│ ANN oversample (filter group_id) →      │
│ assignment to quality-  │     │ person set aggregation → verifier →     │
│ weighted centroids      │     │ optional RRF(CLIP/OCR) → ACL → evidence │
│ Offline HDBSCAN / group │     └─────────────────────────────────────────┘
│ Merge/split/label events│                        │
│ Feedback→calibration    │                        ▼
└─────────────────────────┘     FastAPI·OIDC·RBAC·audit     React: search · People
                                eval harness (DET/ROC)      cluster review · evidence
```

## 5.3 Monorepo layout

```
face-platform/
├── services/
│   ├── api/                 FastAPI gateway — auth, REST, group quota, query routing
│   ├── ml-inference/        FastAPI + ONNXRuntime — detect/align/quality/embed/(clip/ocr)
│   ├── identity/            person service: assignment, HDBSCAN jobs, calibration
│   ├── retrieval/           two-stage search, optional RRF, evidence builder
│   ├── workers/             Celery tasks — ingest, recluster, erase, re-embed
│   └── connectors/          gdrive/ (+ sharepoint/, s3/ later) — delta sync + ACL mirror
├── packages/
│   ├── vision/              SAHI tiler, alignment, quality, InsightFace wrappers
│   ├── schemas/             pydantic event + entity schemas
│   └── eval/                labeled sets, DET/ROC, regression gates
├── web/                     React + TS — groups, upload, search, people, cluster-review
├── infra/
│   └── docker-compose.yml   api, workers, ml-inference, postgres, qdrant, redis, minio, web
└── ops/                     runbooks, model-upgrade playbook, erasure playbook, upgrade triggers
```

No `k8s/`, Kafka, Temporal, or OpenSearch in the v1 tree — add them only when §5.14 fires.

## 5.4 Core schema (PostgreSQL, OLTP truth) — group-first

```sql
CREATE TABLE tenants (
  id uuid PRIMARY KEY, name text, kms_key_id text, retention_days int);

CREATE TABLE users (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id),
  email text, oidc_sub text UNIQUE);

-- First-class searchable folder/section
CREATE TABLE search_groups (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  owner_user_id uuid REFERENCES users(id),
  max_active_images int NOT NULL DEFAULT 15000,   -- hard product cap
  active_image_count int NOT NULL DEFAULT 0,     -- maintained transactionally
  status text NOT NULL DEFAULT 'active',         -- active|archived|deleted
  created_at timestamptz DEFAULT now(),
  CHECK (active_image_count >= 0),
  CHECK (active_image_count <= max_active_images)
);

CREATE TABLE search_group_members (
  group_id uuid REFERENCES search_groups(id),
  user_id uuid REFERENCES users(id),
  role text NOT NULL,                            -- owner|editor|viewer
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE sources (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id),
  group_id uuid REFERENCES search_groups(id),    -- connector bound to a group
  kind text,                                     -- gdrive|upload|sharepoint|s3
  config jsonb, cursor text);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  group_id uuid REFERENCES search_groups(id) NOT NULL,
  source_id uuid REFERENCES sources(id),
  source_object_id text,
  etag text,
  sha256 bytea, phash bigint, sscd_id uuid,      -- dedup keys (scoped by group)
  taken_at timestamptz, imported_at timestamptz,
  width int, height int, acl jsonb,
  status text NOT NULL,                          -- reserved|ready|failed|deleted
  deleted_at timestamptz,
  UNIQUE (group_id, source_id, source_object_id, etag)
);
CREATE INDEX assets_group_active_idx ON assets (group_id)
  WHERE deleted_at IS NULL AND status IN ('reserved','ready');

CREATE TABLE faces (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  group_id uuid REFERENCES search_groups(id) NOT NULL,
  asset_id uuid REFERENCES assets(id),
  bbox int4range[], landmarks jsonb, align_matrix float4[6],
  det_score float4, quality float4,
  person_id uuid,                                -- NULL = unknown
  model_id text, model_version text,
  embedding_id uuid);

CREATE TABLE persons (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  group_id uuid REFERENCES search_groups(id) NOT NULL,  -- people are per-group
  name text NULL,
  centroid_model text, rep_face_id uuid,
  consent_state text DEFAULT 'unknown',
  face_count int, is_hidden bool, created_by text);

CREATE TABLE person_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid, group_id uuid NOT NULL, person_id uuid,
  kind text,                    -- assign|merge|split|rename|confirm|reject|erase
  payload jsonb, actor text, created_at timestamptz DEFAULT now());

CREATE TABLE feedback_pairs (
  id bigserial PRIMARY KEY,
  tenant_id uuid, group_id uuid NOT NULL,
  query_face uuid, cand_face uuid,
  label bool, source text, created_at timestamptz DEFAULT now());

-- Quota reservation: call inside a transaction BEFORE enqueueing ML work
-- UPDATE search_groups SET active_image_count = active_image_count + 1
--   WHERE id = $group AND active_image_count < max_active_images
--   RETURNING *;  -- 0 rows => HTTP 409 QUOTA_EXCEEDED
-- On hard delete / tombstone: decrement only if status was reserved|ready.
```

**Vector DB (Qdrant, single node):** one shared collection `faces_v1`, 512-D cosine, **fp32** (no SQ8/PQ at this scale). Payload must include `{tenant_id, group_id, face_id, person_id, asset_id, quality, taken_at, model_version}` with **payload indexes on `tenant_id` and `group_id`**. Every search/upsert/delete passes both filters. Optional `clip_v1` for SigLIP in Phase 3. **Do not** create a Qdrant collection per folder — that explodes ops at many groups. Deletes by payload filter drive erasure.

**Sizing math (per full group):** 15K images × ~2 faces ≈ 30K vectors × 512 × 4 B ≈ **60 MB** fp32 face vectors (worst ~150K faces ≈ **300 MB**). Trivial for one Qdrant process; HNSW memory overhead still fits a small VM.

## 5.5 Per-asset pipeline (Celery task, idempotent, quota-aware)

Key: `idempotency_key = hash(group_id, source_id, object_id, etag)`. Retries never double-index. Quota is reserved in Postgres **before** the worker fetches bytes.

```python
@celery_app.task(bind=True, max_retries=5, acks_late=True)
def process_asset(self, evt: dict) -> None:
    # evt includes tenant_id, group_id, source_id, object_id, etag
    with db.transaction():
        if not reserve_group_quota(evt["group_id"]):          # CHECK + atomic increment
            raise QuotaExceeded(evt["group_id"])
        asset = upsert_asset_reserved(evt)                    # status=reserved

    try:
        if already_done(evt["idempotency_key"]):
            return
        blob = fetch(evt)                                     # connector / upload store
        dedup = hash_and_dedup(blob, group_id=evt["group_id"])  # exact + pHash (+ SSCD)
        if dedup.is_duplicate:
            link_to_existing(asset, dedup); release_if_needed(asset); return
        meta  = extract_exif(blob)
        thumb = make_thumbnails(blob)
        faces = detect_faces(blob)                            # SAHI-tiled
        kept = []
        for f in faces:
            f.group_id = evt["group_id"]
            f.quality = score_quality(f)                      # CR-FIQA
            if f.quality < QUALITY_FLOOR:
                continue
            f.embedding = embed(f)                            # ArcFace / ONNXRuntime
            kept.append(f)
        index_vectors(kept)                                   # Qdrant upsert w/ group_id
        assign_persons(kept)                                  # identity layer (group filter)
        # ocr_and_clip(blob)                                  # Phase 3
        persist(meta, thumb, kept)                            # Postgres
        mark_ready(asset)
    except Exception as e:
        mark_failed(asset); release_quota_on_failure(asset)
        raise self.retry(exc=e)
```

Detection activity (the tiling wrapper nobody else has — **required** even at 15K because group photos still miss small faces):

```python
def detect_faces(img: np.ndarray, cfg) -> list[Face]:
    dets = []
    for scale in sahi.scales(img, cfg.min_face_px):          # native-res overlap tiles
        for box, kps, score in scrfd.detect(img, det_size=scale.tile):
            if score >= cfg.det_floor and box.min_side >= cfg.min_face_px:
                dets.append((scale.offset(box), scale.offset_kps(kps), score))
    dets = nms_merge(dets, iou=0.4)                          # cross-tile merge
    return [Face(box=b, kps=k, det=s,
                 crop=norm_crop(img, k), align=M) for b, k, s, M in dets]
```

## 5.6 Identity layer (the moat) — always group-scoped

**Online assignment** (per new face, after indexing):

```python
def assign(face) -> PersonId | None:
    cands = qdrant.search(
        "faces_v1", face.embedding, limit=32,
        filter={"must": [
            {"key": "tenant_id", "match": {"value": face.tenant}},
            {"key": "group_id",  "match": {"value": face.group}},
        ]},
    )
    by_person = group_topk_by_person(cands, m=5)
    scores = {p: quality_weighted_mean(face, fs) for p, fs in by_person.items()}
    best, margin = top1_margin(scores)
    tau = tau_assign(face.tenant, face.group)                 # per-group calibration
    if best and scores[best] >= tau and margin >= MARGIN_MIN:
        db.event("assign", face, best, scores)
        return best
    return None                                               # stays unknown
```

**Offline re-clustering** (scheduled + on-demand, **one group at a time**):
1. Pull face embeddings for `(tenant_id, group_id)` only — never the whole platform.
2. **HDBSCAN** (min_cluster_size=2, quality-filtered core points) is the production algorithm. At ≤150K faces/group, STAR-FC is unnecessary.
3. Reconcile: split contaminated clusters, merge singletons into persons, emit `person_events`; never silently rewrite — everything is an event.

**Feedback → calibration** (nightly per active group):
- `feedback_pairs` + merge/split events → labeled genuine/impostor pairs per `(tenant, group)`.
- Fit isotonic regression → `tau_assign`, `tau_search`; publish DET curves.
- Accumulated pairs train the verifier / later LTR reranker (§3.11).

## 5.7 Retrieval (the product query) — mandatory group filter

```python
def search_person(query_img, tenant, group_id, user, k=50) -> list[Evidence]:
    assert can_access(user, group_id)                         # RBAC on search_group_members
    q = pipeline.run_query_face(query_img)                    # tiled detect + best-quality face
    cands = qdrant.search(
        "faces_v1", q.embedding, limit=10 * k,                # oversample
        filter={"must": [
            {"key": "tenant_id", "match": {"value": tenant}},
            {"key": "group_id",  "match": {"value": group_id}},
        ]},
    )
    stage1 = person_set_aggregation(q, cands)                 # quality-weighted, IJB-C style
    stage2 = verifier_rerank(q, stage1)                       # MLP(pair feats) → priors
    fused  = rrf(face_rank=stage2, clip=None, ocr=None)       # Phase 3 hybrid slot
    allowed = acl_filter(fused, user, tenant, group_id)
    return [evidence(p) for p in allowed[:k]]
```

Every result carries an **evidence payload**: query crop vs. matched crop (aligned), cosine, quality, verifier score, source, ACL basis, `group_id`.

## 5.8 API surface (FastAPI, OIDC)

```
POST   /v1/groups                      create search group (max_active_images=15000)
GET    /v1/groups                      list groups for caller
GET    /v1/groups/{id}                 includes active_image_count / quota remaining
POST   /v1/groups/{id}/assets          upload or register folder; 409 if quota exceeded
DELETE /v1/groups/{id}/assets/{aid}    tombstone + decrement quota + erase vectors

POST   /v1/groups/{id}/search/face     multipart image → ranked persons + evidence (group-only)
POST   /v1/groups/{id}/search/hybrid   {text?, image?, filters} → RRF (Phase 3)

GET    /v1/groups/{id}/persons         person pages (name, count, rep face)
POST   /v1/groups/{id}/persons/{pid}/merge|split|rename   → person_events + audit
POST   /v1/groups/{id}/feedback        {query_face, cand_face, label}
DELETE /v1/groups/{id}/persons/{pid}   erasure within group

GET    /v1/admin/eval/det?group=…      per-group DET/ROC, threshold report
POST   /v1/connectors/{kind}           bind connector to a group; delta sync begins
```

## 5.9 Infrastructure & capacity (15K-group sized)

**Dev / Prod v1:** one `docker-compose.yml` — `api`, `workers` (Celery), `ml-inference` (ONNXRuntime CPU or one NVIDIA GPU), `postgres`, `qdrant`, `redis`, `minio`, `web`. `make dev` boots the platform on a laptop or a single VM.

**Recommended VM (single full group import + interactive search):**
- 8–16 vCPU, 32 GB RAM, 200+ GB SSD, optional 1× T4/A10 (or CPU-only with slower ingest).
- Celery concurrency: 2–4 ML tasks (GPU) or 1–2 (CPU); do not unbounded-parallelize InsightFace sessions.
- Storage estimate for one full group: originals (highly variable; budget ~50–150 GB for 15K photos) + thumbs/crops (~5–15 GB) + vectors (~0.1–0.3 GB) + Postgres metadata (~1–2 GB).

**Throughput math (realistic, not planet-scale):**
- CPU ONNX: roughly 1–5 img/s depending on resolution/tiling → **full 15K group in ~1–4 hours**.
- One T4/A10 with batched ONNX/TRT: roughly 20–80 img/s → **full 15K group in ~5–15 minutes**.
- Query: HNSW over ≤150K filtered vectors + set aggregation → **p95 < 100 ms, p99 < 200 ms** with Redis person-result caching for repeat queries.

**Explicitly deferred from v1:** Kafka, Temporal, OpenSearch, Milvus, Triton Inference Server, K8s/KEDA, Neo4j, Qdrant multi-node, SQ8/PQ quantization, STAR-FC.

## 5.10 Phased roadmap (condensed for 15K groups)

> Sizing assumes 2–4 engineers (1 CV/ML, 1–2 backend, 1 frontend). Compress/extend linearly.

### Phase 0 — Foundations & licensing (weeks 1–3)
- Resolve **InsightFace model license** (commercial license or `arcface_torch` retrain) — hard blocker for commercial pilots.
- Repo + CI + Compose stack; Celery worker skeleton; `search_groups` + transactional 15K quota; Drive or local-upload ingest into Postgres + object store.
- **Exit criteria:** one group of **1–2K** images ingested idempotently; kill worker mid-pipeline → resume with zero double-indexing and correct `active_image_count`; upload of image 15,001 returns **409**.

### Phase 1 — Detection & indexing core (weeks 4–8) — *already past Immich/PhotoPrism on your use case*
- SAHI-tiled SCRFD/RetinaFace + alignment + ArcFace-512 (ONNXRuntime) + CR-FIQA quality gating.
- Qdrant `faces_v1` with **mandatory `group_id` filters** (fp32); exact + perceptual-hash dedup; EXIF into Postgres.
- Basic `POST /groups/{id}/search/face`: ANN oversample → **person set aggregation** → ACL → evidence.
- **Exit criteria:** labeled pilot group (≤15K) — small-face detection recall ≥ +25% vs. single-scale; search recall@50 ≥ 0.95; p99 < 200 ms; quota never exceeded; DET curve published for the pilot group.

### Phase 2 — Identity layer (weeks 9–14) — *the moat*
- Person service: online quality-weighted-centroid assignment + unknown buffer; merge/split/rename UI writing `person_events` (all group-scoped).
- Offline **HDBSCAN** re-clustering per group; feedback capture; isotonic per-group threshold calibration.
- Verifier v1 (MLP on pair features) as rerank stage 2.
- **Exit criteria:** cluster purity ≥ 0.98 on pilot groups; merge/split replayable from events; calibrated FNMR@FMR measurable per group; CI regression gate on model/pipeline changes.

### Phase 3 — Hybrid + governance (weeks 15–22) — *optional product differentiators*
- SigLIP + OCR indexes (still Postgres tsvector / Qdrant `clip_v1`); RRF hybrid search; OCR name-token ↔ person cross-link.
- Additional connectors (SharePoint/S3) with ACL mirrored at query time; immutable audit; erasure workflow (vector delete-by-payload + cache purge + key shredding where required).
- Burst grouping / best-shot curation; light co-occurrence edges in Postgres (no Neo4j yet).
- **Exit criteria:** hybrid query inside a group returns fused ranks; erasure completes ≤ 24h with audit proof; DPIA notes generated from schema.

### Phase 4 — Research / scale-up (only if needed)
- STAR-FC, LTR reranker, temporal/aging modeling, SR-assist with identity-consistency guard, predicate-aware ANN — **research agenda**, not v1 dependencies.
- Distributed components only when §5.14 triggers fire.

## 5.11 KPIs & evaluation harness (non-negotiable, from day 1)

Representative workload: **one search group with 15,000 images** and the face-count envelope in the Executive Summary (~30K typical / ≤150K worst face vectors).

| KPI | Target (Phase 2) |
|---|---|
| Search recall@50 (person appears in group results) | ≥ 0.95 |
| FNMR @ FMR=1e-3, per group, calibrated | published DET, improving over releases |
| Small-face (<64px) detection recall | ≥ +25% over single-scale baseline |
| Query latency p95 / p99 (full 15K group) | < 100 ms / < 200 ms |
| Full-group import (GPU) / (CPU) | ≤ 30 min / ≤ 4 h |
| Quota enforcement | 15,001st active image always rejected (409) |
| Cluster purity / measured merge-error rate | ≥ 0.98 / dashboard |
| Worker crash recovery | zero double-index; quota count consistent |
| Erasure completion (person or asset) | ≤ 24 h, audited |

The harness (`packages/eval`) holds frozen labeled sets **per group**, DET/ROC dashboards, and a **CI gate** that blocks model/pipeline changes that regress recall or calibration.

## 5.12 Required vs deferred — quick reference

| Component | v1 (15K/group) | Deferred until |
|---|---|---|
| Celery + Redis | Yes | — |
| Kafka / Temporal | No | Sustained multi-group ingest lag / exactly-once complexity (§5.14) |
| Single-node Qdrant fp32 | Yes | — |
| Qdrant cluster / Milvus / SQ8 | No | Aggregate vectors or RAM/latency triggers |
| Postgres full-text | Yes | — |
| OpenSearch | No | Heavy OCR/facet / multi-tenant text search load |
| ONNXRuntime (+ optional 1 GPU) | Yes | — |
| Triton + K8s + KEDA | No | Concurrent GPU jobs / HA SLAs |
| HDBSCAN | Yes | — |
| STAR-FC | No | Single graph ≫150K faces or research phase |
| CLIP/OCR/RRF | Phase 3 optional | Product demand |
| Neo4j knowledge graph | No | Graph traversal product need |

## 5.13 Risks & compliance checklist

| Risk | Mitigation |
|---|---|
| **InsightFace model license** (buffalo_l non-commercial; commercial licensing since Nov 2025) | License commercially **or** retrain via `arcface_torch`. Decide in Phase 0. |
| Biometric law (GDPR Art. 9, Illinois BIPA, Texas CUBI) | Consent flags on persons, audit log, erasure by `group_id`/`person_id`, retention policies. Design schema in Phase 1; harden crypto-shredding in Phase 3 if required by customer. |
| Quota races / double-count | Atomic `UPDATE … WHERE active_image_count < max` inside ingest transaction; decrement only from `reserved`/`ready`. |
| Cross-group leakage | Every Qdrant query and SQL join filters `group_id`; integration tests attempt cross-group ANN and must return empty. |
| Twins / children / occlusion / 1990s scans | Set aggregation + priors + feedback — **not** a bigger embedding. |
| Cold-start thresholds | Conservative defaults + per-group calibration once feedback exists; never one global τ. |
| AGPL contamination (Immich/PhotoPrism) | Design reference only; write your own code. DeepFace/InsightFace code (MIT) OK to reference. |
| Over-building infra | Do not deploy Kafka/K8s/OpenSearch “because enterprise” — use §5.14 gates. |

## 5.14 Upgrade path — concrete triggers

Promote a deferred component **only when a measured condition holds** for 2+ weeks (or a hard SLA breach):

| Trigger | Metric | Add |
|---|---|---|
| Aggregate face vectors > ~5M **or** Qdrant RSS > 70% of host RAM | Platform-wide vector count / memory | Qdrant cluster **or** Milvus; consider SQ8 + oversample-rescore |
| Sustained ingest > ~50 img/s across groups **or** Celery lag p95 > 15 min | Queue depth / lag | Kafka (or Redpanda) event bus; consider Temporal for long workflows |
| Concurrent interactive queries p99 > 300 ms under load | API latency | Redis result cache tuning, Qdrant replicas, then horizontal API |
| OCR + caption + filename search volume hurts Postgres **or** complex facets needed | Text QPS / slow queries | OpenSearch/Elasticsearch sidecar |
| >2 GPU workers needed, multi-model batching, or HA ML SLA | GPU utilization / queue | Triton + TensorRT; K8s + KEDA on queue depth |
| Single group or merged graph > ~500K faces with HDBSCAN quality/time failure | Recluster wall time / purity | STAR-FC (or sharded clustering research) |
| Multi-hop “who appears with whom across events” is a sold feature | Product requirement | Postgres recursive CTEs first; Neo4j only if CTE latency fails |
| Multi-region residency / regulated HA | Contractual | Per-region stacks; tenant key management; then K8s |

Until these fire, the lean Compose architecture is the correct Fortune-500 answer for a **15K-per-group** product: spend engineering on retrieval quality and isolation, not on distributed scaffolding.

## 5.15 What to steal vs. build (final answer)

**Steal (design, not code):**
- Immich: microservice split (stateless ML service behind HTTP), job-per-asset queue design, ONNX model packaging, CLIP wiring pattern.
- PhotoPrism: EXIF/sidecar librarian workflows, reverse geocoding, indexing state machine.
- DeepFace: per-(model, metric) threshold table idea — replace static LFW values with **per-group** calibrated thresholds.
- InsightFace: the entire model layer (licensed), `norm_crop`, training repos for the retrain path.

**Build (your product at 15K/group):** `search_groups` + transactional quota, connectors + idempotent Celery ingest, SAHI detection wrapper, quality layer, Qdrant indexing with mandatory `group_id` filters + embedding versioning, person entity service with online+offline clustering, two-stage retrieval with set aggregation + verifier, feedback→calibration loop, optional hybrid RRF, dedup/burst, governance (ACL, audit, erasure), evaluation harness.

**Phase 1–2 executed well already exceeds Immich and PhotoPrism on your exact use case** — because they lack quality gating, real clustering, set-level retrieval, reranking, and calibration, not because their models differ. Phase 3 adds hybrid search and harder governance. §5.14 is where you become distributed — only when the metrics say you must.

---

*Sources verified July 2026: immich-app/immich v3.0 release notes & docker-compose (VectorChord/Valkey stack), insightface README (1.0 release, model licensing terms), serengil/deepface repo, photoprism docs. Module internals (service names, table names, pipelines) reflect the respective main branches at that date; pin commit hashes when you begin Phase 0 due diligence. Plan revised July 2026 for ≤15,000 active images per search group with a lean v1 stack and explicit upgrade triggers.*
