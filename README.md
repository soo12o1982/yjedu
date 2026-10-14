# 2026년 연제구민 디지털 시민성(A-DCS) 진단 및 실태조사 — 온라인 설문 시스템

- 주관기관: 연제구청 평생교육과 · 수행기관: ㈜글로벌리더코리아 · 문의: 051-665-4505
- 설문 화면: `index.html` (GitHub Pages)
- 관리자 화면: `admin.html` (Supabase 로그인)
- 저장소: Supabase PostgreSQL + RLS, 관리자 인증: Supabase Auth

© 2025 박선미. All Rights Reserved. C-2025-032641
※ 본 설문은 원저작자의 사전 동의를 받아 「성인용 디지털 시민성 척도(A-DCS)」 원척도 22문항을 사용하였으며, 조사 목적에 따라 디지털 평생교육 프로그램 참여 관련 문항을 추가하였습니다.

---

## 1. 폴더 구조

```
index.html                설문 화면
admin.html                관리자 화면
css/style.css             디자인(모바일 우선, 큰 글씨, 흰 배경)
js/config.js              ★ Supabase 주소·공개용 키 (배포 전 입력)
js/api.js                 Supabase 호출(REST·Auth), 별도 라이브러리 없음
js/codebook.js            28문항 원문·선택지·코드, 안내 문구
js/survey.js              설문 진행·검증·제출
js/excel.js               엑셀 생성(DATA·LABEL·CODE 외 4종)
js/admin.js               관리자 대시보드·다운로드·추첨
supabase/schema.sql       ★ DB 테이블·RLS·함수 (Supabase SQL Editor에서 실행)
docs/최종설계표.xlsx       변수·문항·코드 최종 설계표
tests/                    테스트 코드(운영에는 필요 없음)
TESTING.md                테스트 결과 (통과/실패/미실시)
```

GitHub에는 개인정보, 실제 응답자료, 관리자 비밀번호, service_role(secret) 키를 올리지 않습니다. `js/config.js`에는 **공개용 키(anon / publishable)**만 넣습니다.

## 2. 설문 흐름 (PDF 원안 순서)

| 단계 | 화면 | 내용 |
|---|---|---|
| 1 | 조사 안내 | 조사명·조사목적·조사대상·참여 안내·주관/수행기관·문의·저작권 (한 페이지) |
| 2 | 응답자 정보 | 1~4번 한 페이지. 1번 "타 구" → 대상 아님·응답 중단 안내, 진행 차단 |
| — | 검사 지침 | PDF 지침·응답방식·응답척도·유의사항 |
| 3 | A-DCS | 5~26번, 한 화면 1문항 |
| 4 | 평생교육 참여 | 27~28번, 한 화면 1문항 |
| 5 | 이벤트 참여 | 개인정보 수집·이용 및 위탁 동의, 휴대전화번호(동의 시) |
| 6 | 완료 | 최종 제출 → 감사 안내 |

- 위쪽: 현재 문항 번호 / 28, 진행률(28문항 응답 기준), 진행 막대. 이벤트 화면은 "마지막 단계"로 따로 표시합니다.
- 아래쪽: 이전·다음 버튼이 항상 보입니다. 휴대폰 뒤로 가기 버튼도 이전 문항으로 이동합니다.
- 보기는 한 줄에 하나씩 놓이며, 선택하면 테두리·배경색과 ✓ 표시가 함께 바뀝니다.
- 작성 중 응답은 그 브라우저 탭 안에만 임시 보관하여 새로고침해도 복원됩니다. 휴대전화번호는 브라우저에 저장하지 않습니다.

## 3. 응답 인원 제한 (서버 DB에서 처리)

- 연령대별 150명, 성별 400명 (유효 완료 응답 기준)
- 제출 시 **연령대 정원과 성별 정원을 동시에** 만족해야 접수됩니다.
  예) 남성 400명이 마감되면 20대에 여유가 있어도 20대 남성은 불가, 20대 여성은 가능.
- 응답자 정보 화면에 들어올 때 최신 현황을 불러와 마감된 보기를 "해당 연령대 응답 완료", "해당 성별 응답 완료"로 표시하고 선택을 막습니다.
- 최종 제출 때 DB 함수 `submit_survey`가 잠금(advisory lock) 안에서 정원 확인과 저장을 한 번에 처리하므로, 동시에 제출해도 정원을 넘겨 저장되지 않습니다.
- 응답 도중 마감되면 제출 시 마감 안내를 보여 주며, 연령·성별을 바꾸도록 유도하지 않습니다.
- 남녀 모두 400명에 도달하거나 관리자가 조사를 마감하면 첫 화면 대신 마감 안내가 나옵니다.
- 관리자가 무효 처리한 응답은 정원 계산에서 빠지고, 원본 기록은 보존됩니다.

## 4. 이벤트 운영

- 대상: 개인정보 수집·이용에 동의하고 휴대전화번호를 입력한 유효 응답자
- 동일 휴대전화번호는 최초 유효 응답 1건만 추첨 대상(나중 응답은 "중복 의심" 표시)
- 추첨: 조사를 마감한 뒤 관리자 페이지에서 [무작위 추첨 실행] (1회만 가능)
- 선정: 100명, 대상이 100명 이하이면 전원 선정
- 기록: 추첨 일시, 실행자, 대상 인원, 당첨자(순번·응답 번호), 추첨 방법을 DB에 저장하고 당첨자 명단 엑셀에 함께 표시
- 휴대전화번호는 응답 테이블과 분리 저장하며, 연락처 권한(can_view_pii)이 있는 관리자만 조회할 수 있습니다. 조회·다운로드할 때마다 이력이 남습니다.
- 쿠폰 발송이 끝나면 관리자 페이지 [휴대전화번호 파기]로 30일 이내에 일괄 삭제합니다.

## 5. 관리자 엑셀

| 버튼 | 파일 | 내용 |
|---|---|---|
| ① 통계분석용 | `연제구_디지털시민성_설문응답_YYYYMMDD.xlsx` | DATA·LABEL·CODE. 유효 응답만, 개인정보 없음. 다운로드 전에 행 수·코드 범위·개인정보 혼입을 자동 검사 |
| ② 전체 응답 관리자료 | `…_전체응답관리_….xlsx` | 유효·무효·중복 의심, 무효 사유. 휴대전화번호 없음 |
| ③ 이벤트 참여자 명단 | `…_이벤트참여자_….xlsx` | 동의자 연락처, 동의 여부, 추첨 대상 여부 (연락처 권한 필요) |
| ④ 조사 현황 | `…_조사현황_….xlsx` | 성별·연령별 완료/정원/잔여, 일자별 접수, 접수 안 된 제출 사유, 이벤트 현황 |
| 당첨자 명단 | `…_당첨자명단_….xlsx` | 추첨 순번·no·응답일시·휴대전화번호 + 추첨 기록 |

**DATA**: 1행 변수명 `no, q1 … q28, date`(소문자), 2행부터 응답자 1명당 1행, 응답값은 숫자 코드. `date`는 엑셀 날짜(yyyy-mm-dd hh:mm:ss).
**LABEL**: DATA와 같은 행·열에 `2) 여성`, `4) 그렇다`처럼 "코드) 보기"로 표시(첨부 샘플 형식).
**CODE**: 변수명·문항 → `코드값 / 보기` → 코드 목록 → 빈 줄 반복(첨부 샘플 형식).
변수별 코드는 `docs/최종설계표.xlsx`와 같습니다.

---

## 6. Supabase 연결 및 보안 설정

1. **프로젝트 만들기**: https://supabase.com 가입 → New project. Region은 서울(Northeast Asia, Seoul)을 권장합니다. DB 비밀번호는 안전한 곳에 보관합니다.
2. **DB 만들기**: 왼쪽 메뉴 **SQL Editor → New query**에 `supabase/schema.sql` 전체를 붙여넣고 **Run**.
3. **회원가입 막기**: **Authentication → Sign In / Providers**에서 *Allow new users to sign up*을 끕니다. (켜져 있어도 관리자 등록이 안 된 계정은 자료를 볼 수 없지만, 꺼 두는 것이 안전합니다.)
4. **관리자 계정 만들기**: **Authentication → Users → Add user → Create new user**에서 관리자 이메일과 비밀번호를 입력하고 *Auto Confirm User*를 선택합니다.
   비밀번호는 정해 두신 관리자 코드를 쓰되, 이 값은 GitHub나 코드 어디에도 적지 않습니다.
5. **관리자로 등록**: SQL Editor에서 이메일을 바꿔 실행합니다.
   ```sql
   insert into public.survey_admins (user_id, can_view_pii, note)
   select id, true, '총괄 관리자' from auth.users where email = '관리자이메일@example.com'
   on conflict (user_id) do update set can_view_pii = excluded.can_view_pii;
   ```
   통계만 보는 담당자는 `can_view_pii`를 `false`로 등록하면 연락처 조회·추첨·파기를 할 수 없습니다.
6. **키 복사**: **Project Settings → API**(또는 API Keys)에서 *Project URL*과 *anon public*(또는 *publishable*) 키를 복사해 `js/config.js`에 넣습니다. **service_role / secret 키는 넣지 않습니다.**

보안 구조 요약
- 모든 테이블 RLS 사용. 일반 이용자는 테이블을 직접 읽거나 쓸 수 없고, `get_survey_status`(집계 숫자)와 `submit_survey`(제출) 두 함수만 실행할 수 있습니다.
- 관리자 함수는 로그인 + `survey_admins` 등록 여부를 서버에서 다시 확인합니다. 관리자 페이지 주소를 알아도 로그인 없이는 아무것도 볼 수 없습니다.
- 휴대전화번호 테이블에는 읽기 정책이 없어 관리자도 직접 조회할 수 없고, 이력이 남는 함수로만 조회됩니다.
- 응답 삭제 기능은 없습니다(무효 처리만 가능, 사유·처리자 기록).
- 같은 접속 주소에서 1시간에 60건을 넘게 제출하면 막습니다(과다 요청 제한). 접속 주소는 날짜를 섞은 해시로만 보관하고 하루 뒤 지웁니다. 복지관 등 같은 와이파이에서 단체로 응답받을 때는 아래 SQL로 한도를 늘리거나 0(제한 없음)으로 바꾸세요.

운영 중 자주 쓰는 SQL
```sql
-- 정원·추첨 인원·과다 요청 한도 변경
update public.survey_settings set age_limit = 150, gender_limit = 400, event_limit = 100, rate_limit_per_hour = 60 where id = 1;
```

## 7. GitHub 업로드와 홈페이지 열기

1. GitHub에서 새 저장소를 만듭니다(예: `yeonje-dcs-survey`).
2. 이 폴더의 파일을 폴더 구조 그대로 업로드합니다(**Add file → Upload files**). `tests/` 폴더는 올리지 않아도 됩니다.
3. `js/config.js`를 열어 연필(편집) 버튼 → Supabase 주소와 공개용 키 입력 → **Commit changes**.
4. **Settings → Pages**: Source `Deploy from a branch`, Branch `main` / `/(root)` → Save.
5. 1~2분 뒤 `https://<GitHub아이디>.github.io/yeonje-dcs-survey/` 에서 설문이, `…/admin.html`에서 관리자 화면이 열립니다.

> 무료 GitHub 계정에서 Pages를 쓰려면 저장소가 Public이어야 합니다. Public 저장소의 `js/codebook.js`에는 A-DCS 문항 원문이 들어 있어 누구나 볼 수 있으므로, 원저작자 동의 범위에 맞는지 확인해 주세요.

## 8. 테스트

결과 요약은 `TESTING.md`에 있습니다. 직접 돌려 보려면 PostgreSQL 15 이상이 필요합니다.

```bash
# 1) 빈 DB에 Supabase 흉내(역할·auth) + 스키마 적용
psql -d ydcs -f tests/supabase_stub.sql && psql -d ydcs -f supabase/schema.sql
# 2) DB 테스트 (정원 경계·동시 제출·권한·추첨)
python3 tests/test_db.py "host=... dbname=ydcs user=postgres"
# 3) 화면 테스트 (Playwright): 테스트 서버 → 화면 → 엑셀 검증
psql -d ydcs -f tests/seed_e2e.sql
python3 tests/fake_supabase.py 8790 "host=... dbname=ydcs user=postgres" &
node tests/e2e.js && python3 tests/test_excel.py
```

## 9. 실제 운영 전 점검 체크리스트

- [ ] `supabase/schema.sql` 실행 완료(오류 없음)
- [ ] Authentication에서 신규 회원가입 끔
- [ ] 관리자 계정 생성 + `survey_admins` 등록, 연락처 권한자 지정
- [ ] `js/config.js`에 Project URL·공개용 키 입력(service_role 키 아님 확인)
- [ ] GitHub Pages 주소에서 설문 첫 화면이 열림("설정이 필요합니다"가 나오지 않음)
- [ ] 휴대폰(안드로이드·아이폰 각 1대 이상)으로 처음부터 제출까지 시험 응답
- [ ] 관리자 로그인 → 대시보드 숫자 = 시험 응답 수
- [ ] ① 통계 엑셀에서 DATA·LABEL·CODE 확인, SPSS/R로 열어 보기
- [ ] 시험 응답을 무효 처리하거나, 아래 SQL로 정식 시작 전 시험 데이터 정리
      ```sql
      truncate public.survey_event_entries, public.survey_event_draws, public.survey_admin_logs,
               public.survey_submit_rejections, public.survey_rate_limits;
      delete from public.survey_responses;   -- 정식 시작 전에만!
      ```
- [ ] 단체 응답 장소가 있으면 과다 요청 한도(`rate_limit_per_hour`) 조정
- [ ] 조사 기간이 끝나면 [조사 마감] → [무작위 추첨 실행] → 당첨자 명단 다운로드
- [ ] 쿠폰 발송 완료 후 30일 이내 [휴대전화번호 파기]
- [ ] 개인정보 동의 문구·보유기간을 기관 개인정보 담당자가 최종 검토

## 10. 미완성 또는 추가 설정이 필요한 사항

- **Supabase 실제 프로젝트 연결 시험 미실시**: 테스트는 로컬 PostgreSQL 16에 Supabase 역할·Auth를 흉내 내어 진행했습니다. 실제 Supabase에서 스키마 실행·로그인·제출을 운영 전 1회 확인해야 합니다(체크리스트 참고).
- **실제 휴대폰 기기 시험 미실시**: 360px 화면의 Chromium으로 시험했습니다. 아이폰 Safari, 삼성 인터넷에서 확인이 필요합니다.
- **중복 응답의 한계**: 휴대전화번호를 남기지 않은 응답자는 같은 사람이 여러 번 응답해도 구별할 수 없습니다. 같은 기기·탭에서 제출 직후 다시 제출하는 것은 막지만, 모든 중복을 완전히 차단하지는 못합니다.
- **역채점·하위영역 점수**: 공식 채점 지침이 없어 원점수만 저장합니다.
- **Supabase 무료 요금제**: 일정 기간 접속이 없으면 프로젝트가 일시 중지될 수 있으니 조사 기간과 요금제 조건을 확인하세요.
