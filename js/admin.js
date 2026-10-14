/* =========================================================
 * 관리자 페이지
 *  - 로그인: Supabase Auth (이메일 + 비밀번호)
 *  - 모든 자료는 DB 관리자 함수로만 가져오며, 서버가 권한을 다시 확인합니다.
 * ========================================================= */
window.startAdmin = function (root) {
  var S = window.SURVEY, API = window.API, X = window.EXCEL;
  var me = null, dash = null, list = [], filter = "all", shown = 50;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function say(id, text, ok) { var el = $(id); if (!el) return; el.textContent = text || ""; el.className = "msg " + (ok ? "ok" : "bad"); }
  function errText(e) {
    var m = (e && e.message) || "";
    if (e && e.status === 401 || m === "login_required") return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    var map = {
      not_admin: "관리자 권한이 없는 계정입니다.", not_pii_admin: "개인정보(연락처) 권한이 있는 관리자만 할 수 있습니다.",
      survey_still_open: "조사를 먼저 마감해야 추첨할 수 있습니다.", already_drawn: "이미 추첨했습니다. 추첨은 1회만 가능합니다.",
      reason_required: "사유를 입력해 주세요.", no_draw: "아직 추첨 기록이 없습니다.", not_found: "해당 응답을 찾을 수 없습니다.",
      "Invalid login credentials": "이메일 또는 비밀번호가 맞지 않습니다."
    };
    for (var k in map) if (m.indexOf(k) >= 0) return map[k];
    if (/fetch|network/i.test(m)) return "서버에 연결하지 못했습니다. 인터넷 연결과 config.js 설정을 확인해 주세요.";
    return "처리하지 못했습니다: " + m;
  }
  function backToSurvey() {
    if (typeof window.ADMIN_BACK === "function") window.ADMIN_BACK(); else location.href = "index.html";
  }

  /* 파일 저장: 일반 웹에서는 브라우저 다운로드, claude.ai 미리보기에서는 다운로드 기능 사용 */
  function save(file) {
    var bytes = XLSX.write(file.wb, { bookType: "xlsx", type: "array" });
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (window.claude && typeof window.claude.use === "function") {
      return window.claude.use("downloads").then(function (dl) {
        if (dl) return dl.save({ filename: file.name, data: blob });
        plain(blob, file.name);
      });
    }
    plain(blob, file.name); return Promise.resolve();
  }
  function plain(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---------- 로그인 ---------- */
  function loginView(message) {
    root.innerHTML = '<div class="admin"><div class="login">' +
      '<button class="btn" type="button" id="back" style="width:100%;margin-bottom:20px">◀ 설문 응답 화면으로 돌아가기</button>' +
      '<span class="eyebrow">관리자</span><h1>' + S.TITLE + "</h1><p class=\"note\">관리자 계정으로 로그인하세요.</p>" +
      '<form id="lf" autocomplete="on"><label for="em">이메일</label><input type="email" id="em" autocomplete="username" required>' +
      '<label for="pw">비밀번호</label><input type="password" id="pw" autocomplete="current-password" required>' +
      '<button class="btn primary" type="submit" style="width:100%;margin-top:18px">로그인</button></form>' +
      '<p class="msg bad" id="lmsg" role="alert">' + esc(message || "") + "</p></div></div>";
    $("back").onclick = backToSurvey;
    $("lf").onsubmit = function (e) {
      e.preventDefault(); say("lmsg", "확인 중…", true);
      API.signIn($("em").value.trim(), $("pw").value).then(start).catch(function (er) { say("lmsg", errText(er)); });
    };
  }

  function start() {
    root.innerHTML = '<div class="admin"><p>불러오는 중…</p></div>';
    API.adminRpc("admin_me").then(function (m) {
      me = m;
      if (!m.is_admin) {
        root.innerHTML = '<div class="admin"><div class="login"><h1>관리자 권한이 없습니다</h1><p>이 계정(' + esc(m.email) +
          ')은 관리자로 등록되어 있지 않습니다. 담당자에게 등록을 요청하세요.</p><div class="row"><button class="btn" id="out" type="button">로그아웃</button>' +
          '<button class="btn" id="back" type="button">설문 화면으로</button></div></div></div>';
        $("out").onclick = function () { API.signOut().then(function () { loginView(); }); };
        $("back").onclick = backToSurvey;
        return;
      }
      return refresh();
    }).catch(function (e) { loginView(errText(e)); });
  }

  function refresh() {
    return Promise.all([API.adminRpc("admin_dashboard"), API.adminRpc("admin_list_responses"), API.adminRpc("admin_logs", { p_limit: 30 })])
      .then(function (r) { dash = r[0]; list = r[1]; view(r[2]); })
      .catch(function (e) { if (e.status === 401) loginView(errText(e)); else alertBox(errText(e)); });
  }
  function alertBox(t) { var el = $("topmsg"); if (el) say("topmsg", t); else loginView(t); }

  /* ---------- 대시보드 ---------- */
  function quotaRows(labels, counts, limit, fullText) {
    return labels.map(function (l, k) {
      var n = counts[String(k + 1)] || 0, pct = Math.min(100, Math.round(n / limit * 100)), full = n >= limit;
      return "<tr><td>" + esc(l) + (full ? ' <span class="pill red">' + fullText + "</span>" : "") + "</td>" +
        '<td class="num">' + n + '</td><td class="num">' + limit + '</td><td class="num">' + Math.max(0, limit - n) + "</td>" +
        '<td style="width:36%"><div class="qbar" role="img" aria-label="' + esc(l) + " " + pct + '%"><i class="' + (full ? "full" : "") + '" style="width:' + pct + '%"></i></div></td></tr>';
    }).join("");
  }

  function view(logs) {
    var st = dash.settings, open = st.survey_open, pii = me.can_view_pii, ev = dash.event;
    var maxDay = Math.max.apply(null, [1].concat(dash.by_date.map(function (d) { return d.n; })));
    root.innerHTML = '<div class="admin">' +
      '<div class="bar-top"><div><span class="eyebrow">관리자</span><h1>' + S.TITLE + '</h1><span class="who">' + esc(me.email) +
      (pii ? ' · <span class="pill green">개인정보 권한</span>' : ' · <span class="pill">통계 권한</span>') + "</span></div>" +
      '<div class="row"><button class="btn" id="back" type="button">◀ 설문 응답 화면으로 돌아가기</button>' +
      '<button class="btn" id="reload" type="button">새로고침</button><button class="btn" id="out" type="button">로그아웃</button></div></div>' +
      '<p class="msg" id="topmsg" role="status"></p>' +

      '<section><div class="kpis">' +
      kpi("전체 유효 응답", dash.valid_total, "최대 " + (st.gender_limit * 2) + "명") +
      kpi("조사 상태", open ? "진행 중" : "마감", open ? "응답 접수 중" : "응답 접수 중지") +
      kpi("이벤트 추첨 대상", ev.eligible, "동의·번호 입력 " + ev.consented + "명") +
      kpi("이벤트 중복 번호", ev.duplicate, "중복 의심 응답 " + dash.duplicate_suspect + "건") +
      kpi("관리자 무효 처리", dash.invalid_total, "정원 계산에서 제외") +
      "</div></section>" +

      '<div class="cols"><section><h2>성별 완료 인원</h2><div class="scroll"><table><thead><tr><th>성별</th><th class="num">완료</th><th class="num">정원</th><th class="num">잔여</th><th>진행</th></tr></thead><tbody>' +
      quotaRows(S.Q.q2.opts, dash.gender, st.gender_limit, "응답 완료") + "</tbody></table></div></section>" +
      "<section><h2>연령별 완료 인원</h2><div class=\"scroll\"><table><thead><tr><th>연령</th><th class=\"num\">완료</th><th class=\"num\">정원</th><th class=\"num\">잔여</th><th>진행</th></tr></thead><tbody>" +
      quotaRows(S.Q.q3.opts, dash.age, st.age_limit, "응답 완료") + "</tbody></table></div></section></div>" +

      "<section><h2>일자별 응답 현황</h2>" + (dash.by_date.length ? '<div class="daybars">' + dash.by_date.map(function (d) {
        return "<div><span>" + d.date + '</span><div class="qbar"><i style="width:' + Math.round(d.n / maxDay * 100) + '%"></i></div><b class="num">' + d.n + "</b></div>";
      }).join("") + "</div>" : '<p class="note">아직 응답이 없습니다.</p>') +
      '<p class="note" style="margin-top:10px">접수되지 않은 제출: ' + (Object.keys(dash.rejections).map(function (k) { return (REJ[k] || k) + " " + dash.rejections[k] + "건"; }).join(" · ") || "없음") + "</p></section>" +

      "<section><h2>엑셀 다운로드</h2><div class=\"row\">" +
      '<button class="btn primary" id="dl1" type="button">① 통계분석용 (DATA·LABEL·CODE)</button>' +
      '<button class="btn" id="dl2" type="button">② 전체 응답 관리자료</button>' +
      '<button class="btn" id="dl3" type="button"' + (pii ? "" : " disabled title=\"개인정보 권한 필요\"") + ">③ 이벤트 참여자 명단</button>" +
      '<button class="btn" id="dl4" type="button">④ 조사 현황</button></div>' +
      '<p class="note">① 유효 완료 응답만, 개인정보 제외 · ③ 개인정보 권한이 있는 관리자만, 다운로드 이력 기록</p><p class="msg" id="dlmsg" role="status"></p></section>' +

      "<section><h2>조사 운영</h2><p>현재 상태: <b>" + (open ? "진행 중" : "마감") + "</b></p>" +
      '<button class="btn ' + (open ? "danger" : "primary") + '" id="toggle" type="button">' + (open ? "조사 마감하기" : "조사 재개하기") + "</button>" +
      '<div id="toggleBox"></div><p class="msg" id="opmsg" role="status"></p></section>' +

      "<section><h2>이벤트 추첨 (무작위 100명)</h2>" + drawHTML(pii, open) + '<p class="msg" id="drmsg" role="status"></p></section>' +

      "<section><h2>응답 관리</h2>" +
      '<div class="row" style="margin-bottom:10px"><label for="flt" class="note">보기</label><select id="flt">' +
      [["all", "전체"], ["valid", "유효"], ["invalid", "무효"], ["dup", "중복 의심"]].map(function (o) { return '<option value="' + o[0] + '"' + (filter === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
      '</select><input type="text" id="findNo" inputmode="numeric" placeholder="응답 번호(no) 찾기" aria-label="응답 번호 찾기"></div>' +
      '<div class="scroll"><table><thead><tr><th class="num">no</th><th>제출 일시</th><th>성별</th><th>연령</th><th>상태</th><th>처리</th></tr></thead><tbody id="rtbody"></tbody></table></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" id="more" type="button">더 보기</button><span class="note" id="rcount"></span></div>' +
      '<p class="msg" id="rmsg" role="status"></p></section>' +

      "<section><h2>처리 이력 (최근 30건)</h2>" + (logs.length ? '<div class="scroll"><table><thead><tr><th>일시</th><th>관리자</th><th>작업</th><th>대상</th><th>사유</th></tr></thead><tbody>' +
      logs.map(function (l) { return "<tr><td>" + esc(l.time) + "</td><td>" + esc(l.admin) + "</td><td>" + esc(ACT[l.action] || l.action) + "</td><td>" + esc(l.target) + "</td><td>" + esc(l.reason) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" : '<p class="note">기록이 없습니다.</p>') + "</section>" +

      '<p class="note">' + esc(S.COPYRIGHT) + "</p></div>";

    $("back").onclick = backToSurvey;
    $("reload").onclick = refresh;
    $("out").onclick = function () { API.signOut().then(function () { loginView(); }); };
    bindDownloads(); bindToggle(open); bindDraw(); bindList();
  }
  function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + "</div></div>"; }
  var REJ = { not_target: "대상 제외(타 구)", age: "연령 정원 마감", gender: "성별 정원 마감", age_gender: "연령·성별 정원 마감",
              closed: "조사 종료 후 제출", invalid: "형식 오류", rate_limited: "과다 요청 제한" };
  var ACT = { export_stats: "통계 엑셀 다운로드", export_all_responses: "전체 응답 관리자료 다운로드", view_event_entries: "이벤트 명단 조회",
              event_draw: "이벤트 추첨", view_draw_winners: "당첨자 명단 조회", purge_event_contacts: "연락처 파기",
              invalidate_response: "응답 무효 처리", restore_response: "응답 복구", close_survey: "조사 마감", reopen_survey: "조사 재개" };

  /* ---------- 다운로드 ---------- */
  function bindDownloads() {
    $("dl1").onclick = function () {
      say("dlmsg", "자료를 확인하는 중…", true);
      Promise.all([API.adminRpc("admin_export_responses", { p_all: false }), API.adminRpc("admin_dashboard")]).then(function (r) {
        var rows = r[0], errs = X.validate(rows, r[1].valid_total);
        if (errs.length) { say("dlmsg", "검증 실패로 다운로드를 중단했습니다: " + errs.join(" / ")); return; }
        return save(X.stats(rows)).then(function () {
          say("dlmsg", "검증 통과 · " + rows.length + "행 · 변수 " + S.STATS_VARS.length + "개 · 개인정보 없음 → 다운로드했습니다.", true);
        });
      }).catch(function (e) { say("dlmsg", errText(e)); });
    };
    $("dl2").onclick = function () {
      API.adminRpc("admin_export_responses", { p_all: true }).then(function (rows) { return save(X.all(rows)).then(function () { say("dlmsg", "전체 " + rows.length + "건을 다운로드했습니다.", true); }); })
        .catch(function (e) { say("dlmsg", errText(e)); });
    };
    $("dl3").onclick = function () {
      API.adminRpc("admin_event_entries").then(function (rows) {
        if (!rows.length) { say("dlmsg", "이벤트 참여자(남아 있는 연락처)가 없습니다."); return; }
        return save(X.event(rows)).then(function () { say("dlmsg", "이벤트 참여자 " + rows.length + "명을 다운로드했습니다. (이력 기록됨)", true); });
      }).catch(function (e) { say("dlmsg", errText(e)); });
    };
    $("dl4").onclick = function () {
      API.adminRpc("admin_dashboard").then(function (d) { return save(X.status(d)).then(function () { say("dlmsg", "조사 현황을 다운로드했습니다.", true); }); })
        .catch(function (e) { say("dlmsg", errText(e)); });
    };
  }

  /* ---------- 조사 마감·재개 ---------- */
  function bindToggle(open) {
    $("toggle").onclick = function () {
      $("toggleBox").innerHTML = '<div class="confirm"><p><b>' + (open ? "조사를 마감하면 새 응답을 받지 않습니다." : "조사를 다시 열면 응답을 받습니다.") + "</b></p>" +
        '<label for="treason" class="note">사유(선택)</label> <input type="text" id="treason" style="width:100%;max-width:420px">' +
        '<div class="row" style="margin-top:10px"><button class="btn ' + (open ? "danger" : "primary") + '" id="tok" type="button">' + (open ? "마감 확정" : "재개 확정") +
        '</button><button class="btn" id="tno" type="button">취소</button></div></div>';
      $("tno").onclick = function () { $("toggleBox").innerHTML = ""; };
      $("tok").onclick = function () {
        API.adminRpc("admin_set_open", { p_open: !open, p_reason: $("treason").value || null }).then(refresh).catch(function (e) { say("opmsg", errText(e)); });
      };
    };
  }

  /* ---------- 추첨 ---------- */
  function drawHTML(pii, open) {
    var d = dash.draw, ev = dash.event, lim = dash.settings.event_limit;
    var h = '<p class="note">대상: 개인정보 수집·이용에 동의하고 휴대전화번호를 입력한 유효 응답자. 동일 번호는 최초 유효 응답 1건만 포함. 대상이 ' + lim + "명 이하이면 전원 선정.</p>";
    if (d) {
      return h + '<table><tbody><tr><th>추첨 일시</th><td>' + esc(d.drawn_at) + "</td></tr><tr><th>추첨 당시 대상</th><td>" + d.eligible_count +
        "명</td></tr><tr><th>당첨</th><td>" + d.winner_count + "명</td></tr><tr><th>방법</th><td>" + esc(d.method) + "</td></tr></tbody></table>" +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="dlw" type="button"' + (pii ? "" : " disabled") + ">당첨자 명단 다운로드</button>" +
        '<button class="btn danger" id="purge" type="button"' + (pii ? "" : " disabled") + ">휴대전화번호 파기</button></div><div id=\"purgeBox\"></div>";
    }
    return h + "<p>현재 추첨 대상: <b>" + ev.eligible + "명</b></p>" +
      (open ? '<p class="note">조사를 마감한 뒤 추첨할 수 있습니다.</p>' : "") +
      '<button class="btn primary" id="draw" type="button"' + (open || !pii ? " disabled" : "") + ">무작위 추첨 실행</button><div id=\"drawBox\"></div>" +
      (ev.purged ? "" : '<div class="row" style="margin-top:12px"><button class="btn danger" id="purge" type="button"' + (pii ? "" : " disabled") + '>휴대전화번호 파기</button></div><div id="purgeBox"></div>');
  }
  function bindDraw() {
    if ($("draw")) $("draw").onclick = function () {
      $("drawBox").innerHTML = '<div class="confirm"><p><b>추첨은 1회만 할 수 있고 결과가 기록됩니다.</b> 대상 ' + dash.event.eligible + "명 중 최대 " + dash.settings.event_limit + "명을 무작위로 선정합니다.</p>" +
        '<div class="row"><button class="btn danger" id="dok" type="button">추첨 실행</button><button class="btn" id="dno" type="button">취소</button></div></div>';
      $("dno").onclick = function () { $("drawBox").innerHTML = ""; };
      $("dok").onclick = function () {
        $("dok").disabled = true;
        API.adminRpc("admin_draw_event").then(function (r) { say("drmsg", "추첨 완료: 대상 " + r.eligible_count + "명 중 " + r.winner_count + "명 선정", true); return refresh(); })
          .catch(function (e) { say("drmsg", errText(e)); });
      };
    };
    if ($("dlw")) $("dlw").onclick = function () {
      API.adminRpc("admin_draw_winners").then(function (w) { return save(X.winners(w)).then(function () { say("drmsg", "당첨자 " + w.winner_count + "명 명단을 다운로드했습니다. (이력 기록됨)", true); }); })
        .catch(function (e) { say("drmsg", errText(e)); });
    };
    if ($("purge")) $("purge").onclick = function () {
      $("purgeBox").innerHTML = '<div class="confirm"><p><b>모든 휴대전화번호를 지웁니다. 되돌릴 수 없습니다.</b> 쿠폰 발송이 끝났는지 확인하세요. (보유기간: 발송 완료 후 30일 이내 파기)</p>' +
        '<label for="preason" class="note">사유(필수)</label> <input type="text" id="preason" value="쿠폰 발송 완료 후 파기" style="width:100%;max-width:420px">' +
        '<div class="row" style="margin-top:10px"><button class="btn danger" id="pok" type="button">파기 확정</button><button class="btn" id="pno" type="button">취소</button></div></div>';
      $("pno").onclick = function () { $("purgeBox").innerHTML = ""; };
      $("pok").onclick = function () {
        API.adminRpc("admin_purge_event_contacts", { p_reason: $("preason").value }).then(function (r) { say("drmsg", "휴대전화번호 " + r.purged + "건을 파기했습니다.", true); return refresh(); })
          .catch(function (e) { say("drmsg", errText(e)); });
      };
    };
  }

  /* ---------- 응답 관리 ---------- */
  function filtered() {
    var no = ($("findNo") && $("findNo").value.trim()) || "";
    return list.filter(function (r) {
      if (no && String(r.no) !== no) return false;
      if (filter === "valid") return r.status === "valid";
      if (filter === "invalid") return r.status === "invalid";
      if (filter === "dup") return r.validation_status === "duplicate_suspect";
      return true;
    });
  }
  function drawRows() {
    var rows = filtered(), part = rows.slice(0, shown);
    $("rtbody").innerHTML = part.map(function (r) {
      var stt = (r.status === "valid" ? '<span class="pill green">유효</span>' : '<span class="pill red">무효</span>') +
        (r.validation_status === "duplicate_suspect" ? ' <span class="pill red">중복 의심</span>' : "") +
        (r.invalid_reason ? '<div class="note">' + esc(r.invalid_reason) + "</div>" : "");
      return "<tr><td class=\"num\">" + r.no + "</td><td>" + esc(r.submitted_at) + "</td><td>" + esc(S.Q.q2.opts[r.q2 - 1]) + "</td><td>" + esc(S.Q.q3.opts[r.q3 - 1]) + "</td><td>" + stt + "</td>" +
        '<td><button class="btn" type="button" data-no="' + r.no + '" data-to="' + (r.status === "valid" ? "invalid" : "valid") + '" style="min-height:40px">' +
        (r.status === "valid" ? "무효 처리" : "복구") + "</button></td></tr>";
    }).join("") || '<tr><td colspan="6" class="note">해당하는 응답이 없습니다.</td></tr>';
    $("rcount").textContent = rows.length + "건 중 " + Math.min(shown, rows.length) + "건 표시";
    $("more").hidden = rows.length <= shown;
    $("rtbody").querySelectorAll("button[data-no]").forEach(function (b) {
      b.onclick = function () {
        var tr = b.closest("tr"), no = b.getAttribute("data-no"), to = b.getAttribute("data-to");
        var old = document.getElementById("inl"); if (old) old.remove();
        tr.insertAdjacentHTML("afterend", '<tr id="inl"><td colspan="6"><div class="confirm"><label for="ireason"><b>no ' + no + " " + (to === "invalid" ? "무효 처리" : "복구") +
          ' 사유(필수)</b></label><br><input type="text" id="ireason" style="width:100%;max-width:480px"><div class="row" style="margin-top:8px">' +
          '<button class="btn danger" id="iok" type="button">확정</button><button class="btn" id="ino" type="button">취소</button></div></div></td></tr>');
        $("ireason").focus();
        $("ino").onclick = function () { $("inl").remove(); };
        $("iok").onclick = function () {
          API.adminRpc("admin_set_response_status", { p_no: +no, p_status: to, p_reason: $("ireason").value })
            .then(function () { return refresh().then(function () { say("rmsg", "no " + no + " 처리 완료 (정원 계산에 반영)", true); }); })
            .catch(function (e) { say("rmsg", errText(e)); });
        };
      };
    });
  }
  function bindList() {
    $("flt").onchange = function () { filter = this.value; shown = 50; drawRows(); };
    $("findNo").oninput = function () { this.value = this.value.replace(/\D/g, ""); shown = 50; drawRows(); };
    $("more").onclick = function () { shown += 50; drawRows(); };
    drawRows();
  }

  if (!API.configured()) {
    root.innerHTML = '<div class="admin"><div class="login"><h1>설정이 필요합니다</h1><p>js/config.js 에 Supabase 주소와 공개용 키를 입력해 주세요.</p></div></div>';
    return;
  }
  if (API.session()) start(); else loginView();
};
