-- =====================================================================
-- 2026년 연제구민 디지털 시민성(A-DCS) 진단 및 실태조사 — Supabase 스키마
--
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run.
--         여러 번 실행해도 안전합니다(테이블은 없을 때만 만들고, 함수·정책은 갱신).
--
-- 보안 구조
--  · 모든 테이블에 RLS(행 수준 보안)를 켜고, 일반 이용자(anon)는 테이블에 직접 접근할 수 없습니다.
--  · 일반 이용자는 함수 2개만 호출할 수 있습니다: get_survey_status(), submit_survey(...)
--  · 관리자 함수는 로그인한 사용자 중 survey_admins 에 등록된 사람만 실행할 수 있습니다.
--  · 휴대전화번호는 별도 테이블(survey_event_entries)에 두고, can_view_pii 권한이 있는
--    관리자만 조회할 수 있으며 조회·다운로드할 때마다 이력이 남습니다.
--
-- 응답 상태 정의
--  · 최종 제출 완료  : survey_responses.status = 'valid'
--  · 관리자 무효 처리: survey_responses.status = 'invalid' (원본 보존, 사유·처리자 기록)
--  · 중복 의심        : survey_responses.validation_status = 'duplicate_suspect'
--                       (이벤트 휴대전화번호가 이전 유효 응답과 같은 경우에만 판단 가능)
--  · 대상 제외(타 구) / 정원 마감으로 제출 실패 / 조사 종료 / 형식 오류 / 과다 요청
--                     : survey_submit_rejections 에 사유만 기록(응답 내용은 저장하지 않음)
--  · 작성 중          : 개인정보 최소수집 원칙에 따라 서버에 저장하지 않음
--                       (응답자 브라우저 탭 안에서만 임시 보관)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 운영 설정
-- ---------------------------------------------------------------------
create table if not exists public.survey_settings (
  id                  smallint primary key default 1 check (id = 1),
  survey_open         boolean     not null default true,
  age_limit           integer     not null default 150 check (age_limit > 0),
  gender_limit        integer     not null default 400 check (gender_limit > 0),
  event_limit         integer     not null default 100 check (event_limit > 0),
  survey_version      text        not null default '26.10.13_Ver.1',
  rate_limit_per_hour integer     not null default 60 check (rate_limit_per_hour >= 0),
  updated_at          timestamptz not null default now()
);
insert into public.survey_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. 설문 응답 (통계용, 개인정보 없음)
-- ---------------------------------------------------------------------
create table if not exists public.survey_responses (
  id                bigint generated always as identity primary key,  -- 엑셀의 no
  request_id        uuid        not null unique,                       -- 중복 제출 방지
  survey_version    text        not null,
  submitted_at      timestamptz not null default now(),
  q1 smallint not null check (q1 = 1),
  q2 smallint not null check (q2 between 1 and 2),
  q3 smallint not null check (q3 between 1 and 6),
  q4 smallint not null check (q4 between 1 and 4),
  q5 smallint not null check (q5 between 1 and 5),
  q6 smallint not null check (q6 between 1 and 5),
  q7 smallint not null check (q7 between 1 and 5),
  q8 smallint not null check (q8 between 1 and 5),
  q9 smallint not null check (q9 between 1 and 5),
  q10 smallint not null check (q10 between 1 and 5),
  q11 smallint not null check (q11 between 1 and 5),
  q12 smallint not null check (q12 between 1 and 5),
  q13 smallint not null check (q13 between 1 and 5),
  q14 smallint not null check (q14 between 1 and 5),
  q15 smallint not null check (q15 between 1 and 5),
  q16 smallint not null check (q16 between 1 and 5),
  q17 smallint not null check (q17 between 1 and 5),
  q18 smallint not null check (q18 between 1 and 5),
  q19 smallint not null check (q19 between 1 and 5),
  q20 smallint not null check (q20 between 1 and 5),
  q21 smallint not null check (q21 between 1 and 5),
  q22 smallint not null check (q22 between 1 and 5),
  q23 smallint not null check (q23 between 1 and 5),
  q24 smallint not null check (q24 between 1 and 5),
  q25 smallint not null check (q25 between 1 and 5),
  q26 smallint not null check (q26 between 1 and 5),
  q27 smallint not null check (q27 between 1 and 3),
  q28 smallint not null check (q28 between 1 and 5),
  status            text        not null default 'valid'
                    check (status in ('valid', 'invalid')),
  validation_status text        not null default 'ok'
                    check (validation_status in ('ok', 'duplicate_suspect')),
  invalid_reason    text,
  invalidated_at    timestamptz,
  invalidated_by    uuid
);
create index if not exists survey_responses_status_q2 on public.survey_responses (status, q2);
create index if not exists survey_responses_status_q3 on public.survey_responses (status, q3);

-- ---------------------------------------------------------------------
-- 3. 이벤트 참여 (개인정보, 응답과 분리)
-- ---------------------------------------------------------------------
create table if not exists public.survey_event_entries (
  id           bigint generated always as identity primary key,
  response_id  bigint      not null unique references public.survey_responses (id),
  consent      smallint    not null check (consent in (1, 2)),          -- 1=동의함, 2=동의하지 않음
  phone        text        check (phone is null or phone ~ '^010-[0-9]{3,4}-[0-9]{4}$'),
  event_status text        not null default 'entered'
               check (event_status in ('not_consented', 'entered', 'duplicate', 'winner', 'not_selected')),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,                                              -- 파기 일시
  constraint event_phone_rule check (
    (consent = 2 and phone is null) or
    (consent = 1 and (phone is not null or deleted_at is not null))
  )
);
create index if not exists survey_event_entries_phone on public.survey_event_entries (phone);

-- ---------------------------------------------------------------------
-- 4. 이벤트 추첨 기록
-- ---------------------------------------------------------------------
create table if not exists public.survey_event_draws (
  id             bigint generated always as identity primary key,
  drawn_at       timestamptz not null default now(),
  drawn_by       uuid,
  eligible_count integer     not null,
  event_limit    integer     not null,
  winner_count   integer     not null,
  method         text        not null,
  winners        jsonb       not null      -- 당첨 순서대로 [{rank, no, entry_id}]
);

-- ---------------------------------------------------------------------
-- 5. 관리자 / 처리 이력 / 제출 실패 기록 / 과다 요청 제한
-- ---------------------------------------------------------------------
create table if not exists public.survey_admins (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  can_view_pii boolean     not null default false,   -- 휴대전화번호 조회·추첨 명단 권한
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.survey_admin_logs (
  id          bigint generated always as identity primary key,
  admin_id    uuid,
  action      text        not null,
  target_id   text,
  action_time timestamptz not null default now(),
  reason      text
);

create table if not exists public.survey_submit_rejections (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reason     text        not null
             check (reason in ('not_target', 'age', 'gender', 'age_gender', 'closed', 'invalid', 'rate_limited')),
  q2         smallint,
  q3         smallint
);

create table if not exists public.survey_rate_limits (
  ip_hash      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (ip_hash, window_start)
);

-- ---------------------------------------------------------------------
-- 6. 권한: 테이블 직접 접근 차단 + RLS
-- ---------------------------------------------------------------------
alter table public.survey_settings          enable row level security;
alter table public.survey_responses         enable row level security;
alter table public.survey_event_entries     enable row level security;
alter table public.survey_event_draws       enable row level security;
alter table public.survey_admins            enable row level security;
alter table public.survey_admin_logs        enable row level security;
alter table public.survey_submit_rejections enable row level security;
alter table public.survey_rate_limits       enable row level security;

revoke all on public.survey_settings, public.survey_responses, public.survey_event_entries,
              public.survey_event_draws, public.survey_admins, public.survey_admin_logs,
              public.survey_submit_rejections, public.survey_rate_limits
       from anon, authenticated;

-- 관리자 여부 (함수와 정책에서 사용)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.survey_admins where user_id = auth.uid());
$$;

create or replace function public.is_pii_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.survey_admins where user_id = auth.uid() and can_view_pii);
$$;

-- 관리자만 읽기(쓰기·삭제 정책은 두지 않음 → 원본 임의 삭제 불가)
grant select on public.survey_settings, public.survey_responses, public.survey_event_draws,
                public.survey_admin_logs to authenticated;

drop policy if exists admin_read on public.survey_settings;
create policy admin_read on public.survey_settings   for select to authenticated using (public.is_admin());
drop policy if exists admin_read on public.survey_responses;
create policy admin_read on public.survey_responses  for select to authenticated using (public.is_admin());
drop policy if exists admin_read on public.survey_event_draws;
create policy admin_read on public.survey_event_draws for select to authenticated using (public.is_admin());
drop policy if exists admin_read on public.survey_admin_logs;
create policy admin_read on public.survey_admin_logs for select to authenticated using (public.is_admin());
-- survey_event_entries(휴대전화번호)에는 읽기 정책을 두지 않습니다.
-- 연락처는 이력이 남는 관리자 함수(admin_event_entries, admin_draw_winners)로만 조회합니다.

-- ---------------------------------------------------------------------
-- 7. 내부 도우미
-- ---------------------------------------------------------------------
create or replace function public._reject(p_reason text, p_q2 smallint, p_q3 smallint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.survey_submit_rejections (reason, q2, q3) values (p_reason, p_q2, p_q3);
  return jsonb_build_object('ok', false, 'reason', p_reason);
end $$;

create or replace function public._require_admin(p_pii boolean default false)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_pii and not public.is_pii_admin() then
    raise exception 'not_pii_admin' using errcode = '42501';
  end if;
end $$;

create or replace function public._log(p_action text, p_target text, p_reason text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.survey_admin_logs (admin_id, action, target_id, reason)
  values (auth.uid(), p_action, p_target, p_reason);
$$;

create or replace function public._kst(t timestamptz)
returns text language sql immutable as $$
  select to_char(t at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS');
$$;

-- ---------------------------------------------------------------------
-- 8. 일반 이용자용 함수
-- ---------------------------------------------------------------------

-- 정원 현황(집계 숫자만 공개)
create or replace function public.get_survey_status()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'open',         s.survey_open,
    'age_limit',    s.age_limit,
    'gender_limit', s.gender_limit,
    'gender', (select jsonb_object_agg(g::text, coalesce(c.n, 0))
                 from generate_series(1, 2) g
                 left join (select q2, count(*) n from public.survey_responses
                             where status = 'valid' group by q2) c on c.q2 = g),
    'age',    (select jsonb_object_agg(g::text, coalesce(c.n, 0))
                 from generate_series(1, 6) g
                 left join (select q3, count(*) n from public.survey_responses
                             where status = 'valid' group by q3) c on c.q3 = g)
  )
  from public.survey_settings s where s.id = 1;
$$;

-- 최종 제출: 검증 → 정원 확인 → 저장을 하나의 트랜잭션·잠금 안에서 처리
create or replace function public.submit_survey(
  p_request_id uuid,
  p_answers    jsonb,
  p_consent    smallint,
  p_phone      text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        public.survey_settings;
  a        smallint[] := array[]::smallint[];
  v        integer;
  k        integer;
  rid      bigint;
  ip       text;
  iph      text;
  hits     integer;
  age_full boolean;
  gen_full boolean;
  is_dup   boolean;
begin
  if p_request_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return public._reject('invalid', null, null);
  end if;

  -- 모든 제출을 한 줄로 세워 처리(동시 제출 시 정원 초과 방지)
  perform pg_advisory_xact_lock(74130001);

  -- 같은 요청이 다시 오면(연속 클릭·재전송) 새로 저장하지 않고 이전 결과를 돌려줌
  select id into rid from public.survey_responses where request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'no', rid, 'duplicate_request', true);
  end if;

  select * into s from public.survey_settings where id = 1;

  -- 응답값 읽기(정수만 허용)
  for k in 1..28 loop
    begin
      -- 문항이 없으면 jsonb_typeof 가 NULL 이므로 coalesce 로 반드시 거부
      if coalesce(jsonb_typeof(p_answers -> ('q' || k)), 'missing') <> 'number' then
        return public._reject('invalid', null, null);
      end if;
      v := (p_answers ->> ('q' || k))::integer;   -- 2.5 같은 소수는 여기서 오류 → 거부
    exception when others then
      return public._reject('invalid', null, null);
    end;
    if v is null then return public._reject('invalid', null, null); end if;
    a := a || v::smallint;
  end loop;

  -- 1번 거주지: 타 구(2)는 대상 제외
  if a[1] = 2 then return public._reject('not_target', null, null); end if;
  if a[1] <> 1 then return public._reject('invalid', null, null); end if;
  if a[2] not between 1 and 2 then return public._reject('invalid', null, null); end if;
  if a[3] not between 1 and 6 then return public._reject('invalid', null, null); end if;
  if a[4] not between 1 and 4 then return public._reject('invalid', null, null); end if;
  if a[5] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[6] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[7] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[8] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[9] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[10] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[11] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[12] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[13] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[14] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[15] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[16] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[17] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[18] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[19] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[20] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[21] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[22] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[23] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[24] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[25] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[26] not between 1 and 5 then return public._reject('invalid', null, null); end if;
  if a[27] not between 1 and 3 then return public._reject('invalid', null, null); end if;
  if a[28] not between 1 and 5 then return public._reject('invalid', null, null); end if;

  -- 이벤트 동의 / 휴대전화번호
  if p_consent is null or p_consent not in (1, 2) then
    return public._reject('invalid', a[2], a[3]);
  end if;
  if p_consent = 1 and (p_phone is null or p_phone !~ '^010-[0-9]{3,4}-[0-9]{4}$') then
    return public._reject('invalid', a[2], a[3]);
  end if;

  if not s.survey_open then return public._reject('closed', a[2], a[3]); end if;

  -- 과다 요청 제한(같은 접속 주소에서 1시간에 rate_limit_per_hour 건 초과 시)
  -- 접속 주소는 날짜를 섞은 해시로만 보관하고 하루가 지나면 지웁니다.
  ip := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1);
  if ip <> '' and s.rate_limit_per_hour > 0 then
    iph := encode(sha256(convert_to(trim(ip) || '|' || current_date::text, 'UTF8')), 'hex');
    delete from public.survey_rate_limits where window_start < now() - interval '1 day';
    insert into public.survey_rate_limits as r (ip_hash, window_start, hits)
    values (iph, date_trunc('hour', now()), 1)
    on conflict (ip_hash, window_start) do update set hits = r.hits + 1
    returning r.hits into hits;
    if hits > s.rate_limit_per_hour then return public._reject('rate_limited', a[2], a[3]); end if;
  end if;

  -- 정원: 연령대와 성별을 "동시에" 만족해야 접수
  select count(*) >= s.age_limit    into age_full from public.survey_responses where status = 'valid' and q3 = a[3];
  select count(*) >= s.gender_limit into gen_full from public.survey_responses where status = 'valid' and q2 = a[2];
  if age_full and gen_full then return public._reject('age_gender', a[2], a[3]); end if;
  if age_full then return public._reject('age', a[2], a[3]); end if;
  if gen_full then return public._reject('gender', a[2], a[3]); end if;

  insert into public.survey_responses (request_id, survey_version, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11, q12, q13, q14, q15, q16, q17, q18, q19, q20, q21, q22, q23, q24, q25, q26, q27, q28)
  values (p_request_id, s.survey_version, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15], a[16], a[17], a[18], a[19], a[20], a[21], a[22], a[23], a[24], a[25], a[26], a[27], a[28])
  returning id into rid;

  if p_consent = 1 then
    select exists (
      select 1 from public.survey_event_entries e
      join public.survey_responses r on r.id = e.response_id
      where e.phone = p_phone and e.deleted_at is null and r.status = 'valid' and r.id <> rid
    ) into is_dup;
    insert into public.survey_event_entries (response_id, consent, phone, event_status)
    values (rid, 1, p_phone, case when is_dup then 'duplicate' else 'entered' end);
    if is_dup then
      update public.survey_responses set validation_status = 'duplicate_suspect' where id = rid;
    end if;
  else
    insert into public.survey_event_entries (response_id, consent, phone, event_status)
    values (rid, 2, null, 'not_consented');
  end if;

  return jsonb_build_object('ok', true, 'no', rid);
end $$;

-- ---------------------------------------------------------------------
-- 9. 관리자 함수
-- ---------------------------------------------------------------------

-- 로그인한 사람의 관리자 권한
create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'is_admin',     public.is_admin(),
    'can_view_pii', public.is_pii_admin(),
    'email',        (select email from auth.users where id = auth.uid())
  );
$$;

-- 대시보드 현황(관리자 화면·조사 현황 엑셀이 같은 기준을 사용)
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  perform public._require_admin(false);
  with v as (select * from public.survey_responses where status = 'valid'),
  el as (
    select e.phone, row_number() over (partition by e.phone order by r.submitted_at, r.id) rn
    from public.survey_event_entries e join public.survey_responses r on r.id = e.response_id
    where e.consent = 1 and e.phone is not null and e.deleted_at is null and r.status = 'valid'
  )
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.survey_settings s where id = 1),
    'valid_total',   (select count(*) from v),
    'invalid_total', (select count(*) from public.survey_responses where status = 'invalid'),
    'duplicate_suspect', (select count(*) from v where validation_status = 'duplicate_suspect'),
    'gender', (select jsonb_object_agg(g::text, (select count(*) from v where q2 = g)) from generate_series(1, 2) g),
    'age',    (select jsonb_object_agg(g::text, (select count(*) from v where q3 = g)) from generate_series(1, 6) g),
    'by_date', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d)
                 from (select to_char(submitted_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') d, count(*) n
                         from v group by 1) x), '[]'::jsonb),
    'event', jsonb_build_object(
       'consented', (select count(*) from public.survey_event_entries e join v on v.id = e.response_id
                      where e.consent = 1 and e.deleted_at is null),
       'eligible',  (select count(*) from el where rn = 1),
       'duplicate', (select count(*) from el where rn > 1),
       'purged',    (select count(*) from public.survey_event_entries where deleted_at is not null)),
    'rejections', coalesce((select jsonb_object_agg(reason, n)
                    from (select reason, count(*) n from public.survey_submit_rejections group by reason) x), '{}'::jsonb),
    'draw', (select jsonb_build_object('drawn_at', public._kst(drawn_at), 'eligible_count', eligible_count,
                                       'winner_count', winner_count, 'event_limit', event_limit, 'method', method)
               from public.survey_event_draws order by id desc limit 1)
  ) into res;
  return res;
end $$;

-- 응답 목록(개인정보 없음)
create or replace function public.admin_list_responses()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'no', r.id, 'submitted_at', public._kst(r.submitted_at), 'q2', r.q2, 'q3', r.q3,
      'status', r.status, 'validation_status', r.validation_status,
      'invalid_reason', r.invalid_reason, 'invalidated_at', public._kst(r.invalidated_at)
    ) order by r.id desc)
    from public.survey_responses r), '[]'::jsonb);
end $$;

-- 엑셀용 응답 자료. p_all=false: 유효 응답만(통계용) / true: 전체 상태 포함(관리자료)
create or replace function public.admin_export_responses(p_all boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  perform public._require_admin(false);
  select coalesce(jsonb_agg(jsonb_build_object(
        'no', r.id,
        'q1', r.q1,
        'q2', r.q2,
        'q3', r.q3,
        'q4', r.q4,
        'q5', r.q5,
        'q6', r.q6,
        'q7', r.q7,
        'q8', r.q8,
        'q9', r.q9,
        'q10', r.q10,
        'q11', r.q11,
        'q12', r.q12,
        'q13', r.q13,
        'q14', r.q14,
        'q15', r.q15,
        'q16', r.q16,
        'q17', r.q17,
        'q18', r.q18,
        'q19', r.q19,
        'q20', r.q20,
        'q21', r.q21,
        'q22', r.q22,
        'q23', r.q23,
        'q24', r.q24,
        'q25', r.q25,
        'q26', r.q26,
        'q27', r.q27,
        'q28', r.q28,
        'date', public._kst(r.submitted_at),
        'status', r.status, 'validation_status', r.validation_status,
        'invalid_reason', r.invalid_reason, 'invalidated_at', public._kst(r.invalidated_at),
        'survey_version', r.survey_version
      ) order by r.id), '[]'::jsonb)
    into res
    from public.survey_responses r
   where p_all or r.status = 'valid';
  perform public._log(case when p_all then 'export_all_responses' else 'export_stats' end,
                      jsonb_array_length(res)::text || ' rows', null);
  return res;
end $$;

-- 무효 처리 / 복구 (사유 필수, 원본은 지우지 않음)
create or replace function public.admin_set_response_status(p_no bigint, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin(false);
  if p_status not in ('valid', 'invalid') then raise exception 'bad_status'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.survey_responses
     set status = p_status,
         invalid_reason = case when p_status = 'invalid' then p_reason else null end,
         invalidated_at = case when p_status = 'invalid' then now() else null end,
         invalidated_by = case when p_status = 'invalid' then auth.uid() else null end
   where id = p_no;
  if not found then raise exception 'not_found'; end if;
  perform public._log(case when p_status = 'invalid' then 'invalidate_response' else 'restore_response' end,
                      p_no::text, p_reason);
  return jsonb_build_object('ok', true);
end $$;

-- 조사 마감 / 재개
create or replace function public.admin_set_open(p_open boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin(false);
  update public.survey_settings set survey_open = p_open, updated_at = now() where id = 1;
  perform public._log(case when p_open then 'reopen_survey' else 'close_survey' end, null, p_reason);
  return jsonb_build_object('ok', true, 'open', p_open);
end $$;

-- 이벤트 참여자 명단(휴대전화번호) — 조회할 때마다 이력 기록
create or replace function public.admin_event_entries()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  perform public._require_admin(true);
  with c as (
    select e.*, r.submitted_at, r.status as response_status,
           row_number() over (partition by e.phone order by r.submitted_at, r.id) rn
      from public.survey_event_entries e join public.survey_responses r on r.id = e.response_id
     where e.consent = 1 and e.deleted_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'no', response_id, 'submitted_at', public._kst(submitted_at), 'consent', consent,
           'phone', phone, 'response_status', response_status, 'event_status', event_status,
           'eligible', (response_status = 'valid' and rn = 1)
         ) order by response_id), '[]'::jsonb)
    into res from c;
  perform public._log('view_event_entries', jsonb_array_length(res)::text || ' rows', null);
  return res;
end $$;

-- 무작위 추첨(조사 종료 후 1회). 적격자 100명 이하면 전원 선정
create or replace function public.admin_draw_event()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s       public.survey_settings;
  n_elig  integer;
  winners jsonb;
  did     bigint;
  m       text;
begin
  perform public._require_admin(true);
  perform pg_advisory_xact_lock(74130002);
  select * into s from public.survey_settings where id = 1;
  m := format('PostgreSQL gen_random_uuid()(암호학적 난수)로 추첨 대상자를 무작위 정렬한 뒤 상위 %s명 선정', s.event_limit);
  if s.survey_open then raise exception 'survey_still_open'; end if;
  if exists (select 1 from public.survey_event_draws) then raise exception 'already_drawn'; end if;

  create temp table _elig on commit drop as
  select entry_id, no from (
    select e.id entry_id, r.id no,
           row_number() over (partition by e.phone order by r.submitted_at, r.id) rn
      from public.survey_event_entries e join public.survey_responses r on r.id = e.response_id
     where e.consent = 1 and e.phone is not null and e.deleted_at is null and r.status = 'valid'
  ) x where rn = 1;
  select count(*) into n_elig from _elig;

  select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'no', no, 'entry_id', entry_id) order by rk), '[]'::jsonb)
    into winners
    from (select entry_id, no, row_number() over (order by gen_random_uuid()) rk from _elig) z
   where rk <= s.event_limit;

  update public.survey_event_entries e
     set event_status = case when e.id in (select (w ->> 'entry_id')::bigint from jsonb_array_elements(winners) w)
                             then 'winner' else 'not_selected' end
   where e.id in (select entry_id from _elig);

  insert into public.survey_event_draws (drawn_by, eligible_count, event_limit, winner_count, method, winners)
  values (auth.uid(), n_elig, s.event_limit, jsonb_array_length(winners), m, winners)
  returning id into did;

  perform public._log('event_draw', did::text,
          format('적격 %s명 중 %s명 선정', n_elig, jsonb_array_length(winners)));
  return jsonb_build_object('ok', true, 'draw_id', did, 'eligible_count', n_elig,
                            'winner_count', jsonb_array_length(winners));
end $$;

-- 당첨자 명단(휴대전화번호 포함) — 조회할 때마다 이력 기록
create or replace function public.admin_draw_winners()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.survey_event_draws; res jsonb;
begin
  perform public._require_admin(true);
  select * into d from public.survey_event_draws order by id desc limit 1;
  if not found then raise exception 'no_draw'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', (w ->> 'rank')::int, 'no', r.id, 'submitted_at', public._kst(r.submitted_at),
           'phone', e.phone) order by (w ->> 'rank')::int), '[]'::jsonb)
    into res
    from jsonb_array_elements(d.winners) w
    join public.survey_event_entries e on e.id = (w ->> 'entry_id')::bigint
    join public.survey_responses r on r.id = e.response_id;
  perform public._log('view_draw_winners', d.id::text, null);
  return jsonb_build_object(
    'draw_id', d.id, 'drawn_at', public._kst(d.drawn_at),
    'drawn_by', (select email from auth.users where id = d.drawn_by),
    'eligible_count', d.eligible_count, 'event_limit', d.event_limit,
    'winner_count', d.winner_count, 'method', d.method, 'winners', res);
end $$;

-- 휴대전화번호 파기(쿠폰 발송 완료 후 30일 이내). 추첨 기록과 응답 번호는 남김
create or replace function public.admin_purge_event_contacts(p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform public._require_admin(true);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.survey_event_entries set phone = null, deleted_at = now()
   where phone is not null;
  get diagnostics n = row_count;
  perform public._log('purge_event_contacts', n::text || ' rows', p_reason);
  return jsonb_build_object('ok', true, 'purged', n);
end $$;

-- 처리 이력
create or replace function public.admin_logs(p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
            'time', public._kst(l.action_time), 'admin', u.email, 'action', l.action,
            'target', l.target_id, 'reason', l.reason) order by l.id desc)
           from (select * from public.survey_admin_logs order by id desc limit p_limit) l
           left join auth.users u on u.id = l.admin_id), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 10. 함수 실행 권한
-- ---------------------------------------------------------------------
revoke all on function
  public.is_admin(), public.is_pii_admin(), public._reject(text, smallint, smallint),
  public._require_admin(boolean), public._log(text, text, text), public._kst(timestamptz),
  public.get_survey_status(), public.submit_survey(uuid, jsonb, smallint, text),
  public.admin_me(), public.admin_dashboard(), public.admin_list_responses(),
  public.admin_export_responses(boolean), public.admin_set_response_status(bigint, text, text),
  public.admin_set_open(boolean, text), public.admin_event_entries(), public.admin_draw_event(),
  public.admin_draw_winners(), public.admin_purge_event_contacts(text), public.admin_logs(integer)
from public, anon, authenticated;

-- 일반 이용자: 현황 조회 + 제출만
grant execute on function public.get_survey_status() to anon, authenticated;
grant execute on function public.submit_survey(uuid, jsonb, smallint, text) to anon, authenticated;

-- 로그인 사용자: 관리자 함수(함수 안에서 survey_admins 등록 여부를 다시 확인)
grant execute on function
  public.is_admin(), public.is_pii_admin(),
  public.admin_me(), public.admin_dashboard(), public.admin_list_responses(),
  public.admin_export_responses(boolean), public.admin_set_response_status(bigint, text, text),
  public.admin_set_open(boolean, text), public.admin_event_entries(), public.admin_draw_event(),
  public.admin_draw_winners(), public.admin_purge_event_contacts(text), public.admin_logs(integer)
to authenticated;

-- =====================================================================
-- 관리자 등록 (Authentication > Users 에서 관리자 계정을 만든 뒤, 이메일을 바꿔 실행)
--
--   insert into public.survey_admins (user_id, can_view_pii, note)
--   select id, true, '총괄 관리자' from auth.users where email = '관리자이메일@example.com'
--   on conflict (user_id) do update set can_view_pii = excluded.can_view_pii;
--
-- 정원·추첨 인원 변경 예시
--   update public.survey_settings set age_limit = 150, gender_limit = 400, event_limit = 100 where id = 1;
-- =====================================================================
