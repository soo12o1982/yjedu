/* =========================================================
 * 설정 — 배포 전에 이 두 값만 넣으면 됩니다.
 * Supabase 대시보드 > Project Settings > API(또는 API Keys)에서 복사합니다.
 *
 * ※ 여기에는 "공개용 키(anon / publishable)"만 넣습니다.
 *   service_role(secret) 키나 관리자 비밀번호는 절대 넣지 마세요.
 *   공개용 키로는 정원 현황 조회와 설문 제출만 할 수 있습니다(DB 함수 권한으로 제한).
 * ========================================================= */
window.SURVEY_CONFIG = {
  SUPABASE_URL: "https://fchburfkegebuofygseb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_VDsBKQwLupKLpBYU0fk2Ow_eR6GNXoX"
};
