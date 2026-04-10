// Simplified extraction prompt for faster, more reliable parsing

export const SIMPLE_PROMPT = `Extract facts from conversation. Output ONLY valid JSON.

Example:
Input: "Caroline: I went to the LGBTQ support group yesterday. Melanie: That's great!"
Output: {"entities":[{"name":"Caroline","type":"person"},{"name":"Melanie","type":"person"}],"facts":[{"subject":"Caroline","predicate":"attended","object":"LGBTQ support group","evidence":"I went to the LGBTQ support group yesterday"}]}

Rules:
1. Resolve pronouns to names (I/me = speaker name)
2. Extract ALL entities mentioned
3. Use simple predicates: identity, has_hobby, attended, lives_in, works_at, relationship_status, has_child
4. Each fact: subject, predicate, object, evidence (required)
5. Output compact JSON, no markdown, no newlines in values

Output ONLY the JSON object, nothing else.`;