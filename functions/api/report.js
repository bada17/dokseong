/**
 * POST /api/report — 시민 제보 접수
 *
 * Cloudflare Pages Functions. 이 파일 하나가 곧 하나의 주소가 된다.
 * (functions/api/report.js  →  /api/report)
 */

const LIMITS = {
  project_name: 200,
  region: 100,
  detail: 5000,
  email: 200,
};

// 같은 사람이 10분 안에 이보다 많이 넣으면 막는다.
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/** IP를 그대로 저장하지 않기 위한 단방향 해시 */
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

export async function onRequestPost({ request, env }) {
  if (env.REPORT_OPEN === '0') {
    return json({ ok: false, error: '지금은 제보를 받지 않습니다.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '요청을 읽지 못했습니다.' }, 400);
  }

  // 봇 잡이. 사람 눈에 안 보이는 칸이라 채워져 있으면 봇이다.
  // 봇에게는 성공한 것처럼 보이게 해서 다시 시도하지 않게 한다.
  if (body.website) return json({ ok: true });

  const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const data = {
    project_name: clean(body.project_name, LIMITS.project_name),
    region: clean(body.region, LIMITS.region),
    detail: clean(body.detail, LIMITS.detail),
    email: clean(body.email, LIMITS.email),
    // 지도용 지역 코드. 형식이 안 맞으면 그냥 비운다 (제보 자체는 살린다).
    sido: /^\d{2}$/.test(body.sido || '') ? body.sido : null,
    sigungu: /^\d{5}$/.test(body.sigungu || '') ? body.sigungu : null,
  };
  // 시군구가 있으면 시도는 그 앞 두 자리로 맞춘다.
  if (data.sigungu) data.sido = data.sigungu.slice(0, 2);

  if (!data.project_name || !data.detail) {
    return json({ ok: false, error: '사업명과 제보 내용을 적어주세요.' }, 400);
  }
  if (data.detail.length < 10) {
    return json({ ok: false, error: '제보 내용을 조금만 더 자세히 적어주세요.' }, 400);
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json({ ok: false, error: '이메일 주소를 다시 확인해주세요.' }, 400);
  }

  const round = parseInt(env.CURRENT_ROUND || '41', 10);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hashIp(ip, env.IP_SALT || 'dokseong');

  try {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM reports
       WHERE ip_hash = ? AND created_at > datetime('now', ?)`
    )
      .bind(ipHash, `-${RATE_WINDOW_MIN} minutes`)
      .first();

    if (recent && recent.n >= RATE_MAX) {
      return json(
        { ok: false, error: '잠시 후 다시 시도해주세요. 짧은 시간에 너무 많이 보냈습니다.' },
        429
      );
    }

    await env.DB.prepare(
      `INSERT INTO reports
         (round, project_name, region, detail, email, sido, sigungu,
          ip_hash, user_agent, utm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        round,
        data.project_name,
        data.region || null,
        data.detail,
        data.email || null,
        data.sido,
        data.sigungu,
        ipHash,
        (request.headers.get('user-agent') || '').slice(0, 300),
        body.utm ? JSON.stringify(body.utm).slice(0, 500) : null
      )
      .run();

    return json({ ok: true, round });
  } catch (err) {
    console.error('report insert failed', err);
    return json(
      { ok: false, error: '접수 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.' },
      500
    );
  }
}

// 브라우저가 주소창으로 열었을 때를 위한 안내
export const onRequestGet = () =>
  json({ ok: false, error: 'POST로 보내주세요.' }, 405);
