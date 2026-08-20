"""
TopoJSON(통계청 2018 행정구역) → SVG 경로로 미리 변환한다.

브라우저에서 topojson/d3 같은 라이브러리를 안 쓰기 위해 여기서 다 계산한다.
결과물:
  public/data/map-sido.json          전국 시도 17개
  public/data/map-sigungu/<코드>.json 시도별 시군구 (각자 화면에 꽉 차게 맞춤)
"""
import json, math, os, re, sys

SRC = sys.argv[1]
OUT = 'public/data'

# 지도 그림 크기 (SVG viewBox 기준)
W, H = 1000, 1200
PAD = 20


def load_topo(path):
    return json.load(open(path, encoding='utf-8'))


def decode_arcs(topo):
    """델타 인코딩된 arc를 실제 경위도 좌표로 푼다."""
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    out = []
    for arc in topo['arcs']:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out


def ring_coords(arcs, idxs):
    """geometry의 arc 인덱스 목록을 하나의 좌표열로 잇는다. 음수는 역방향."""
    pts = []
    for i in idxs:
        if i >= 0:
            seg = arcs[i]
        else:
            seg = arcs[~i][::-1]
        pts.extend(seg[1:] if pts else seg)
    return pts


def polygons(geom, arcs):
    """Polygon / MultiPolygon을 링 목록으로 통일해서 돌려준다."""
    t = geom.get('type')
    if t == 'Polygon':
        return [[ring_coords(arcs, r) for r in geom['arcs']]]
    if t == 'MultiPolygon':
        return [[ring_coords(arcs, r) for r in poly] for poly in geom['arcs']]
    return []


def geom_arc_rings(geom):
    """geometry를 [폴리곤][링][arc인덱스] 형태로 통일."""
    t = geom.get('type')
    if t == 'Polygon':
        return [geom['arcs']]
    if t == 'MultiPolygon':
        return geom['arcs']
    return []


def merge_geoms(geoms, arcs):
    """
    여러 geometry를 하나의 도형으로 합친다(topojson merge와 같은 원리).

    두 도형이 맞닿은 경계는 같은 arc를 서로 반대 방향으로 한 번씩 쓴다.
    그래서 arc가 두 번 쓰였으면 내부 경계 → 버리고, 한 번만 쓰였으면
    바깥 테두리 → 남긴다. 남은 조각을 끝점끼리 이어 붙여 링을 만든다.
    """
    used = {}
    signed = []
    for g in geoms:
        for poly in geom_arc_rings(g):
            for ring in poly:
                for i in ring:
                    k = i if i >= 0 else ~i
                    used[k] = used.get(k, 0) + 1
                    signed.append(i)

    outer = [i for i in signed if used[i if i >= 0 else ~i] == 1]
    if not outer:
        return []

    # 각 조각의 좌표열
    pieces = []
    for i in outer:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        if len(pts) >= 2:
            pieces.append(list(pts))

    # 끝점이 맞는 조각끼리 이어 붙이기
    rings = []
    while pieces:
        cur = pieces.pop(0)
        changed = True
        while changed:
            changed = False
            if cur[0] == cur[-1]:
                break
            for j, pc in enumerate(pieces):
                if pc[0] == cur[-1]:
                    cur.extend(pc[1:]); pieces.pop(j); changed = True; break
                if pc[-1] == cur[-1]:
                    cur.extend(pc[::-1][1:]); pieces.pop(j); changed = True; break
                if pc[-1] == cur[0]:
                    cur = pc[:-1] + cur; pieces.pop(j); changed = True; break
                if pc[0] == cur[0]:
                    cur = pc[::-1][:-1] + cur; pieces.pop(j); changed = True; break
        if len(cur) >= 4:
            if cur[0] != cur[-1]:
                cur.append(cur[0])
            rings.append([cur])
    return rings


def make_projector(all_pts):
    """경위도를 화면 좌표로. 한국 위도대에서 가로가 눌리지 않게 cos 보정."""
    lons = [p[0] for p in all_pts]
    lats = [p[1] for p in all_pts]
    lat_mid = (min(lats) + max(lats)) / 2
    k = math.cos(math.radians(lat_mid))

    xs = [lon * k for lon in lons]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(lats), max(lats)

    sx = (W - PAD * 2) / (x1 - x0) if x1 > x0 else 1
    sy = (H - PAD * 2) / (y1 - y0) if y1 > y0 else 1
    s = min(sx, sy)

    # 남는 여백만큼 가운데로
    ox = (W - (x1 - x0) * s) / 2
    oy = (H - (y1 - y0) * s) / 2

    def proj(lon, lat):
        return (round((lon * k - x0) * s + ox, 1),
                round((y1 - lat) * s + oy, 1))   # 위도는 위아래 뒤집기

    return proj


def rdp(pts, eps):
    """Douglas-Peucker. 클릭용 지도라 해안선 디테일은 과감히 버린다."""
    if len(pts) < 3:
        return pts
    stack = [(0, len(pts) - 1)]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        x0, y0 = pts[i0]
        x1, y1 = pts[i1]
        dx, dy = x1 - x0, y1 - y0
        norm = math.hypot(dx, dy)
        far, fard = -1, 0.0
        for i in range(i0 + 1, i1):
            x, y = pts[i]
            if norm == 0:
                d = math.hypot(x - x0, y - y0)
            else:
                d = abs(dy * x - dx * y + x1 * y0 - y1 * x0) / norm
            if d > fard:
                far, fard = i, d
        if fard > eps:
            keep[far] = True
            stack.append((i0, far))
            stack.append((far, i1))
    return [pt for pt, k in zip(pts, keep) if k]


def to_path(rings_list, proj, eps=1.6, min_area_px=12):
    """SVG path 문자열. 점을 솎고 아주 작은 섬은 버려서 용량을 줄인다."""
    parts = []
    for rings in rings_list:
        for ring in rings:
            pts = [proj(lon, lat) for lon, lat in ring]
            ded = [pts[0]]
            for pt in pts[1:]:
                if pt != ded[-1]:
                    ded.append(pt)
            if len(ded) < 4:
                continue
            xs = [q[0] for q in ded]
            ys = [q[1] for q in ded]
            if (max(xs) - min(xs)) * (max(ys) - min(ys)) < min_area_px:
                continue
            ded = rdp(ded, eps)
            if len(ded) < 4:
                continue
            if ded[0] != ded[-1]:
                ded.append(ded[0])
            parts.append('M' + 'L'.join(f'{round(x)} {round(y)}' for x, y in ded) + 'Z')
    return ''.join(parts)


def centroid(rings_list, proj):
    """라벨을 찍을 자리. 가장 큰 링의 무게중심."""
    best, best_area = None, -1
    for rings in rings_list:
        if not rings:
            continue
        pts = [proj(lon, lat) for lon, lat in rings[0]]
        if len(pts) < 3:
            continue
        a = cx = cy = 0.0
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            cr = x0 * y1 - x1 * y0
            a += cr
            cx += (x0 + x1) * cr
            cy += (y0 + y1) * cr
        if a == 0:
            continue
        area = abs(a / 2)
        if area > best_area:
            best_area = area
            best = (round(cx / (3 * a), 1), round(cy / (3 * a), 1))
    return best or (W / 2, H / 2)


def build(topo, features_filter=None):
    arcs = decode_arcs(topo)
    okey = list(topo['objects'].keys())[0]
    geoms = topo['objects'][okey]['geometries']

    picked = [g for g in geoms
              if not features_filter or features_filter(g['properties'])]

    # 기초자치단체 기준으로 묶는다.
    # 고양시덕양구 같은 '일반구'는 자치단체가 아니므로 고양시로 합친다.
    # 서울 종로구 같은 '자치구'는 그 자체가 기초자치단체이므로 그대로 둔다.
    groups = {}
    order = []
    for g in picked:
        props = g['properties']
        m = re.match(r'^(.+시)(.+구)$', props['name'])
        key = m.group(1) if m else props['name']
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(g)

    items = []
    for key in order:
        members = groups[key]
        first = dict(members[0]['properties'])
        if len(members) == 1:
            rings = polygons(members[0], arcs)
        else:
            first['name'] = key
            first['code'] = min(p['properties']['code'] for p in members)
            first['name_eng'] = ''
            first['merged'] = [p['properties']['name'] for p in members]
            rings = merge_geoms(members, arcs)
        if rings:
            items.append((first, rings))

    all_pts = [p for _, rings in items for ring_group in rings for ring in ring_group for p in ring]
    if not all_pts:
        return []
    proj = make_projector(all_pts)

    out = []
    for props, rings in items:
        cx, cy = centroid(rings, proj)
        out.append({
            'code': props['code'],
            'name': props['name'],
            'name_eng': props.get('name_eng', ''),
            'd': to_path(rings, proj),
            'cx': cx,
            'cy': cy,
        })
    return out


os.makedirs(OUT + '/map-sigungu', exist_ok=True)

# ── 시도 ──
prov = load_topo(SRC + '/skorea-provinces-2018-topo-simple.json')
sido = build(prov)
sido.sort(key=lambda x: x['code'])
json.dump({'viewBox': f'0 0 {W} {H}', 'areas': sido},
          open(OUT + '/map-sido.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('시도', len(sido), '개 ->', os.path.getsize(OUT + '/map-sido.json') // 1024, 'KB')

# ── 시군구 (시도별로 따로 저장, 각자 꽉 차게) ──
muni = load_topo(SRC + '/skorea-municipalities-2018-topo-simple.json')
total = 0
index = {}
for s in sido:
    pref = s['code']
    subs = build(muni, lambda p, pref=pref: p['code'].startswith(pref))
    if not subs:
        continue
    subs.sort(key=lambda x: x['code'])
    path = f'{OUT}/map-sigungu/{pref}.json'
    json.dump({'viewBox': f'0 0 {W} {H}', 'sido': s['name'], 'areas': subs},
              open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += len(subs)
    index[pref] = len(subs)

print('시군구', total, '개 /', len(index), '개 시도 파일')
print('시군구 폴더 합계',
      sum(os.path.getsize(f'{OUT}/map-sigungu/{f}') for f in os.listdir(OUT + '/map-sigungu')) // 1024, 'KB')
