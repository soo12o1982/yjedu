/* =========================================================
 * Supabase 연결 (별도 라이브러리 없이 REST 호출)
 *  - rpc(): DB 함수 호출 (/rest/v1/rpc/<함수명>)
 *  - 관리자 로그인: Supabase Auth (/auth/v1/token)
 * ========================================================= */
window.API = (function () {
  var C = window.SURVEY_CONFIG || {};
  var base = function () { return String(C.SUPABASE_URL || "").replace(/\/+$/, ""); };

  function configured() { return !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY); }

  function request(path, body, token) {
    var headers = { "apikey": C.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(base() + path, { method: "POST", headers: headers, body: JSON.stringify(body || {}) })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          if (!res.ok) {
            var err = new Error((data && (data.message || data.msg || data.error_description || data.error)) || ("HTTP " + res.status));
            err.status = res.status; err.code = data && data.code; err.body = data;
            throw err;
          }
          return data;
        });
      });
  }

  /* ---- 관리자 세션 (브라우저 탭을 닫으면 사라지는 sessionStorage 사용) ---- */
  var KEY = "ydcs_admin_session";
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }
  function saveSession(s) {
    try {
      if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY);
    } catch (e) {}
  }
  function toSession(d) {
    return { access_token: d.access_token, refresh_token: d.refresh_token,
             expires_at: Date.now() + ((d.expires_in || 3600) * 1000), email: d.user && d.user.email };
  }
  function signIn(email, password) {
    return request("/auth/v1/token?grant_type=password", { email: email, password: password })
      .then(function (d) { var s = toSession(d); saveSession(s); return s; });
  }
  function validToken() {
    var s = loadSession();
    if (!s) return Promise.resolve(null);
    if (Date.now() < s.expires_at - 60000) return Promise.resolve(s.access_token);
    return request("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token })
      .then(function (d) { var n = toSession(d); n.email = n.email || s.email; saveSession(n); return n.access_token; })
      .catch(function () { saveSession(null); return null; });
  }
  function signOut() {
    var s = loadSession(); saveSession(null);
    if (s) return request("/auth/v1/logout", {}, s.access_token).catch(function () {});
    return Promise.resolve();
  }

  return {
    configured: configured,
    rpc: function (fn, args) { return request("/rest/v1/rpc/" + fn, args); },          // 일반 이용자
    adminRpc: function (fn, args) {                                                      // 관리자
      return validToken().then(function (t) {
        if (!t) { var e = new Error("login_required"); e.status = 401; throw e; }
        return request("/rest/v1/rpc/" + fn, args, t);
      });
    },
    signIn: signIn, signOut: signOut, session: loadSession
  };
})();
