/**
 * 감시 참여 (사업별 서명)
 *
 *   POST /api/join   참여 접수
 *   GET  /api/join   사업별 참여자 수
 *
 * ⚠️ 이 파일은 이름·이메일·전화번호를 다룹니다.
 *    참여자 명단은 절대 내보내지 않습니다. GET은 숫자만 돌려줍니다.
 */

// 동의문을 고칠 때마다 이 번호를 올린다. 누가 어느 판에 동의했는지 남기기 위함.
const CONSENT_VERSION = '2026-08-20';

const LIMITS = { name: 60, email: 200, phone: 40, campaign_id: 60, campaign_name: 200 };

const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;

const json = (data, status = 200, cache = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? `public, max-age=${cache}` : 'no-store',
    },
  });

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${ip}`)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** 010-1234-5678, 01012345678, +82 10 … 을 모두 숫자만 남겨 비교한다 */
function normalizePhone(v) {
  const digits = String(v || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('82')) return '0' + digits.slice(2);
  return digits;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '요청을 읽지 못했습니다.' }, 400);
  }

  if (body.website) return json({ ok: true });   // 봇 잡이

  const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const data = {
    campaign_id: clean(body.campaign_id, LIMITS.campaign_id),
    campaign_name: clean(body.campaign_name, LIMITS.campaign_name),
    name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email).toLowerCase(),
    phone: normalizePhone(body.phone).slice(0, LIMITS.phone),
  };

  if (!data.campaign_id) {
    return json({ ok: false, error: '어떤 감시에 참여하는지 확인하지 못했습니다.' }, 400);
  }
  if (!data.name) return json({ ok: false, error: '이름을 적어주세요.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json({ ok: false, error: '이메일 주소를 다시 확인해주세요.' }, 400);
  }
  if (!/^01[0-9]{8,9}$/.test(data.phone)) {
    return json({ ok: false, error: '휴대전화번호를 다시 확인해주세요.' }, 400);
  }
  if (!body.consent_privacy) {
    return json({ ok: false, error: '개인정보 수집·이용에 동의해야 참여할 수 있습니다.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hashIp(ip, env.IP_SALT || 'dokseong');

  try {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM participations
       WHERE ip_hash = ? AND created_at > datetime('now', ?)`
    ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();

    if (recent && recent.n >= RATE_MAX) {
      return json(
        { ok: false, error: '잠시 후 다시 시도해주세요. 짧은 시간에 너무 많이 보냈습니다.' },
        429
      );
    }

    // 이미 참여했으면 새로 쌓지 않고 최신 내용으로 덮어쓴다
    await env.DB.prepare(
      `INSERT INTO participations
         (campaign_id, campaign_name, round, name, email, phone,
          consent_privacy, consent_news, consent_version, consented_at,
          ip_hash, user_agent, utm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
       ON CONFLICT(campaign_id, email) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         consent_privacy = excluded.consent_privacy,
         consent_news = excluded.consent_news,
         consent_version = excluded.consent_version,
         consented_at = excluded.consented_at`
    ).bind(
      data.campaign_id,
      data.campaign_name || null,
      parseInt(env.CURRENT_ROUND || '41', 10),
      data.name,
      data.email,
      data.phone,
      1,
      body.consent_news ? 1 : 0,
      CONSENT_VERSION,
      ipHash,
      (request.headers.get('user-agent') || '').slice(0, 300),
      body.utm ? JSON.stringify(body.utm).slice(0, 500) : null
    ).run();

    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM participations WHERE campaign_id = ?`
    ).bind(data.campaign_id).first();

    return json({ ok: true, total: total ? total.n : 0 });
  } catch (err) {
    console.error('join failed', err);
    return json(
      { ok: false, error: '접수 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.' },
      500
    );
  }
}

/** 사업별 참여자 수. 명단은 내보내지 않는다. */
export async function onRequestGet({ env }) {
  try {
    const rows = await env.DB.prepare(
      `SELECT campaign_id, COUNT(*) AS n FROM participations GROUP BY campaign_id`
    ).all();
    const counts = Object.fromEntries(
      (rows.results || []).map((r) => [r.campaign_id, r.n])
    );
    return json({ ok: true, counts }, 200, 60);
  } catch (err) {
    console.error('join counts failed', err);
    // 참여자 수를 못 불러와도 화면은 살아 있어야 한다
    return json({ ok: false, counts: {} }, 200);
  }
}
