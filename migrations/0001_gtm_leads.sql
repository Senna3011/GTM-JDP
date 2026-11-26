CREATE TABLE IF NOT EXISTS gtm_leads (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    full_name TEXT NOT NULL,
    work_email TEXT NOT NULL,
    company_name TEXT,
    domain_url TEXT NOT NULL,
    icp_segment TEXT NOT NULL,
    market_region TEXT NOT NULL DEFAULT 'global',
    lead_magnet_type TEXT NOT NULL,
    target_niche TEXT,
    target_keyword TEXT,
    monthly_volume_estimate INTEGER DEFAULT 0,
    notes TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    referrer_url TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    turnstile_verified INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_gtm_leads_email_domain ON gtm_leads (work_email, domain_url, created_at);
CREATE INDEX IF NOT EXISTS idx_gtm_leads_status ON gtm_leads (status);
