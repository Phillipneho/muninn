/**
 * MINIMAL EXTRACTION PROMPT
 * Optimized for Cloudflare Workers AI (Llama 3.1 8B)
 * Simple, fast, reliable extraction
 */

export const MINIMAL_EXTRACTION_PROMPT = `Extract facts from the text. Use these predicates:
- identifies_as (identity, gender, role)
- has_relationship_status (single, married, dating)
- has_child (children)
- moved_from (origin country/city)
- known_for (duration: X years)
- researched (topics investigated)
- activity (hobbies, interests)
- kids_like (child preferences)
- camped_at (camping locations)
- attended_on (events with dates)

Session date: {{SESSION_DATE}}

Text: {{CONTENT}}

CRITICAL: Use {{SESSION_DATE}} as the reference date. When text says "last week" or "yesterday", compute the actual date from session date.

Output ONLY JSON on one line:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"identifies_as","object":"value","pds_decimal":"1201","valid_from":"2023-06-09","evidence":"quote"}]}

EVERY fact MUST have valid_from set to the computed date (use session date if unsure).

PDS codes: 1200=Identity, 2100=Relationship, 3100=Career, 4100=Events, 1400=Preferences.`;
