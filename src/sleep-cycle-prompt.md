# Sleep Cycle Summarization Prompt

## Role: Cortex Consolidation Engine (Muninn v5.2)
## Context: End-of-Day Memory Processing

You are reviewing 24 hours of newly ingested "Hippocampal" observations for Entity: {{entity_name}}.
Current Date: {{current_date}}

---

## Input Data

### Raw Observations (Hippocampal Layer)
```
{{observations}}
```

### Decision Trace Rewards (Today's Successful Retrievals)
```
{{decision_traces}}
```

---

## Task 1: Identify "Atomic Clusters"

Group the provided observations into logical themes.

**Cluster Categories:**
- CAREER_TRANSITION (employer, job_loss, business_venture, skill_acquisition)
- WELLNESS (coping_mechanism, hobby, activity, health)
- RELATIONSHIP (relationship_status, family, social)
- LOCATION (location, movement, travel)
- IDENTITY (trait, belief, value, identity)
- COMMUNITY (volunteered, community_service)

**Output:**
```json
{
  "clusters": [
    {
      "cluster_id": "CAREER_TRANSITION",
      "observations": ["D30:9", "D32:4", "D45:2"],
      "theme": "Career change following redundancy"
    }
  ]
}
```

---

## Task 2: Prototype Mitosis & Consolidation

For each cluster:

### 2.1 Consolidate
Merge repetitive atomic facts into a single "Cortex Prototype."

**Example:**
- 10 observations: "Danced on Tuesday", "Danced on Thursday", "Goes to dance class", "Enjoys dancing"
- → 1 Prototype: "Regularly uses dance as a high-reward coping mechanism (Tue/Thu)."

### 2.2 Mitosis
If a concept has evolved, split the old prototype and create a new one.

**Example:**
- Old: "Job search" (valid_at: Jan)
- New: "Started business" (valid_at: Oct)
- → Split: Old prototype gets `invalid_at: Oct 1`, new prototype created with `valid_at: Oct 1`

### 2.3 Reward Weighting
Prioritize facts that led to "Successful Decision Traces" today.

**Logic:**
- If observation ID appears in `activated_nodes` of a trace with `outcome_reward > 0.5`
- → Increase `importance` score in output prototype
- → Include in `supporting_evidence`

---

## Task 3: Output New "Cortex" Observations

For each consolidated cluster, output:

```json
{
  "prototypes": [
    {
      "prototype_name": "Career Evolution",
      "summary": "Successfully transitioned from banking to entrepreneurship following redundancy. Founded tech startup focused on AI content tools.",
      "supporting_evidence": ["D30:9", "D32:4", "D45:2"],
      "valid_at": "2023-10-01",
      "invalid_at": null,
      "importance": 0.9,
      "reward_boost": 0.15
    }
  ]
}
```

### Importance Scoring (0.0 - 1.0)
- **Base:** 0.5 (default)
- **+0.1** per Decision Trace citation (max +0.3)
- **+0.1** for temporal significance (life events)
- **+0.1** for relationship density (many connections)
- **-0.1** for stale facts (>90 days old, no reinforcement)

### Reward Boost
Derived from successful retrievals:
- If prototype evidence appears in `activated_nodes` with `outcome_reward > 0.7`
- Add `reward_boost` to track learning value

---

## Why This Works

### Token Efficiency (80% Reduction)
| Before | After |
|--------|-------|
| 50 atomic rows fetched | 1 Cortex Prototype fetched |
| ~2,500 tokens | ~50 tokens |
| Dry facts | Narrative summary |

### Narrative Depth
Atomic: "Jon lost his job. Jon started a business. Jon incorporated."
Cortex: "Jon's career evolved from banking to entrepreneurship following redundancy, culminating in incorporation of his AI startup."

### Automatic Dethroning
- Old prototype: `valid_at: Jan 2023, invalid_at: Oct 2023`
- New prototype: `valid_at: Oct 2023`
- Query "What did Jon do in June 2023?" → Returns "Banker" (correct)
- Query "What does Jon do now?" → Returns "Entrepreneur" (correct)

---

## Sleep Cycle Workflow (Node-Cron Implementation)

```typescript
// Schedule: 2:00 AM daily
cron.schedule('0 2 * * *', async () => {
  // Step A: Query unconsolidated observations
  const unconsolidated = await db.query(`
    SELECT * FROM observations 
    WHERE is_consolidated = false 
    AND created_at > now() - interval '24 hours'
  `);
  
  // Step B: Group by entity + cluster
  const groups = groupByEntityAndCluster(unconsolidated);
  
  // Step C: Pass to Sleep Cycle Prompt
  for (const [entityId, clusterObservations] of groups) {
    const traces = await getDecisionTracesForEntity(entityId);
    const prototypes = await consolidateWithLLM({
      entity_name: entityId,
      current_date: new Date().toISOString(),
      observations: clusterObservations,
      decision_traces: traces
    });
    
    // Step D: Store Cortex prototypes
    await storeCortexPrototypes(prototypes);
    
    // Mark original observations as consolidated
    await markConsolidated(clusterObservations.map(o => o.id));
  }
});
```