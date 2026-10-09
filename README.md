# How the SAS → PySpark Migration System Works
## A Simple Guide for Business Stakeholders

> **Audience:** Business users, product managers, data leaders, non-technical stakeholders  
> **Reading time:** ~15 minutes  
> **One-line summary:** The system takes your SAS programs, translates them to PySpark, runs both, compares the results, fixes differences automatically when possible, and gives you a certificate proving the migration is correct — or tells you exactly what needs human attention.

---

## The Big Picture

Think of this system like a **certified translation agency** — not a Google Translate.

When you translate a legal contract from English to French, you don't just paste it into a translator and hope for the best. A certified translation agency:

1. Reads and understands the original document
2. Translates it using expert linguists
3. Has a **different person** independently verify the translation
4. If the verifier finds errors, sends it back for correction
5. Only stamps "Certified" when the independent verifier confirms accuracy

Our system does exactly this for SAS programs:

```
    ┌─────────────┐
    │  Your SAS   │
    │   Program   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Understand  │  ← "Read and understand the original"
    │  the SAS     │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Translate   │  ← "Expert linguists translate"
    │  to PySpark  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────────────────────────┐
    │  Run BOTH programs on the same data  │  ← "Independent verification"
    │                                       │
    │  SAS Program ──→ SAS Output           │
    │  PySpark Code ──→ Spark Output        │
    └──────────────────┬────────────────────┘
                       │
                       ▼
    ┌─────────────────────────────────────┐
    │  Compare the outputs row by row      │  ← "Verifier checks accuracy"
    │                                       │
    │  Are they the same?                   │
    │     YES → Certificate ✅              │
    │     NO  → Fix and try again 🔄        │
    │     UNSURE → Ask a human 🧑‍💻          │
    └───────────────────────────────────────┘
```

> [!IMPORTANT]
> **The key principle:** The AI that translates the code is **never** the one that decides if the translation is correct. An independent verifier compares actual outputs. This is why we call it a "verification harness," not a "translator."

---

## Part 1 — The Foundation: Why Do We Need It?

### What is it?

The foundation is the **record-keeping and safety infrastructure** that everything else runs on top of. Think of it like the legal framework, filing cabinets, and chain-of-custody procedures in a law office — boring but essential.

### Why do we need it?

Imagine migrating 500 SAS programs. Six months later, an auditor asks:

> *"Program #247 — how do you know the PySpark version produces the same results? What exact data did you test with? Who approved it? What rules were you using?"*

Without the foundation, you can't answer. With it, you can pull up a complete, tamper-proof record showing every step.

### What does it provide?

| What | Why | Analogy |
|---|---|---|
| **Event Log** | Records every action that happened during migration — every translation attempt, every test run, every comparison, every fix | Like a courtroom transcript — complete, sequential, tamper-proof |
| **Artifact Storage** | Every file (SAS source, translated PySpark, test data, comparison reports) is stored with a unique fingerprint | Like a notarized document vault — you can always prove "this is exactly the file we tested" |
| **Policy Rules** | The rules for "what counts as a match" are locked before testing starts and can't be changed mid-run | Like the rules of a clinical trial — you can't change the success criteria after seeing results |
| **Approval Records** | When a human approves something, the approval is tied to the exact file and can't be reused for a different version | Like a signed contract — your signature applies to this specific version, not "whatever comes next" |

> [!NOTE]
> **In simple terms:** The foundation ensures that every migration has a provable, auditable history. Nothing is "trust me, it worked." Everything is "here's the evidence."

---

## Part 2 — Uploading and Storing SAS Programs

### How does a SAS file get into the system?

```
    Operator uploads program.sas
              │
              ▼
    ┌─────────────────────────────────┐
    │  System computes a fingerprint   │
    │  (SHA-256 hash of file contents) │
    │                                   │
    │  Example:                         │
    │  "program.sas" → fingerprint      │
    │  a3f7b2c1...                      │
    └──────────────┬────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │  Store the file with its         │
    │  fingerprint as the ID           │
    │                                   │
    │  If the same file is uploaded     │
    │  again, it's recognized as a      │
    │  duplicate — not stored twice     │
    └──────────────┬────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │  Record an event:                │
    │  "source/registered"             │
    │  with the fingerprint            │
    └─────────────────────────────────┘
```

### Key properties of storage

- **Fingerprint = Identity.** The file is identified by its contents, not its name. If two people upload the same file with different names, the system knows it's the same file.
- **Never overwritten.** Once stored, a file cannot be changed. If you modify the SAS code, it becomes a new file with a new fingerprint.
- **Always verifiable.** At any time, you can recompute the fingerprint and confirm the file hasn't been tampered with.

---

## Part 3 — Discovering Dependencies ("What Other Files Does This Program Need?")

### The problem

SAS programs rarely work alone. A main program might say:

```
%include "shared/date_formats.sas";
%include "macros/clean_data.sas";
%include "macros/standard_report.sas";
```

This means: *"Before running me, also load these three other files."* And those files might include even more files. It's a chain.

### How the system handles it

```
    program.sas
        │
        ├── includes "shared/date_formats.sas"
        │       │
        │       └── includes "shared/constants.sas"
        │
        ├── includes "macros/clean_data.sas"
        │
        └── includes "macros/standard_report.sas"
                │
                └── includes "macros/chart_helpers.sas"
```

The system:

1. **Reads the SAS source** and finds every `%include` directive
2. **Follows the chain** — if an included file also includes files, it follows those too
3. **Builds a dependency map** showing exactly which files are needed
4. **Detects problems early:**
   - **Missing file?** → "This program references `macros/old_util.sas` but that file doesn't exist in the system. Please upload it."
   - **Circular reference?** → "File A includes File B, which includes File A. This is a loop and must be fixed."
5. **Records the complete map** as an artifact so we always know exactly what was included

> [!NOTE]
> **Why this matters:** If you translate the main program but miss a crucial included file, the translation will be wrong. Dependency discovery ensures we have the complete picture before we start.

---

## Part 4 — Understanding the SAS Program (Parsing and Analysis)

### What happens

Before translating, the system needs to **understand** what the SAS program does. This is like reading a recipe carefully before cooking it in a different kitchen.

```
    Raw SAS Source Code
           │
           ▼
    ┌──────────────────┐
    │   Tokenizer       │  "Break the text into meaningful pieces"
    │                    │
    │   DATA step →     │  Keywords, variables, operators,
    │   SET customers;  │  literals, comments...
    │   WHERE age > 30; │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │   Parser          │  "Understand the structure"
    │                    │
    │   This is a:      │
    │   - Data read      │
    │   - Filter          │
    │   - Output          │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Semantic IR       │  "Understand what it MEANS"
    │  (Intermediate     │
    │   Representation)  │
    │                    │
    │  "Read customers   │
    │   table, keep only │
    │   rows where age   │
    │   is over 30,      │
    │   write results"   │
    └──────────────────┘
```

### Why we need this intermediate understanding

The system doesn't just do a word-for-word translation. It understands the **meaning** of the SAS program so it can:

- Know which parts are straightforward to translate (simple filter → Spark filter)
- Know which parts are **dangerous** (SAS MERGE has tricky behavior that SQL JOIN doesn't match)
- Tag each section with a **confidence level** — "I'm very confident about this part" vs. "This part needs extra attention"
- Track exactly which line of SAS source produced which part of the PySpark output (so if something goes wrong later, we can trace it back)

---

## Part 5 — Translation: Turning SAS into PySpark

### The hybrid approach

Translation uses **two methods working together** — like having both a dictionary and an expert translator:

```
    SAS Program (understood via IR)
              │
              ▼
    ┌─────────────────────────────────────┐
    │          RULE-BASED ENGINE           │
    │                                       │
    │  Well-known patterns with known       │
    │  correct translations:                │
    │                                       │
    │  SAS: "WHERE age > 30"                │
    │  →  Spark: ".filter(col('age') > 30)" │
    │                                       │
    │  SAS: "PROC SORT BY name"             │
    │  →  Spark: ".orderBy('name')"         │
    │                                       │
    │  ✅ Deterministic                      │
    │  ✅ Zero cost                          │
    │  ✅ 100% reproducible                  │
    └──────────────┬──────────────────────┘
                   │
        Anything rules can't handle
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │          LLM (AI) TRANSLATOR         │
    │                                       │
    │  Complex or unusual patterns that     │
    │  need reasoning:                      │
    │                                       │
    │  "This DATA step uses RETAIN to       │
    │   carry forward a running total       │
    │   across BY groups — translate to     │
    │   a Spark window function"            │
    │                                       │
    │  ⚠️  Advisory only — never trusted    │
    │     without independent verification  │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │     COMBINED PYSPARK OUTPUT          │
    │                                       │
    │  Each section labeled:                │
    │  🟢 "translated by rule" (high conf)  │
    │  🟡 "translated by AI" (verify)       │
    │  🔴 "could not translate" (human)     │
    └─────────────────────────────────────┘
```

### What are Skills?

Skills are **cheat sheets for the AI** about specific SAS concepts. SAS has many tricky behaviors that an AI might get wrong without specific guidance:

| Skill | What It Teaches the AI |
|---|---|
| BY-Group Processing | SAS processes data in groups — the FIRST. and LAST. flags don't exist in Spark |
| MERGE Semantics | SAS MERGE is NOT the same as SQL JOIN — it handles duplicates very differently |
| Missing Values | SAS missing (`.`) sorts before everything; Spark NULL sorts differently |
| RETAIN | SAS carries values forward across rows — needs Spark window functions |
| Date Handling | SAS counts days from Jan 1, 1960; different from standard epochs |

Skills are loaded **only when relevant.** If the program doesn't use MERGE, the MERGE skill isn't loaded — this keeps the AI focused.

### What about Caching?

- If the **same SAS pattern** has been translated before with the same rules, the cached result is reused instead of asking the AI again
- This saves **time and money** (AI calls cost money per use)
- Cached translations are stored as artifacts with fingerprints, so we can verify they're used correctly

---

## Part 6 — The Plugin System: How Components Plug In

### What is a plugin?

The system is built as **interchangeable parts** — like electrical appliances that plug into standard outlets. Each major capability is a plugin:

```
    ┌─────────────────────────────────────────────┐
    │              HARNESS (the outlet)             │
    │                                               │
    │  Provides: event log, artifacts, policy,      │
    │  approvals, scopes, lifecycle management      │
    └──────┬──────────┬──────────┬────────────┬────┘
           │          │          │            │
    ┌──────┴───┐ ┌────┴────┐ ┌──┴──────┐ ┌───┴──────┐
    │  SAS     │ │ Spark   │ │ LLM     │ │ Storage  │
    │  Parser  │ │ Executor│ │ Provider│ │ Provider │
    │  Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin   │
    └──────────┘ └─────────┘ └─────────┘ └──────────┘
```

### Why plugins?

- **Swappable:** Want to use a different AI model? Swap the LLM plugin. Want to run on a different cloud? Swap the executor plugin.
- **Testable:** During development, use a "dummy" Spark executor that returns fake results. In production, use the real Databricks executor. The rest of the system doesn't know the difference.
- **Safe:** A translation plugin can never directly access Databricks credentials. It asks the harness, which checks policy first.

### The Databricks Plugin

This is the plugin that connects to your **Databricks workspace** to run PySpark code:

```
    Translation produces PySpark code
              │
              ▼
    ┌──────────────────────────────────────┐
    │       DATABRICKS EXECUTOR PLUGIN      │
    │                                        │
    │  1. Records "I'm about to submit a    │
    │     job" in the event log              │
    │                                        │
    │  2. Submits the PySpark code to        │
    │     Databricks as a Lakeflow Job       │
    │                                        │
    │  3. Waits for the job to complete       │
    │     (polls status every few seconds)    │
    │                                        │
    │  4. Collects the output data            │
    │                                        │
    │  5. Verifies the output fingerprint     │
    │                                        │
    │  6. Records "Job completed              │
    │     successfully" in the event log      │
    │                                        │
    │  Safety: If the system crashes after    │
    │  step 2 but before step 6, it can       │
    │  recover by finding the job that was     │
    │  already submitted — it never submits   │
    │  a duplicate.                           │
    └──────────────────────────────────────┘
```

---

## Part 7 — Reconciliation: Comparing SAS Output vs. Spark Output

### This is the heart of the system

After running both the original SAS program and the translated PySpark code **on the same input data**, the system compares their outputs layer by layer:

```
    SAS Output                    Spark Output
    ┌──────────────┐              ┌──────────────┐
    │ 10 columns    │              │ 10 columns    │
    │ 50,000 rows   │              │ 50,000 rows   │
    │ customer data │              │ customer data │
    └──────┬───────┘              └──────┬───────┘
           │                              │
           └──────────┬───────────────────┘
                      │
                      ▼
              LAYER 1: SCHEMA
              "Do both outputs have the
               same columns?"
              ┌─────────────────────┐
              │ Column names match?  │ ✅
              │ Column types match?  │ ✅
              │ Column order match?  │ ✅
              │ Nullability match?   │ ✅
              └────────┬────────────┘
                       │
                       ▼
              LAYER 2: AGGREGATES
              "Do the big-picture numbers
               look the same?"
              ┌─────────────────────┐
              │ Row count match?     │ ✅ 50,000 = 50,000
              │ Total revenue match? │ ✅ $12.4M = $12.4M
              │ Avg age match?       │ ✅ 42.3 = 42.3
              │ Null counts match?   │ ⚠️  SAS: 47, Spark: 49
              └────────┬────────────┘
                       │
                       ▼
              LAYER 3: ROW-BY-ROW
              "Does every single row match?"
              ┌─────────────────────┐
              │ 49,982 rows: ✅      │
              │ 18 rows: ❌ differ   │
              │                      │
              │ Differences found in │
              │ column "premium_amt" │
              │ for customers with   │
              │ missing birth_date   │
              └────────┬────────────┘
                       │
                       ▼
              LAYER 4: STATISTICAL
              "Even if not exact, are they
               statistically the same?"
              ┌─────────────────────┐
              │ Distribution match?  │ ✅
              │ Outlier pattern?     │ ✅
              │ The 18 mismatched    │
              │ rows all involve     │
              │ missing dates        │
              └─────────────────────┘
```

### The verdict

The reconciliation doesn't just say "pass" or "fail." It gives a **detailed verdict:**

| Verdict | Meaning |
|---|---|
| **PASS** | Every row, every column, exact match |
| **PASS WITH TOLERANCE** | Numbers match within the allowed precision (e.g., $1234.567 vs $1234.568) |
| **STATISTICALLY EQUIVALENT** | Not row-for-row identical, but statistically the same distribution |
| **FAIL** | Real differences found — repair needed |
| **INCONCLUSIVE** | Not enough evidence to decide — need more testing |
| **BLOCKED** | Can't compare — an execution failed or data is unavailable |

> [!IMPORTANT]
> **The reconciler is independent from the translator.** The AI that wrote the PySpark code has no influence over the comparison. This is like having the translator and the proofreader be different people who don't talk to each other.

---

## Part 8 — Repair and Diagnosis: What Happens When It Doesn't Match

### The diagnosis and repair loop

When reconciliation finds differences, the system doesn't just say "it's wrong" — it figures out **why** and **tries to fix it automatically:**

```
    Reconciliation found 18 mismatched rows
              │
              ▼
    ┌─────────────────────────────────────┐
    │  STEP 1: DIAGNOSE                    │
    │                                       │
    │  "Where do the differences come       │
    │   from?"                              │
    │                                       │
    │  Trace backward:                      │
    │  Mismatched column: "premium_amt"     │
    │       ↓                               │
    │  Computed by: premium calculation     │
    │       ↓                               │
    │  PySpark line 47: missing value       │
    │  handled as NULL                      │
    │       ↓                               │
    │  SAS line 23: missing value (.)       │
    │  treated as zero in arithmetic        │
    │                                       │
    │  DIAGNOSIS: SAS treats missing        │
    │  values differently than Spark NULLs  │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  STEP 2: HYPOTHESIZE                 │
    │                                       │
    │  "The PySpark code should treat       │
    │   NULL birth_date as zero when        │
    │   calculating premium, matching       │
    │   SAS behavior"                       │
    │                                       │
    │  PREDICTED EFFECT:                    │
    │  "This fix should resolve the 18      │
    │   mismatched rows in the missing-     │
    │   date cohort without affecting       │
    │   any other rows"                     │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  STEP 3: VALIDATE THE FIX            │
    │                                       │
    │  Before running the full test:        │
    │                                       │
    │  ✅ Is the code syntactically valid?  │
    │  ✅ No forbidden operations?          │
    │  ✅ No security violations?           │
    │  ✅ No policy changes?                │
    │  ✅ Not a duplicate of a previous     │
    │     fix that already failed?          │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  STEP 4: TEST THE FIX                │
    │                                       │
    │  Run the fixed PySpark code on        │
    │  the same data, compare outputs:      │
    │                                       │
    │  18 previously failing rows: ✅ fixed │
    │  49,982 previously passing rows: ✅   │
    │  still passing (no regressions)       │
    │                                       │
    │  RESULT: Fix is good ✅               │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │  STEP 5: ACCEPT OR ESCALATE          │
    │                                       │
    │  All rows match → CERTIFIED ✅        │
    │  OR                                   │
    │  Still failing → Try another fix 🔄   │
    │  OR                                   │
    │  Going in circles → ESCALATE to       │
    │  human review 🧑‍💻                     │
    └─────────────────────────────────────┘
```

### Safety guards in the repair loop

The system has built-in protections to prevent the repair loop from going wrong:

| Guard | What It Prevents | Example |
|---|---|---|
| **No regression** | A fix can't break something that was already working | "Your fix resolved the 18 date rows, but now 200 other rows are wrong — rejected" |
| **No oscillation** | The system can't keep flipping between two fixes | "Fix A was tried, then Fix B, then Fix A again — this is going in circles. Escalating to human." |
| **No policy changes** | The AI can't change the rules to make its fix "pass" | "The AI tried to widen the tolerance from 0.01 to 1.00 so its bad translation would pass — denied." |
| **Cost limits** | The repair loop can't run forever burning money | "This migration has exceeded $50 in AI and compute costs — pausing for human review." |
| **Duplicate detection** | The same fix can't be tried twice | "This exact fix was already tried in attempt #3 and failed — skipping." |

### When does a human get involved?

The system escalates to a human when:

- 🧑‍💻 The automatic repair couldn't fix the differences after multiple attempts
- 🧑‍💻 The repair loop detected it was going in circles
- 🧑‍💻 The SAS program uses a construct the system doesn't understand
- 🧑‍💻 The differences require a business judgment ("Is this rounding acceptable?")
- 🧑‍💻 The cost limit was reached
- 🧑‍💻 The program has side effects (writes to databases, sends emails) that can't be automatically verified

When escalating, the system provides:

- Exactly what it tried and why each attempt failed
- The specific SAS constructs causing the problem
- The exact rows and columns that differ
- Suggested actions for the human

---

## Part 9 — Certification: The Final Output

When everything matches, the system produces a **migration certificate:**

```
    ┌──────────────────────────────────────────────┐
    │            MIGRATION CERTIFICATE              │
    │                                                │
    │  Program:     claims_processing.sas            │
    │  Translated:  claims_processing.py             │
    │                                                │
    │  ─────────────────────────────────────────     │
    │                                                │
    │  Input Data:   Snapshot #a3f7b2c1...           │
    │                (50,000 rows, 10 columns)        │
    │                                                │
    │  SAS Environment:  SAS 9.4M8                   │
    │  Spark Environment: Databricks 14.3 LTS        │
    │                                                │
    │  ─────────────────────────────────────────     │
    │                                                │
    │  Verification Results:                         │
    │    Schema:     PASS ✅                          │
    │    Aggregates: PASS ✅                          │
    │    Row parity: PASS ✅ (50,000 / 50,000)       │
    │                                                │
    │  Policy:       Standard v2.1 (#d4e5f6...)      │
    │  Event chain:  142 events, verified ✅          │
    │  Approved by:  jsmith@company.com               │
    │                                                │
    │  ─────────────────────────────────────────     │
    │                                                │
    │  This certificate states:                      │
    │  "The PySpark output was shown equivalent       │
    │   to the SAS output under the above policy,    │
    │   environment, and input data."                │
    │                                                │
    │  Certificate ID: cert-2026-0928-001             │
    │  Evidence Root:  #f8a9b0c1d2e3...               │
    └──────────────────────────────────────────────┘
```

### What makes the certificate trustworthy?

- **Evidence chain** — Every step is recorded. An auditor can replay the entire history.
- **Fingerprints** — Every file (source, translation, input data, output data) has a unique fingerprint. Any tampering is detectable.
- **Independent verification** — The comparison was done by code that is completely separate from the translation code.
- **Bound to specific conditions** — The certificate is valid for THIS input data, THIS SAS version, THIS Spark version, THIS policy. Change any of those, and you need a new certificate.

---

## The Complete Journey — One Walkthrough

Here's everything together for one SAS program:

```
    DAY 1
    ├── Operator uploads "claims_processing.sas"
    │   └── System discovers 3 included files
    │       ├── macros/date_utils.sas
    │       ├── macros/format_currency.sas
    │       └── shared/config.sas
    │
    ├── System parses all 4 files
    │   ├── 12 DATA steps found
    │   ├── 3 PROC SQL blocks found
    │   ├── 2 MERGE operations found ⚠️ (loaded MERGE skill)
    │   └── 5 missing-value patterns found ⚠️ (loaded missing-value skill)
    │
    └── System translates to PySpark
        ├── 80% translated by deterministic rules 🟢
        ├── 15% translated by AI with guidance 🟡
        └── 5% marked as "needs verification" 🔴

    DAY 1 (continued)
    ├── Runs original SAS on pinned test data → SAS output
    ├── Runs translated PySpark on same data → Spark output
    │
    └── Reconciliation:
        ├── Schema: PASS ✅
        ├── Aggregates: PASS ✅
        └── Row parity: FAIL ❌ (18 rows differ)

    DAY 1–2 (automatic)
    ├── Diagnosis: "Missing value handling in premium calculation"
    ├── Repair attempt #1: Fix NULL handling → Run → Compare
    │   └── 18 rows fixed, 0 regressions ✅
    │
    └── Reconciliation:
        ├── Schema: PASS ✅
        ├── Aggregates: PASS ✅
        └── Row parity: PASS ✅ (50,000 / 50,000)

    DAY 2
    ├── System requests human approval
    │   └── Operator reviews the fix, evidence, and certificate
    │
    └── CERTIFIED ✅
        └── Certificate issued with full evidence chain
```

---

## Summary: What Makes This System Different

| Traditional Approach | Our System |
|---|---|
| AI translates code and says "looks right" | AI translates, then an **independent system** runs both and compares actual outputs |
| Manual testing by engineers | **Automated** row-by-row comparison with detailed diagnostics |
| "It seems to work" | **Certificate** with evidence chain proving it works on specific data |
| Fix errors manually | **Automatic repair loop** diagnoses and fixes common issues |
| Hope nothing was missed | **Dependency discovery** ensures all included files are accounted for |
| Results depend on who tested | **Deterministic** — same inputs always produce same verdict |
| Hard to audit months later | **Complete event log** — replay the entire migration history any time |

> [!TIP]
> **The one thing to remember:** This system doesn't trust the AI's translation. It **independently verifies** by running both programs and comparing every row of output. That's the difference between "AI-generated code" and "verified migration."
From your Claude, let's get slides for this:

1\. Technical process of how SAS to PySpark migration is working — covering what goes to the LLM and how, what comes out, where iterations are running, etc.; and then we will highlight where humans will be involved on the UI.

2\. Technical process of how rationalization recommendations are generated (this you can run on your personal system since you developed it there) — covering what goes to the LLM and how, and what comes out.

3\. What value the SAS to PySpark migration and reconciliation tool is generating against the manual process or even GitHub Copilot — value to be quantified wherever possible (I am hoping speed and accuracy, etc., will come out).

4\. What value the dashboard rationalization recommendation is generating against the manual process — value to be quantified wherever possible (I am hoping speed and accuracy, etc., will come out).
