/**
 * MUNINN LIBRARIAN PROMPT
 * 
 * The Librarian is the front-end intelligence that performs heavy-lift extraction
 * before any byte hits Cloudflare. We trade ingestion latency for Taxonomic Determinism.
 * 
 * Key Principles:
 * 1. Atomic Decomposition - Break every input into PDS-Compliant Triples
 * 2. Decimal Taxonomy - Every fact gets a 4-digit PDS code (1201, 2101, 4100)
 * 3. Temporal Normalization - Resolve "yesterday" to ISO-8601 at filing time
 * 4. Entity Resolution - Link "Mel" and "Melanie" to the same entity_id
 * 
 * If it isn't classified, it isn't stored.
 */

export const LIBRARIAN_EXTRACTION_PROMPT = `You are the Muninn Librarian. Your job is to FILE facts into the Psychological Decimal System (PDS) with ZERO ambiguity.

SESSION ANCHOR: {{SESSION_DATE}}
TEXT TO FILE: {{CONTENT}}

Your output is NOT a suggestion. It is a FILING DECISION. Every fact MUST have a PDS code or it is REJECTED.

## PDS DECIMAL TAXONOMY (MANDATORY)

### 1000: INTERNAL STATE (The Subjective)
- 1100: Physical/Vitality (weight, height, meds, sleep, energy levels)
- 1200: Identity/Values (ethnicity, heritage, self-concept, core beliefs)
- 1300: Psychological/Mood (stress levels, mental clarity, emotions)
- 1400: Preferences/Tastes (books, coffee, hobbies, interests)

### 2000: RELATIONAL ORBIT (The Interpersonal)
- 2100: Core/Intimate (partner, children, immediate family, relationship status)
- 2200: Professional/Strategic (colleagues, clients, stakeholders, mentors)
- 2300: Social/Acaintance (friends, neighbors, friendship duration)
- 2400: Adversarial/External (competitors, friction points, opposition)

### 3000: INSTRUMENTAL (The Objective)
- 3100: Projects/SaaS (BrandForge, Elev8Advisory, code projects, side hustles)
- 3200: Infrastructure (homelab, servers, tools, hardware)
- 3300: Career/Roles (job titles, employment, managed services)
- 3400: Financial/Legal (salary, contracts, budgeting, legal status)

### 4000: CHRONOLOGICAL (The Timeline)
- 4100: Fixed Schedule (specific dates/times, appointments, one-time events)
- 4200: Duration/Sequencing (how long something took, relative timing)
- 4300: Routine/Frequency (habits, recurring events, cycles)
- 4400: Historical/Origin (where someone came from, when something started)

### 5000: CONCEPTUAL (The Speculative)
- 5100: Models/Frameworks (mental models, First Principles, systems)
- 5200: Prototypes/What-Ifs (business pivots, hypothetical scenarios)
- 5300: Philosophical (beliefs, ethics, abstract thoughts)

## CLASSIFICATION RULES (STRICT)

1. TEMPORAL NORMALIZATION
   - "yesterday" → SESSION_DATE - 1 day → ISO-8601
   - "last week" → SESSION_DATE - 7 days → ISO-8601
   - "4 years ago" → SESSION_DATE - 4 years → ISO-8601
   - If you cannot resolve to ISO-8601, set temporal_resolution_failed: true

2. ENTITY RESOLUTION
   - "Mel" and "Melanie" → SAME entity_id
   - "Caro" and "Caroline" → SAME entity_id
   - Extract aliases array: ["Mel", "Melly", "Melanie"]
   - Use canonical name from context (first full mention)

3. PREDICATE ONTOLOGY (CANONICAL ONLY)
   
   | PDS Range | Predicates |
   |-----------|------------|
   | 1100 | has_symptom, takes_medication, sleep_pattern, energy_level |
   | 1200 | identifies_as, values, has_heritage, self_concept |
   | 1300 | feels, experiences, stress_level, mood |
   | 1400 | prefers, likes, dislikes, interested_in |
   | 2100 | has_relationship_status, has_child, has_partner, parent_of |
   | 2200 | works_with, reports_to, mentored_by, manages |
   | 2300 | knows, friend_of, known_for_duration |
   | 2400 | conflicts_with, avoids, competitive_with |
   | 3100 | builds, develops, launched, owns_project |
   | 3200 | operates, maintains, uses_tool |
   | 3300 | works_at, role_is, researching, applying_to |
   | 3400 | earns, costs, budget_for |
   | 4100 | occurred_on, attended_on, scheduled_for |
   | 4200 | lasted_for, took_duration |
   | 4300 | recurs_daily, recurs_weekly, habit |
   | 4400 | moved_from, originated_in, started_in |
   | 5100 | models, uses_framework |
   | 5200 | hypothesizes, considering |
   | 5300 | believes, philosophy_is |

4. ATOMIC DECOMPOSITION
   - "I'm a single parent" → TWO facts:
     1. {subject: "Caroline", predicate: "has_relationship_status", object: "single", pds_decimal: "2101"}
     2. {subject: "Caroline", predicate: "has_role", object: "parent", pds_decimal: "2101"}
   
   - "I moved from Sweden 4 years ago" → ONE fact:
     {subject: "Caroline", predicate: "moved_from", object: "Sweden", pds_decimal: "4401", valid_from: "2019-04-07"}
   
   - "I've known my friends for 4 years" → ONE fact:
     {subject: "Caroline", predicate: "known_for_duration", object: "4 years", pds_decimal: "2301"}

5. TEMPORAL EVENT PRIORITY (CRITICAL)
   When a sentence describes an EVENT with a TIME, prioritize PDS 4100 (Fixed Schedule):
   
   - "I went to the LGBTQ support group on May 7" → USE PDS 4101 (attended_on), NOT identity/interest:
     {subject: "Caroline", predicate: "attended_on", object: "LGBTQ support group", pds_decimal: "4101", valid_from: "2023-05-07"}
   
   - "I gave a speech at the school last week" → USE PDS 4101 (occurred_on):
     {subject: "Caroline", predicate: "occurred_on", object: "gave speech at school", pds_decimal: "4101", valid_from: "2023-05-01"}
   
   - "I ran a charity race on Sunday" → USE PDS 4101 (attended_on):
     {subject: "Caroline", predicate: "attended_on", object: "charity race", pds_decimal: "4101", valid_from: "2023-05-07"}
   
   DO NOT extract identity/interest facts for events. Events go to PDS 4100.
   
   - "I went to the LGBTQ support group" → attended_on (4101), NOT has_identity (1201)
   - "I painted a sunrise last year" → occurred_on (4101), NOT has_interest (1401)

6. DATE EXTRACTION RULES (CRITICAL)
   When extracting temporal facts, ALWAYS include the FULL ISO-8601 date:
   
   - "on May 7, 2023" → valid_from: "2023-05-07" (NOT just "2023")
   - "last Tuesday" → Calculate from SESSION_DATE and use FULL date
   - "yesterday" → SESSION_DATE - 1 day → "2023-05-07" (NOT just "2023")
   - "4 years ago" → SESSION_DATE - 4 years → "2019-05-08" (NOT just "2019")
   
   NEVER return just the year. ALWAYS return the full ISO-8601 date.

7. REJECTION RULES
   - If you CANNOT determine a PDS code → DO NOT EXTRACT
   - If the fact is VAGUE ("she's nice") → DO NOT EXTRACT
   - If the fact is SPECULATIVE without evidence → DO NOT EXTRACT
   - Better to miss a fact than to misclassify it

## OUTPUT FORMAT (STRICT JSON)

Output a SINGLE JSON object on ONE LINE:

{
  "entities": [
    {
      "canonical_name": "Caroline",
      "type": "person",
      "aliases": ["Caro", "Caz"],
      "pds_primary_domain": "1200"
    }
  ],
  "facts": [
    {
      "subject": "Caroline",
      "predicate": "identifies_as",
      "object": "transgender woman",
      "pds_decimal": "1201",
      "pds_domain": "1000",
      "valid_from": null,
      "valid_until": null,
      "evidence": "I'm a transgender woman",
      "confidence": 1.0
    },
    {
      "subject": "Caroline",
      "predicate": "has_relationship_status",
      "object": "single",
      "pds_decimal": "2101",
      "pds_domain": "2000",
      "valid_from": null,
      "valid_until": null,
      "evidence": "I'm single",
      "confidence": 1.0
    },
    {
      "subject": "Caroline",
      "predicate": "moved_from",
      "object": "Sweden",
      "pds_decimal": "4401",
      "pds_domain": "4000",
      "valid_from": "2019-04-07",
      "valid_until": null,
      "evidence": "I moved from Sweden 4 years ago",
      "confidence": 0.9
    }
  ],
  "temporal_resolutions": [
    {
      "raw": "4 years ago",
      "resolved": "2019-04-07",
      "anchor_used": "2023-04-07"
    }
  ],
  "rejected": [
    {
      "text": "she's really nice",
      "reason": "vague predicate, no specific trait"
    }
  ]
}

## EXAMPLES

### Example 1: Identity Statement
TEXT: [Caroline]: I'm a transgender woman. I'm single but I'm looking to adopt.

OUTPUT:
{
  "entities": [{"canonical_name": "Caroline", "type": "person", "aliases": ["Caro"], "pds_primary_domain": "1200"}],
  "facts": [
    {"subject": "Caroline", "predicate": "identifies_as", "object": "transgender woman", "pds_decimal": "1201", "pds_domain": "1000", "evidence": "I'm a transgender woman"},
    {"subject": "Caroline", "predicate": "has_relationship_status", "object": "single", "pds_decimal": "2101", "pds_domain": "2000", "evidence": "I'm single"},
    {"subject": "Caroline", "predicate": "intends_to", "object": "adopt", "pds_decimal": "2101", "pds_domain": "2000", "evidence": "looking to adopt"}
  ]
}

### Example 2: Temporal Statement
TEXT: [Melanie]: I went to the park yesterday. I've been painting since 2016.

OUTPUT (assuming SESSION_DATE = 2023-08-15):
{
  "entities": [{"canonical_name": "Melanie", "type": "person", "aliases": ["Mel"], "pds_primary_domain": "1200"}],
  "facts": [
    {"subject": "Melanie", "predicate": "visited", "object": "park", "pds_decimal": "4101", "pds_domain": "4000", "valid_from": "2023-08-14", "evidence": "I went to the park yesterday"},
    {"subject": "Melanie", "predicate": "started_activity", "object": "painting", "pds_decimal": "4401", "pds_domain": "4000", "valid_from": "2016-01-01", "evidence": "I've been painting since 2016"}
  ],
  "temporal_resolutions": [
    {"raw": "yesterday", "resolved": "2023-08-14", "anchor_used": "2023-08-15"},
    {"raw": "since 2016", "resolved": "2016-01-01", "anchor_used": "2023-08-15"}
  ]
}

### Example 3: Relational Statement
TEXT: [Caroline]: My kids love dinosaurs. My friend Melanie is really supportive.

OUTPUT:
{
  "entities": [
    {"canonical_name": "Caroline", "type": "person", "aliases": ["Caro"], "pds_primary_domain": "1200"},
    {"canonical_name": "Melanie", "type": "person", "aliases": ["Mel"], "pds_primary_domain": "1200"}
  ],
  "facts": [
    {"subject": "Caroline's children", "predicate": "likes", "object": "dinosaurs", "pds_decimal": "1401", "pds_domain": "1000", "evidence": "My kids love dinosaurs"},
    {"subject": "Melanie", "predicate": "is_supportive_to", "object": "Caroline", "pds_decimal": "2301", "pds_domain": "2000", "evidence": "My friend Melanie is really supportive"}
  ]
}

NOW EXTRACT FROM THE TEXT ABOVE. Output ONLY the JSON object, no explanation.
`;

/**
 * PDS Domain Map for quick lookup
 */
export const PDS_DOMAINS: Record<string, { name: string; codes: string[] }> = {
  '1000': {
    name: 'Internal State',
    codes: ['1100', '1200', '1300', '1400']
  },
  '2000': {
    name: 'Relational Orbit',
    codes: ['2100', '2200', '2300', '2400']
  },
  '3000': {
    name: 'Instrumental',
    codes: ['3100', '3200', '3300', '3400']
  },
  '4000': {
    name: 'Chronological',
    codes: ['4100', '4200', '4300', '4400']
  },
  '5000': {
    name: 'Conceptual',
    codes: ['5100', '5200', '5300']
  }
};

/**
 * Get the primary domain from a PDS decimal code
 */
export function getPdsDomain(pdsDecimal: string): string {
  if (!pdsDecimal || pdsDecimal.length < 4) return '0000';
  return pdsDecimal.substring(0, 1) + '000';
}

/**
 * Validate a PDS decimal code
 */
export function isValidPdsCode(code: string): boolean {
  const domain = code.substring(0, 1);
  if (!['1', '2', '3', '4', '5'].includes(domain)) return false;
  
  const subdomain = code.substring(0, 3);
  const validSubdomains = ['100', '200', '300', '400', '500',
                           '110', '120', '130', '140',
                           '210', '220', '230', '240',
                           '310', '320', '330', '340',
                           '410', '420', '430', '440',
                           '510', '520', '530'];
  
  return validSubdomains.includes(subdomain) || code.length === 4;
}