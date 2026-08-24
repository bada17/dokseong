# 데이터 만드는 스크립트

`public/data/` 안의 파일들을 다시 만들 때 쓴다. 평소에는 돌릴 일이 없다.

## build-map.py — 행정구역 경계 → SVG 경로

브라우저에서 d3나 topojson 같은 라이브러리를 안 쓰려고, 지도 계산을 여기서 미리 끝낸다.

```bash
# 1. 원본 경계 데이터 받기 (통계청 2018, southkorea-maps 저장소)
curl -O https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-topo-simple.json
curl -O https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json

# 2. 변환 (받은 파일이 있는 폴더를 넘긴다)
python tools/build-map.py <원본폴더>
```

만들어지는 것:

- `public/data/map-sido.json` — 시도 17개 (19KB)
  ⚠️ **다시 돌리면 손으로 넣은 것이 지워집니다** — 지도 라벨용 `short` 필드와
  전남광주 통합(광주 `24`를 전남 `36`에 합친 것)은 이 스크립트가 모릅니다.
  다시 만들었다면 README의 '전남광주통합특별시' 절을 보고 되살려야 합니다.
- `public/data/map-sigungu/<시도코드>.json` — 기초자치단체 229개 (합계 196KB)

**기초자치단체 기준으로 묶는다.** 고양시덕양구 같은 '일반구'는 자치단체가
아니므로 고양시로 합친다(경계선까지 지운다). 서울 종로구 같은 '자치구'는
그 자체가 기초자치단체라 그대로 둔다.

> ⚠️ 지금 데이터는 2018년 기준이라 이후 행정구역 변경(강원특별자치도 등)이
> 반영돼 있지 않다. 새 경계 데이터를 받으면 이 스크립트를 다시 돌리면 된다.

## build-awards.py — 역대 수상 표 → awards.json

`public/index.html`의 역대 수상 표 40건을 읽어서, 수상자 이름을 실제 행정구역
이름과 대조해 지역 코드를 붙인다. **대조에 실패하면 지어내지 않고
`scope: "unknown"`으로 남긴다.**

```bash
python tools/build-awards.py <검토파일을_쓸_폴더>
```

`scope` 값의 뜻:

| 값 | 뜻 | 건수 |
|---|---|---|
| `local` | 특정 지역 | 12 |
| `central` | 중앙정부·공공기관 | 21 |
| `multi` | 여러 지자체에 걸친 사업 | 4 |
| `unknown` | **사람이 확인해야 함** | 3 |

`unknown` 3건은 (재)천년의 문, 청원군(2014년 청주시로 통합), ㈜부산관광개발입니다.
