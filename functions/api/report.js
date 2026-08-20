/**
 * POST /api/report — 시민 제보 접수
 *
 * Cloudflare Pages Functions. 이 파일 하나가 곧 하나의 주소가 된다.
 * (functions/api/report.js  →  /api/report)
 *
 * 사진이 붙을 수 있어 multipart/form-data 와 JSON 을 모두 받는다.
 * 사진은 D1 에 넣을 수 없으므로 R2(PHOTOS 바인딩)에 올리고 키만 저장한다.
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

// 사진
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;   // 클라이언트에서 이미 줄여 보낸다
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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

const extOf = (type) =>
  ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[type] || 'bin');

/** 본문을 읽어 { fields, files } 로 돌려준다. JSON 이든 폼이든 같은 모양. */
async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const fields = {};
    const files = [];
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string') fields[k] = v;
      else if (k === 'photos') files.push(v);
    }
    if (fields.utm) {
      try { fields.utm = JSON.parse(fields.utm); } catch { fields.utm = null; }
    }
    return { fields, files };
  }
  return { fields: await request.json(), files: [] };
}

export async function onRequestPost({ request, env }) {
  if (env.REPORT_OPEN === '0') {
    return json({ ok: false, error: '지금은 제보를 받지 않습니다.' }, 403);
  }

  let body, files;
  try {
    const parsed = await readBody(request);
    body = parsed.fields;
    files = parsed.files;
  } catch {
    return json({ ok: false, error: '요청을 읽지 못했습니다.' }, 400);
  }

  // 봇 잡이. 사람 눈에 안 보이는 칸이라 채워져 있으면 봇이다.
  // 봇에게는 성공한 것처럼 보이게 해서 다시 시도하지 않게 한다.
  if (body.website) return json({ ok: true });

  const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const data = {
    // 사업명은 이제 선택입니다. 정식 명칭을 아는 사람만 제보할 수 있게 되면
    // 정작 늘리려는 일반 시민이 첫 칸에서 막힙니다.
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

  // 사진만 있고 글이 없는 경우도 제보로 받는다 (사진이 곧 증거).
  if (!data.detail && files.length === 0) {
    return json({ ok: false, error: '제보 내용을 적거나 사진을 올려주세요.' }, 400);
  }
  if (data.detail && data.detail.length < 10 && files.length === 0) {
    return json({ ok: false, error: '제보 내용을 조금만 더 자세히 적어주세요.' }, 400);
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json({ ok: false, error: '이메일 주소를 다시 확인해주세요.' }, 400);
  }

  if (files.length > MAX_PHOTOS) {
    return json({ ok: false, error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있습니다.` }, 400);
  }
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return json({ ok: false, error: '사진 파일만 올릴 수 있습니다.' }, 400);
    }
    if (f.size > MAX_PHOTO_BYTES) {
      return json({ ok: false, error: '사진 한 장이 너무 큽니다.' }, 400);
    }
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

    // 사진을 R2에 올린다. 실패해도 제보 자체는 살린다 —
    // 사진 때문에 제보를 통째로 잃는 편이 더 나쁘다.
    const keys = [];
    if (files.length && env.PHOTOS) {
      for (const f of files) {
        const key = `reports/${round}/${crypto.randomUUID()}.${extOf(f.type)}`;
        try {
          await env.PHOTOS.put(key, f.stream(), {
            httpMetadata: { contentType: f.type },
          });
          keys.push(key);
        } catch (err) {
          console.error('photo upload failed', key, err);
        }
      }
    }

    await env.DB.prepare(
      `INSERT INTO reports
         (round, project_name, region, detail, email, sido, sigungu, photos,
          ip_hash, user_agent, utm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        round,
        data.project_name || null,
        data.region || null,
        data.detail || null,
        data.email || null,
        data.sido,
        data.sigungu,
        keys.length ? JSON.stringify(keys) : null,
        ipHash,
        (request.headers.get('user-agent') || '').slice(0, 300),
        body.utm ? JSON.stringify(body.utm).slice(0, 500) : null
      )
      .run();

    return json({ ok: true, round, photos: keys.length });
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
