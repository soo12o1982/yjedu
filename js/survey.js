/* =========================================================
 * 설문 진행 (PDF 원안 순서)
 *  1 조사 안내 → 2 응답자 정보(1~4번 한 페이지) → 검사 지침
 *  → 3 A-DCS 5~26번(한 화면 1문항) → 4 평생교육 27~28번
 *  → 5 이벤트 참여(개인정보 동의) → 최종 제출 → 6 완료
 * ========================================================= */
window.startSurvey = function (main) {
  var S = window.SURVEY, API = window.API, M = S.MSG;
  var $ = function (id) { return document.getElementById(id); };

  /* 작성 중 응답은 이 브라우저 탭 안에서만 보관(sessionStorage).
     휴대전화번호는 저장하지 않습니다. */
  var ss = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  var ls = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /* ---------- 화면 순서 ---------- */
  var STEPS = [{ t: "intro" }, { t: "info" }, { t: "guide" }];
  for (var n = 5; n <= 28; n++) STEPS.push({ t: "single", v: "q" + n });
  STEPS.push({ t: "event" });
  STEPS.push({ t: "end" });
  var EVENT_I = STEPS.length - 2;

  function fresh() { return { i: 0, a: {}, consent: null, rid: uuid() }; }
  var state = ss.get("ydcs_draft") || fresh();
  if (!state.rid) state.rid = uuid();
  var phone = ["", ""];          // 메모리에만 보관
  var endView = ss.get("ydcs_end"); // 제출 완료 후 새로고침 시 완료 화면 유지
  function save() { ss.set("ydcs_draft", state); }

  /* ---------- 정원 현황 ---------- */
  var status = null;
  function loadStatus() {
    return API.rpc("get_survey_status").then(function (s) { status = s; return s; })
      .catch(function () { return status; });
  }
  var cnt = function (dim, c) { return status ? (status[dim][String(c)] || 0) : 0; };
  var ageFull = function (c) { return status ? cnt("age", c) >= status.age_limit : false; };
  var genderFull = function (c) { return status ? cnt("gender", c) >= status.gender_limit : false; };
  var allClosed = function () { return status && (!status.open || (genderFull(1) && genderFull(2))); };

  /* ---------- 글자 크기 ---------- */
  function applySize(big) {
    document.documentElement.setAttribute("data-size", big ? "large" : "");
    $("sizeBtn").textContent = big ? "글자 보통" : "글자 크게";
    $("sizeBtn").setAttribute("aria-pressed", String(big));
  }
  applySize(ls.get("ydcs_big") === true);
  $("sizeBtn").onclick = function () {
    var big = document.documentElement.getAttribute("data-size") !== "large";
    applySize(big); ls.set("ydcs_big", big);
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* 보기(라디오 버튼 + 라벨). note가 있으면 선택 불가 */
  function options(name, list, checked, noteFor) {
    return '<div class="opts">' + list.map(function (txt, k) {
      var val = k + 1, note = noteFor ? noteFor(val) : "", on = checked === val;
      var id = name + "_" + val;
      return '<label class="opt' + (on ? " on" : "") + (note ? " off" : "") + '" for="' + id + '">' +
        '<input type="radio" id="' + id + '" name="' + name + '" value="' + val + '"' + (on ? " checked" : "") + (note ? " disabled" : "") + ">" +
        '<span class="n" aria-hidden="true">' + val + "</span>" +
        '<span class="t">' + esc(txt) + (note ? "<small>(" + esc(note) + ")</small>" : "") + "</span>" +
        '<span class="ck" aria-hidden="true">✓</span></label>';
    }).join("") + "</div>";
  }

  function answered() { return S.QVARS.filter(function (v) { return state.a[v]; }).length; }

  /* ---------- 그리기 ---------- */
  function render() {
    var s = STEPS[state.i];
    var top = s.t !== "intro" && s.t !== "end";
    $("top").hidden = !top; $("nav").hidden = s.t === "end";
    if (top) {
      var sec, count;
      if (s.t === "info") { sec = S.SECTIONS.info; count = "<b>1~4</b> / 28 문항"; }
      else if (s.t === "guide") { sec = S.SECTIONS.adcs; count = "검사 지침"; }
      else if (s.t === "event") { sec = "마지막 단계"; count = "이벤트 참여 안내"; }
      else { var d = S.Q[s.v]; sec = S.SECTIONS[d.sec]; count = "<b>" + d.no + "</b> / 28 문항"; }
      var pct = s.t === "event" ? 100 : Math.round(answered() / 28 * 100);
      $("sec").textContent = sec;
      $("count").innerHTML = count + "<small>진행률 " + pct + "%</small>";
      $("barFill").style.width = pct + "%";
      $("bar").setAttribute("aria-valuenow", pct);
      $("bar").setAttribute("aria-label", "설문 진행률 " + pct + "%");
    }
    var prev = $("prevBtn"), next = $("nextBtn");
    prev.hidden = s.t === "intro";
    $("navIn").classList.toggle("single", prev.hidden);
    next.disabled = false;
    next.textContent = s.t === "intro" ? "설문 시작하기" : s.t === "event" ? "최종 제출하기 ✓" : "다음 ▶";

    var h = "";
    if (s.t === "intro") h = introHTML();
    else if (s.t === "info") h = infoHTML();
    else if (s.t === "guide") h = guideHTML();
    else if (s.t === "single") h = singleHTML(s.v);
    else if (s.t === "event") h = eventHTML();
    else if (s.t === "end") h = endView || "";
    main.innerHTML = h + '<p class="err" id="err" role="alert"></p>';
    bind(s);
    if (s.t === "intro" && allClosed()) showEnd(closedHTML(), true);
    window.scrollTo(0, 0);
  }

  function introHTML() {
    return '<span class="badge">2026 연제구 설문조사</span>' +
      "<h1>" + S.TITLE + "</h1>" +
      "<p>안녕하십니까?</p>" +
      "<p>본 조사는 연제구민의 디지털 환경에서의 시민성 역량과 인식 수준을 종합적으로 진단하고, 디지털 기술 활용 능력뿐만 아니라 책임감 있는 행동, 타인과의 소통·공감, 주체적 참여 역량 등을 파악하기 위해 실시합니다.</p>" +
      "<p>조사 결과는 구민의 디지털 시민성 수준과 영역별 강점 및 개선 필요 사항을 분석하여, 연제구민의 특성과 수요에 맞는 디지털 평생교육 정책 수립 및 맞춤형 교육 프로그램 개발을 위한 기초 자료로 활용하고자 합니다.</p>" +
      "<p>응답하신 내용은 개인정보 보호법 제15조(개인정보 수집·이용)와 제18조(개인정보의 목적 외 이용·제공제한)에 의해 비밀이 철저히 보장되며, 통계작성 이외의 다른 목적으로 사용되지 않습니다. 바쁘시더라도 구민 여러분의 적극적인 협조를 부탁드립니다.</p>" +
      '<div class="card"><dl class="kv">' +
      "<dt>조사대상</dt><dd>연제구민</dd>" +
      "<dt>참여안내</dt><dd>총 28문항입니다. 한 화면에 한 문항씩 나오며, 화면 아래 <b>이전 / 다음</b> 버튼으로 이동합니다. 글씨가 작으면 오른쪽 위 <b>글자 크게</b>를 누르세요.</dd>" +
      "<dt>주관기관</dt><dd>연제구청 평생교육과</dd>" +
      "<dt>수행기관</dt><dd>㈜글로벌리더코리아</dd>" +
      '<dt>문의</dt><dd><span class="tel">051-665-4505</span></dd></dl></div>' +
      '<div class="copyright"><p class="c1">' + esc(S.COPYRIGHT) + '</p><p class="c2">' + esc(S.COPYRIGHT_NOTE) + "</p></div>";
  }

  function infoHTML() {
    var a = state.a;
    if (a.q2 && genderFull(a.q2)) delete a.q2;       // 이어하기 중 마감된 보기는 해제
    if (a.q3 && ageFull(a.q3)) delete a.q3;
    var out = a.q1 === 2;
    function block(v, noteFor) {
      var d = S.Q[v];
      return '<fieldset class="q info-q" id="f_' + v + '"><legend>' + d.no + ". " + esc(d.title) + "</legend>" +
        options(v, d.opts, a[v], noteFor) + "</fieldset>";
    }
    return '<span class="eyebrow">' + S.SECTIONS.info + "</span>" +
      '<p class="hint">아래 4개 문항에 모두 답한 뒤 <b>다음</b>을 눌러 주세요.</p>' +
      block("q1").replace("</fieldset>",
        '<div class="alert" id="outAlert" role="alert"' + (out ? "" : " hidden") + "><strong>⚠ " + M.outside[0] + "</strong>" +
        "<p>" + M.outside[1] + "</p><p>" + M.outside[2] + "</p></div></fieldset>") +
      '<fieldset class="rest" id="restFs"' + (out ? " disabled" : "") + ">" +
      block("q2", function (c) { return genderFull(c) ? M.genderFullOpt : ""; }) +
      block("q3", function (c) { return ageFull(c) ? M.ageFullOpt : ""; }) +
      block("q4") + "</fieldset>";
  }

  function guideHTML() {
    return '<span class="eyebrow">' + S.SECTIONS.adcs + '</span><h1>검사 지침</h1><dl class="guide">' +
      "<dt>□ 지침</dt><dd>다음 문항은 귀하가 일상적인 디지털 환경에서 느끼거나 실제로 행동하는 정도를 묻는 질문입니다.</dd>" +
      "<dt>□ 응답방식</dt><dd>각 문항을 신중하게 읽고, 귀하의 생각이나 행동에 가장 가까운 정도를 해당 번호(①, ②, ③, ④, ⑤)에 체크해 주세요.</dd>" +
      '<dt>□ 응답척도</dt><dd><ul class="scale-list">' +
      S.LIKERT.map(function (l, k) { return '<li><span class="n">' + (k + 1) + "</span>" + l + "</li>"; }).join("") + "</ul></dd>" +
      "<dt>□ 유의사항</dt><dd>정답은 없으며, 모든 문항에 빠짐없이 솔직하게 응답해 주세요.</dd></dl>";
  }

  function singleHTML(v) {
    var d = S.Q[v];
    return '<fieldset class="q"><legend><span class="qno">' + d.no + (d.head ? ". " + d.head : "번") + "</span>" + esc(d.title) + "</legend>" +
      options(v, d.opts, state.a[v]) + "</fieldset>";
  }

  function eventHTML() {
    var c = state.consent;
    return '<span class="eyebrow">이벤트 참여</span>' +
      '<h1>■ 개인정보 수집·이용 및 위탁 동의 안내</h1>' +
      '<div class="card"><ul class="consent-list">' +
      "<li><b>· 수집항목:</b> 휴대전화번호</li>" +
      "<li><b>· 이용목적:</b> 설문 참여 확인 및 모바일 커피쿠폰 발송</li>" +
      "<li><b>· 보유기간:</b> 쿠폰 발송 완료 후 30일 이내 파기</li>" +
      "<li><b>· 처리위탁:</b> ㈜글로벌리더코리아(설문조사 운영 및 쿠폰 발송)</li>" +
      "<li><b>· 동의거부:</b> 미동의 시에도 설문 참여 가능하나 쿠폰 지급 제외</li></ul></div>" +
      '<fieldset class="q"><legend>■ 개인정보 수집·이용에 동의하십니까?</legend>' +
      options("consent", ["동의함", "동의하지 않음"], c) + "</fieldset>" +
      '<div id="phoneBox"' + (c === 1 ? "" : " hidden") + ' style="margin-top:20px">' +
      '<p style="font-weight:800;margin-bottom:8px" id="phLabel">휴대전화번호</p>' +
      '<div class="phone-row" role="group" aria-labelledby="phLabel"><span>010</span>-' +
      '<input id="ph1" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="휴대전화번호 가운데 자리(3~4자리)" value="' + esc(phone[0]) + '">-' +
      '<input id="ph2" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="휴대전화번호 끝 자리(4자리)" value="' + esc(phone[1]) + '"></div></div>' +
      '<p class="notice">' + esc(M.eventNotice) + "</p>";
  }

  function endHTML() {
    return '<div class="end"><div class="mark" aria-hidden="true">✓</div><h1>' + esc(M.thanks) + "</h1>" +
      "<p>설문이 정상적으로 제출되었습니다.</p>" +
      '<p class="hint">문의: 연제구청 평생교육과 · <span class="tel">051-665-4505</span></p></div>';
  }
  function stopHTML(lines, title) {
    if (title) {   // 정원 마감: 짧은 제목 + 안내 문구(원문 그대로)
      return '<div class="end"><div class="mark stop" aria-hidden="true">!</div><h1>' + esc(title) + "</h1>" +
        lines.map(function (l) { return '<p class="lead">' + esc(l) + "</p>"; }).join("") + "</div>";
    }
    return '<div class="end"><div class="mark stop" aria-hidden="true">!</div>' +
      lines.map(function (l, k) { return k === 0 ? "<h1>" + esc(l) + "</h1>" : "<p>" + esc(l) + "</p>"; }).join("") + "</div>";
  }
  function closedHTML() { return stopHTML(M.surveyClosed); }

  /* keepDraft=true: 조사 마감 안내처럼 응답이 접수되지 않은 경우(작성 내용 유지, 새로고침 시 다시 확인) */
  function showEnd(html, keepDraft) {
    endView = html;
    if (!keepDraft) { ss.set("ydcs_end", html); ss.del("ydcs_draft"); phone = ["", ""]; }
    state.i = STEPS.length - 1;
    render();
  }

  /* ---------- 동작 연결 ---------- */
  function bind(s) {
    main.querySelectorAll('.opt input[type="radio"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        var name = inp.name, val = +inp.value;
        main.querySelectorAll('input[name="' + name + '"]').forEach(function (x) { x.closest(".opt").classList.toggle("on", x.checked); });
        var f = inp.closest(".info-q"); if (f) f.classList.remove("need");
        $("err").textContent = "";
        if (name === "consent") {
          state.consent = val;
          $("phoneBox").hidden = val !== 1;
          if (val === 1) setTimeout(function () { var p = $("ph1"); if (p && !p.value) p.focus(); }, 60);
        } else {
          state.a[name] = val;
        }
        if (name === "q1") {
          $("outAlert").hidden = val !== 2;
          $("restFs").disabled = val === 2;
          if (val === 2) $("outAlert").scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (s.t === "single") { var pct = Math.round(answered() / 28 * 100); $("barFill").style.width = pct + "%"; $("count").querySelector("small").textContent = "진행률 " + pct + "%"; }
        save();
      });
      inp.addEventListener("focus", function () { inp.closest(".opt").classList.add("focus"); });
      inp.addEventListener("blur", function () { inp.closest(".opt").classList.remove("focus"); });
    });
    if (s.t === "event") {
      ["ph1", "ph2"].forEach(function (id, k) {
        var el = $(id);
        el.addEventListener("input", function () {
          var clean = el.value.replace(/\D/g, "");
          if (clean !== el.value) { el.value = clean; $("err").textContent = "휴대전화번호는 숫자만 입력할 수 있습니다."; }
          else $("err").textContent = "";
          phone[k] = clean; el.classList.remove("bad");
          if (k === 0 && clean.length === 4) $("ph2").focus();
        });
      });
    }
  }

  function check(s) {
    var a = state.a;
    if (s.t === "info") {
      if (a.q1 === 2) return M.outside[1];
      var miss = ["q1", "q2", "q3", "q4"].filter(function (v) { return !a[v]; });
      if (miss.length) {
        miss.forEach(function (v) { $("f_" + v).classList.add("need"); });
        $("f_" + miss[0]).scrollIntoView({ behavior: "smooth", block: "start" });
        return miss.map(function (v) { return v.slice(1) + "번"; }).join(", ") + " 문항에 답해 주세요.";
      }
    }
    if (s.t === "single" && !a[s.v]) return "보기 중 하나를 선택해 주세요.";
    if (s.t === "event") {
      if (!state.consent) return "개인정보 수집·이용 동의 여부를 선택해 주세요.";
      if (state.consent === 1) {
        if (phone[0].length < 3) { $("ph1").classList.add("bad"); $("ph1").focus(); return "휴대전화번호 가운데 자리(3~4자리)를 입력해 주세요."; }
        if (phone[1].length !== 4) { $("ph2").classList.add("bad"); $("ph2").focus(); return "휴대전화번호 끝 자리 4자리를 입력해 주세요."; }
      }
    }
    return "";
  }

  function go(i) {
    state.i = i; save();
    try { history.pushState({ ydcs: i }, ""); } catch (e) {}
    render();
  }

  $("prevBtn").onclick = function () { if (state.i > 0) go(state.i - 1); };
  $("nextBtn").onclick = function () {
    var s = STEPS[state.i];
    var msg = check(s);
    if (msg) { $("err").textContent = msg; if (s.t !== "info") $("err").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (s.t === "intro") {
      var b = $("nextBtn"); b.disabled = true;
      loadStatus().then(function () { if (allClosed()) showEnd(closedHTML(), true); else go(1); });
      return;
    }
    if (s.t === "event") { submit(); return; }
    go(state.i + 1);
  };
  window.addEventListener("popstate", function (e) {
    if (e.state && typeof e.state.ydcs === "number" && STEPS[state.i].t !== "end") { state.i = e.state.ydcs; save(); render(); }
  });

  /* ---------- 최종 제출 ---------- */
  function submit() {
    var btn = $("nextBtn"); btn.disabled = true; btn.textContent = "제출 중…";
    var answers = {};
    S.QVARS.forEach(function (v) { answers[v] = state.a[v]; });
    API.rpc("submit_survey", {
      p_request_id: state.rid,
      p_answers: answers,
      p_consent: state.consent,
      p_phone: state.consent === 1 ? "010-" + phone[0] + "-" + phone[1] : null
    }).then(function (r) {
      if (r && r.ok) return showEnd(endHTML());
      var why = r && r.reason;
      if (why === "age") return showEnd(stopHTML([M.ageClosed], "설문 참여 마감 안내"));
      if (why === "gender") return showEnd(stopHTML([M.genderClosed], "설문 참여 마감 안내"));
      if (why === "age_gender") return showEnd(stopHTML([M.ageClosed, M.genderClosed], "설문 참여 마감 안내"));
      if (why === "closed") return showEnd(closedHTML());
      if (why === "not_target") return showEnd(stopHTML(M.outside));
      if (why === "rate_limited") throw new Error("잠시 후 다시 제출해 주세요. 같은 장소에서 짧은 시간에 많은 제출이 있었습니다.");
      throw new Error("응답 내용을 확인할 수 없어 제출되지 않았습니다. 이전 화면에서 답을 다시 확인해 주세요.");
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "다시 제출하기 ✓";
      var m = e && e.message && !/fetch|network|HTTP|Failed/i.test(e.message) ? e.message
        : "인터넷 연결이 불안정해 제출되지 않았습니다. 응답은 그대로 남아 있으니 [다시 제출하기]를 눌러 주세요.";
      $("err").textContent = m;
    });
  }

  /* ---------- 시작 ---------- */
  if (!API.configured()) {
    $("top").hidden = true; $("nav").hidden = true;
    main.innerHTML = '<div class="end"><div class="mark stop">!</div><h1>설정이 필요합니다</h1><p>js/config.js 에 Supabase 주소와 공개용 키를 입력해 주세요.</p></div>';
    return;
  }
  if (endView) { state.i = STEPS.length - 1; }
  try { history.replaceState({ ydcs: state.i }, ""); } catch (e) {}
  render();
  loadStatus().then(function () {
    var t = STEPS[state.i].t;
    if (t === "intro" || t === "info") render();
  });
};
