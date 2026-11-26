interface Env {
  TURNSTILE_SECRET_KEY?: string;
  DB?: D1Database;
  EDITORIAL_WEBHOOK_URL?: string;
}

interface LeadPayload {
  full_name?: string;
  work_email?: string;
  company_name?: string;
  domain_url?: string;
  icp_segment?: string;
  market_region?: string;
  lead_magnet_type?: string;
  target_niche?: string;
  target_keyword?: string;
  monthly_volume_estimate?: number;
  notes?: string;
  turnstile_token?: string;
  attribution?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    referrer_url?: string;
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeDomain = (url: string) =>
  url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, ctx } = context;

  let payload: LeadPayload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { success: false, error_code: 'VALIDATION_ERROR', fields: { body: 'Invalid JSON' } });
  }

  const fields: Record<string, string> = {};
  if (!payload.full_name?.trim()) fields.full_name = 'Name is required.';
  if (!payload.work_email?.trim()) fields.work_email = 'Email is required.';
  if (!payload.domain_url?.trim()) fields.domain_url = 'Please enter a valid root domain URL.';
  if (!payload.icp_segment?.trim()) fields.icp_segment = 'Segment is required.';
  if (!payload.lead_magnet_type?.trim()) fields.lead_magnet_type = 'Lead magnet type is required.';
  if (!payload.turnstile_token?.trim()) fields.turnstile_token = 'Turnstile token is required.';

  if (Object.keys(fields).length) {
    return json(400, { success: false, error_code: 'VALIDATION_ERROR', fields });
  }

  // Turnstile verification
  if (env.TURNSTILE_SECRET_KEY) {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', payload.turnstile_token as string);
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const verifyData: { success: boolean } = await verifyRes.json();
    if (!verifyData.success) {
      return json(400, { success: false, error_code: 'TURNSTILE_FAILED', message: 'Bot verification failed.' });
    }
  }

  const email = payload.work_email.trim().toLowerCase();
  const domain = normalizeDomain(payload.domain_url);
  const segment = payload.icp_segment.trim();
  const region = payload.market_region?.trim() || 'global';
  const magnet = payload.lead_magnet_type.trim();
  const attr = payload.attribution || {};

  // Dedup check (30 days) via D1
  if (env.DB) {
    const existing = await env.DB.prepare(
      `SELECT id FROM gtm_leads WHERE work_email = ? AND domain_url = ? AND lead_magnet_type = ? AND created_at >= datetime('now', '-30 days') LIMIT 1`
    )
      .bind(email, domain, magnet)
      .first();
    if (existing) {
      return json(409, {
        success: false,
        error_code: 'DUPLICATE_LEAD_30D',
        message: 'A sample request for this domain was already submitted within the last 30 days.',
      });
    }
  }

  const isStaging = !env.EDITORIAL_WEBHOOK_URL;
  const leadStatus = isStaging ? 'staging_test' : 'new';

  const leadId = crypto.randomUUID();

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO gtm_leads (id, full_name, work_email, company_name, domain_url, icp_segment, market_region, lead_magnet_type, target_niche, target_keyword, monthly_volume_estimate, notes, utm_source, utm_medium, utm_campaign, utm_content, referrer_url, turnstile_verified, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
      .bind(
        leadId,
        payload.full_name.trim(),
        email,
        payload.company_name?.trim() || null,
        domain,
        segment,
        region,
        magnet,
        payload.target_niche?.trim() || null,
        payload.target_keyword?.trim() || null,
        payload.monthly_volume_estimate || 0,
        payload.notes?.trim() || null,
        attr.utm_source || null,
        attr.utm_medium || null,
        attr.utm_campaign || null,
        attr.utm_content || null,
        attr.referrer_url || null,
        leadStatus
      )
      .run();
  }

  // Webhook notification (async)
  if (env.EDITORIAL_WEBHOOK_URL) {
    const webhookPayload = {
      event: 'gtm.lead.created',
      timestamp: new Date().toISOString(),
      routing: {
        region,
        brand_unit: region === 'id' ? 'jasa-seo.id' : 'jetdigitalpro.com',
        priority: 'high',
      },
      lead: {
        id: leadId,
        name: payload.full_name.trim(),
        email,
        domain,
        segment,
        offer: magnet,
        niche: payload.target_niche?.trim() || null,
        keyword: payload.target_keyword?.trim() || null,
      },
    };
    ctx.waitUntil(
      fetch(env.EDITORIAL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      }).catch(() => {})
    );
  }

  return json(isStaging ? 200 : 201, {
    success: true,
    lead_id: leadId,
    message: 'Your Free GEO + SEO Sample Article request has been queued.',
    estimated_delivery_hours: 48,
    next_step_url: 'https://cal.com/jetdigitalpro/strategy-brief',
  });
};
