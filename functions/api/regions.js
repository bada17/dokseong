/**
 * GET /api/regions — 지역별 제보 건수
 *
 * 지도에 색을 칠하고 "이 지역 제보 N건"을 보여주기 위한 집계.
 * 제보 '내용'은 여기서 내보내지 않는다. 시민이 쓴 글을 검토 없이
 * 공개하면 사실 확인이 안 된 지목이 그대로 노출되기 때문이다.
 * 내용 공개는 검토를 마친 것(status='candidate')만 별도로 다룬다.
 */

const json = (data, status = 200, cache = 60) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${cache}`,
    },
  });

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const round = url.searchParams.get('round'); // 없으면 전체 회차 합계

  try {
    // 반자동: 사람이 한 번 열어본 제보만 지도에 오른다.
    //
    //   new        접수만 됨. 아무도 안 봤다        → 지도에 안 뜸
    //   reviewing  담당자가 읽고 넘겼다             → 지도에 뜸
    //   candidate  이번 회차 후보로 채택           → 지도에 뜸
    //   dropped    후보 탈락                       → 안 뜸
    //   spam       장난·광고                       → 안 뜸
    //
    // 접수는 자동이고 표시만 사람이 연다. 장난 제보 한 건에 지역 색이
    // 바뀌면 지도를 믿을 수 없게 되기 때문이다.
    // ⚠️ 그래서 아무도 status 를 안 바꾸면 지도는 계속 0건이다.
    //    검토하는 방법은 저장소 README 의 '제보 검토하기' 를 볼 것.
    const LIVE = "status IN ('reviewing', 'candidate')";
    const where = round ? `WHERE round = ? AND ${LIVE}` : `WHERE ${LIVE}`;
    const bind = round ? [round] : [];

    const bySido = await env.DB.prepare(
      `SELECT sido AS code, COUNT(*) AS n FROM reports
       ${where} AND sido IS NOT NULL
       GROUP BY sido`
    ).bind(...bind).all();

    const bySigungu = await env.DB.prepare(
      `SELECT sigungu AS code, COUNT(*) AS n FROM reports
       ${where} AND sigungu IS NOT NULL
       GROUP BY sigungu`
    ).bind(...bind).all();

    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM reports ${where}`
    ).bind(...bind).first();

    const toMap = (rows) =>
      Object.fromEntries((rows.results || []).map((r) => [r.code, r.n]));

    return json({
      ok: true,
      total: total ? total.n : 0,
      sido: toMap(bySido),
      sigungu: toMap(bySigungu),
    });
  } catch (err) {
    console.error('regions summary failed', err);
    // 지도는 수상 내역만으로도 볼 수 있어야 하므로, 실패해도 빈 집계를 준다.
    return json({ ok: false, total: 0, sido: {}, sigungu: {} }, 200, 0);
  }
}
