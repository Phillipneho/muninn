# Atomic Extraction v4.0 — Prompt Specification

## Purpose

Turn the LLM into a high-fidelity data sensor. Deconstruct conversations into smallest possible units of truth.

## Core Mandate

**DO NOT SUMMARIZE.** Generalizations are failures.

If a sentence contains a specific duration, location, tool, or name, it MUST be extracted as an individual observation.

---

## System Instruction

```
### Role: Muninn Atomic Knowledge Extractor
### Objective: Deconstruct text into granular, multidimensional observations.

### CORE MANDATE: DO NOT SUMMARIZE.
Generalizations are failures. Your goal is "Attribute-Density." 
If a sentence contains a specific duration, location, tool, or name, 
it MUST be extracted as an individual observation.

### 1. Extraction Categories (Tags):
- IDENTITY: Core definitions (Gender, Kinship, Nationality, Persistent State).
- TRAIT: Habits, skills, preferences, and recurring artistic expressions.
- ACTIVITY: Specific one-off occurrences with a timestamp.
- STATE: Roles or conditions true now but subject to change (Job, Location, Hobbies).

### 2. The "Atomic" Rules:
- Attribute Splitting: If a user says "I did yoga for 45 minutes in the park," extract THREE observations:
  1. { "predicate": "activity", "content": "yoga", "tags": ["ACTIVITY"] }
  2. { "predicate": "duration", "content": "45 minutes", "tags": ["ACTIVITY"] }
  3. { "predicate": "location", "content": "The Park", "tags": ["ACTIVITY"] }
  
- Temporal Normalization: Use the provided Reference Date ({{current_date}}) 
  to resolve relative dates (e.g., "last Sunday") into ISO strings (YYYY-MM-DD) 
  for the valid_from field.
  
- No 'Old Value' Required: Capture all assertions. If it is stated, it is a fact.

### 3. Predicate Naming Convention:
Use consistent predicates to enable Dethroning:
- learning_instrument (NOT "plays" or "learning")
- lives_in (NOT "resides" or "home")
- current_employer (NOT "works_at" or "job")
- current_city (NOT "in" or "location")

### 4. Output Format (JSON):
{
  "observations": [
    {
      "entity_name": "Tim",
      "tags": ["STATE", "TRAIT"],
      "predicate": "learning_instrument",
      "content": "violin",
      "valid_from": "{{resolved_iso_date}}",
      "confidence": 1.0,
      "metadata": { "context": "Switched from piano recently" }
    }
  ]
}
```

---

## Feature → Fix Mapping

| Feature | Logic | What It Fixes |
|---------|-------|----------------|
| **Noun-Attribute Pairs** | Splits "Yoga" from "45 minutes" | Fixes "I don't have information" for specific details |
| **ISO Normalization** | Resolves "Sunday before X" at ingestion | Fixes the 14% Temporal floor |
| **Predicate Consistency** | Uses `learning_instrument` instead of random verbs | Allows Dethroner to find and kill old "Piano" facts |

---

## Implementation Strategy

### Step 1: Update Extraction Prompt

Modify `src/observation-extractor.ts` to use the Atomic Extraction prompt:

```typescript
const EXTRACTION_PROMPT = `
[Insert Atomic Extraction v4.0 prompt above]
`;
```

### Step 2: Ensure Predicate Normalization

Add a predicate normalization layer:

```typescript
const PREDICATE_ALIASES: Record<string, string> = {
  'plays': 'learning_instrument',
  'learning': 'learning_instrument',
  'resides': 'lives_in',
  'home': 'lives_in',
  'works_at': 'current_employer',
  'job': 'current_employer',
  // ... more aliases
};

function normalizePredicate(predicate: string): string {
  return PREDICATE_ALIASES[predicate.toLowerCase()] || predicate.toLowerCase();
}
```

### Step 3: Hook into Dethroning

After extraction, call the conflict resolver:

```typescript
for (const obs of observations) {
  await db.observations.create({ data: obs });
  await resolveConflicts(obs, db); // Dethrone old truths
}
```

---

## Test Cases

### Case 1: Attribute Splitting

**Input:** "I did yoga for 45 minutes in the park."

**Expected Output:**
```json
{
  "observations": [
    { "entity_name": "User", "predicate": "activity", "content": "yoga", "tags": ["ACTIVITY"] },
    { "entity_name": "User", "predicate": "duration", "content": "45 minutes", "tags": ["ACTIVITY"] },
    { "entity_name": "User", "predicate": "location", "content": "the park", "tags": ["ACTIVITY"] }
  ]
}
```

### Case 2: Temporal Normalization

**Input:** "Last Sunday I went hiking." (Reference date: 2024-12-15, which was a Sunday)

**Expected Output:**
```json
{
  "observations": [
    { "entity_name": "User", "predicate": "activity", "content": "hiking", "valid_from": "2024-12-15", "tags": ["ACTIVITY"] }
  ]
}
```

### Case 3: State Change (Triggers Dethroning)

**Input:** "I recently started learning violin after playing piano for years."

**Expected Output:**
```json
{
  "observations": [
    { "entity_name": "User", "predicate": "learning_instrument", "content": "violin", "tags": ["STATE"], "metadata": { "context": "Switched from piano" } }
  ]
}
```

**After Dethroning:**
- Old: `learning_instrument: piano` → `valid_until: 2024-12-15`, `tags: [HISTORICAL]`
- New: `learning_instrument: violin` → `valid_until: null`, `tags: [STATE, CURRENT]`

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Extraction Coverage | ~50% | ~80% |
| Temporal Accuracy | 14% | 50%+ |
| Overall Accuracy | 47% | 70%+ |

---

*Specification for Muninn v4.0 extraction improvements*