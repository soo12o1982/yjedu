/* =========================================================
 * 관리자 엑셀 만들기 (SheetJS)
 *  1) 통계분석용: DATA · LABEL · CODE  (샘플 엑셀 형식, 변수명 소문자)
 *  2) 전체 응답 관리자료
 *  3) 이벤트 참여자 명단 (개인정보)
 *  4) 조사 현황
 *  5) 추첨 당첨자 명단 (개인정보)
 * ========================================================= */
window.EXCEL = (function () {
  var S = window.SURVEY;

  function today() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, "0"); };
    return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* "YYYY-MM-DD hh:mm:ss"(한국시간 문자열) → 엑셀 날짜 셀 (PC 시간대와 무관하게 같은 값) */
  function dateCell(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text || "");
    if (!m) return { t: "s", v: text || "" };
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - Date.UTC(1899, 11, 30);
    return { t: "n", v: ms / 86400000, z: "yyyy-mm-dd hh:mm:ss" };
  }

  function sheet(aoa, widths) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }

  /* ---------- 1. 통계분석용 ---------- */
  function label(v, code) {
    var d = S.Q[v]; if (!d) return code;
    var t = d.opts[code - 1];
    return t ? code + ") " + t : code;
  }

  // 다운로드 전 검사: 행 수, 변수, 코드 범위, 개인정보 혼입
  function validate(rows, expectedCount) {
    var errs = [];
    if (expectedCount != null && rows.length !== expectedCount)
      errs.push("행 수(" + rows.length + ")가 관리자 화면 유효 응답 수(" + expectedCount + ")와 다릅니다.");
    var vars = S.STATS_VARS, seen = {};
    vars.forEach(function (v) { if (seen[v]) errs.push("변수명 중복: " + v); seen[v] = 1; });
    var nos = {};
    rows.forEach(function (r, i) {
      ["phone", "consent", "agree"].forEach(function (k) { if (k in r) errs.push((i + 2) + "행에 개인정보 항목(" + k + ")이 섞여 있습니다."); });
      if (nos[r.no]) errs.push("no 중복: " + r.no); nos[r.no] = 1;
      S.QVARS.forEach(function (v) {
        var val = r[v], max = S.Q[v].opts.length;
        if (typeof val !== "number" || val % 1 !== 0 || val < 1 || val > max) errs.push((i + 2) + "행 " + v + " 값 오류(" + val + ")");
      });
      if (r.q1 !== 1) errs.push((i + 2) + "행 q1이 연제구(1)가 아닙니다.");
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.date || "")) errs.push((i + 2) + "행 date 형식 오류");
    });
    return errs.slice(0, 20);
  }

  function statsWorkbook(rows) {
    var vars = S.STATS_VARS;
    var data = [vars], lab = [vars];
    rows.forEach(function (r) {
      data.push(vars.map(function (v) { return v === "date" ? dateCell(r.date) : r[v]; }));
      lab.push(vars.map(function (v) {
        if (v === "no") return r.no;
        if (v === "date") return dateCell(r.date);
        return label(v, r[v]);
      }));
    });
    var code = [];
    S.QVARS.forEach(function (v) {
      code.push([v, S.codeTitle(v)]);
      code.push(["코드값", "보기"]);
      S.Q[v].opts.forEach(function (o, k) { code.push([k + 1, o]); });
      code.push(["", ""]);
    });
    var wb = XLSX.utils.book_new();
    var w = vars.map(function (v) { return v === "date" ? 20 : 7; });
    XLSX.utils.book_append_sheet(wb, sheet(data, w), "DATA");
    XLSX.utils.book_append_sheet(wb, sheet(lab, vars.map(function (v) { return v === "date" ? 20 : v === "no" ? 7 : 18; })), "LABEL");
    XLSX.utils.book_append_sheet(wb, sheet(code, [10, 90]), "CODE");
    return { wb: wb, name: "연제구_디지털시민성_설문응답_" + today() + ".xlsx" };
  }

  /* ---------- 2. 전체 응답 관리자료 ---------- */
  function allWorkbook(rows) {
    var head = ["no", "제출일시", "응답상태", "중복의심", "무효사유", "무효처리일시", "설문버전"].concat(S.QVARS);
    var aoa = [head].concat(rows.map(function (r) {
      return [r.no, dateCell(r.date), r.status === "valid" ? "유효" : "무효",
              r.validation_status === "duplicate_suspect" ? "중복 의심" : "", r.invalid_reason || "",
              r.invalidated_at ? dateCell(r.invalidated_at) : "", r.survey_version || ""]
        .concat(S.QVARS.map(function (v) { return r[v]; }));
    }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(aoa, [7, 20, 8, 9, 24, 20, 14].concat(S.QVARS.map(function () { return 5; }))), "전체응답");
    XLSX.utils.book_append_sheet(wb, sheet([
      ["항목", "설명"], ["응답상태", "유효=통계 포함, 무효=관리자 무효 처리(원본 보존)"],
      ["중복의심", "이벤트 휴대전화번호가 이전 유효 응답과 같은 경우 표시. 번호를 남기지 않은 응답은 중복 여부를 판단할 수 없음"],
      ["개인정보", "이 파일에는 휴대전화번호가 없습니다"]], [12, 90]), "설명");
    return { wb: wb, name: "연제구_디지털시민성_전체응답관리_" + today() + ".xlsx" };
  }

  /* ---------- 3. 이벤트 참여자 명단 ---------- */
  var EV = { entered: "추첨 대상", duplicate: "중복(제외)", winner: "당첨", not_selected: "미당첨", not_consented: "미동의" };
  function eventWorkbook(entries) {
    var aoa = [["no", "응답일시", "휴대전화번호", "개인정보 수집·이용 및 위탁 동의", "응답상태", "이벤트상태", "추첨대상"]]
      .concat(entries.map(function (e) {
        return [e.no, dateCell(e.submitted_at), e.phone, e.consent === 1 ? "1) 동의함" : "2) 동의하지 않음",
                e.response_status === "valid" ? "유효" : "무효", EV[e.event_status] || e.event_status, e.eligible ? "Y" : "N"];
      }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(aoa, [7, 20, 16, 30, 9, 11, 9]), "이벤트참여자");
    return { wb: wb, name: "연제구_디지털시민성_이벤트참여자_" + today() + ".xlsx" };
  }

  /* ---------- 4. 조사 현황 ---------- */
  var REJ = { not_target: "대상 제외(타 구)", age: "연령 정원 마감", gender: "성별 정원 마감", age_gender: "연령·성별 정원 마감",
              closed: "조사 종료 후 제출", invalid: "형식 오류", rate_limited: "과다 요청 제한" };
  function statusWorkbook(d) {
    var st = d.settings, q = [["구분", "항목", "유효 응답", "정원", "잔여"]];
    S.Q.q2.opts.forEach(function (o, k) { var n = d.gender[String(k + 1)] || 0; q.push(["성별", o, n, st.gender_limit, Math.max(0, st.gender_limit - n)]); });
    S.Q.q3.opts.forEach(function (o, k) { var n = d.age[String(k + 1)] || 0; q.push(["연령", o, n, st.age_limit, Math.max(0, st.age_limit - n)]); });
    q.push([]); q.push(["전체", "유효 응답 합계", d.valid_total, "", ""]);
    q.push(["전체", "관리자 무효 처리", d.invalid_total, "", ""]);
    q.push(["전체", "조사 상태", st.survey_open ? "진행 중" : "마감", "", ""]);
    var days = [["날짜", "유효 응답 수"]].concat(d.by_date.map(function (x) { return [x.date, x.n]; }));
    var rej = [["사유", "건수"]].concat(Object.keys(REJ).map(function (k) { return [REJ[k], d.rejections[k] || 0]; }));
    var ev = [["항목", "값"], ["동의 및 번호 입력", d.event.consented], ["추첨 대상(번호별 최초 1건)", d.event.eligible],
              ["중복 번호(제외)", d.event.duplicate], ["파기된 연락처", d.event.purged], ["추첨 인원", st.event_limit]];
    if (d.draw) ev.push(["추첨 일시", d.draw.drawn_at], ["추첨 당시 대상", d.draw.eligible_count], ["선정 인원", d.draw.winner_count]);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(q, [8, 16, 10, 8, 8]), "정원현황");
    XLSX.utils.book_append_sheet(wb, sheet(days, [12, 12]), "일자별");
    XLSX.utils.book_append_sheet(wb, sheet(rej, [22, 8]), "제출실패");
    XLSX.utils.book_append_sheet(wb, sheet(ev, [26, 20]), "이벤트");
    return { wb: wb, name: "연제구_디지털시민성_조사현황_" + today() + ".xlsx" };
  }

  /* ---------- 5. 당첨자 명단 ---------- */
  function winnersWorkbook(w) {
    var aoa = [["추첨순번", "no", "응답일시", "휴대전화번호"]].concat(w.winners.map(function (x) {
      return [x.rank, x.no, dateCell(x.submitted_at), x.phone];
    }));
    var rec = [["항목", "내용"], ["추첨 일시", w.drawn_at], ["추첨 실행자", w.drawn_by || ""],
               ["추첨 대상 인원", w.eligible_count], ["선정 기준 인원", w.event_limit], ["당첨 인원", w.winner_count],
               ["추첨 방법", w.method],
               ["대상 기준", "개인정보 수집·이용에 동의하고 휴대전화번호를 입력한 유효 응답자. 동일 번호는 최초 유효 응답 1건만 포함"]];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(aoa, [9, 7, 20, 16]), "당첨자");
    XLSX.utils.book_append_sheet(wb, sheet(rec, [16, 90]), "추첨기록");
    return { wb: wb, name: "연제구_디지털시민성_당첨자명단_" + today() + ".xlsx" };
  }

  return { validate: validate, stats: statsWorkbook, all: allWorkbook, event: eventWorkbook,
           status: statusWorkbook, winners: winnersWorkbook, dateCell: dateCell };
})();
