-- Muninn Studio & Analytics Extensions
-- Adds memory management, audit trail, and contradiction detection

-- Memory audit log for tracking changes
CREATE TABLE IF NOT EXISTS memory_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'create', 'edit', 'delete', 'salience_adjust'
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contradiction queue for conflict detection
CREATE TABLE IF NOT EXISTS contradiction_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    memory_a_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    memory_b_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    conflict_type VARCHAR(100) NOT NULL, -- 'same_entity_different_value', 'temporal_conflict', 'attribute_conflict'
    conflict_description TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
    resolution VARCHAR(50), -- 'accept_a', 'accept_b', 'keep_both', 'accept_newer', 'accept_higher_confidence'
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics aggregation table (pre-computed for performance)
CREATE TABLE IF NOT EXISTS analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_memories INT DEFAULT 0,
    new_memories INT DEFAULT 0,
    total_retrievals INT DEFAULT 0,
    avg_salience FLOAT DEFAULT 0,
    top_entities JSONB, -- [{name, count}]
    salience_distribution JSONB, -- {bin: count}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, date)
);

-- Memory access tracking (for retrieval patterns)
CREATE TABLE IF NOT EXISTS memory_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL, -- 'recall', 'search', 'edit', 'delete'
    query_text TEXT,
    retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id UUID
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_audit_log_memory ON memory_audit_log(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_log_created ON memory_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_contradiction_queue_org ON contradiction_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_queue_status ON contradiction_queue(status);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_org_date ON analytics_daily(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_memory_access_log_org ON memory_access_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_memory_access_log_retrieved ON memory_access_log(retrieved_at);

-- Enable Row Level Security
ALTER TABLE memory_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE contradiction_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own org's audit logs" ON memory_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM memories m
            JOIN user_roles ur ON m.organization_id = ur.organization_id
            WHERE m.id = memory_id AND ur.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own org's contradictions" ON contradiction_queue
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own org's analytics" ON analytics_daily
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own org's access logs" ON memory_access_log
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
        )
    );