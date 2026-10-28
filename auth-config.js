// Firebase 網頁設定（公開值，不是密碼）。專案：學習單共用的 Firebase（Google 登入與 scatjay.github.io 授權網域已設好）。
// 2026-10-28 用 Firebase Management API 新增網頁應用程式 trash-chaser 取得。
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBwPR0oE5VK0eBlqq8JY1B56UXy3R9cyng',
  authDomain: 'gen-lang-client-0929530380.firebaseapp.com',
  projectId: 'gen-lang-client-0929530380',
  appId: '1:123487216321:web:57cf78ea216afd8588aa40'
};
// 白名單：只有這些 Google 帳號（電子郵件）可以進入（前端軟性閘門；公開版若要真正擋人，要靠資料庫規則）。
window.ALLOWED_EMAILS = ['scatjay@gmail.com'];
// 全台排行榜需要 Firestore（這個專案目前沒開），先關閉；開了 Firestore 並部署規則後再改 true。
window.ENABLE_BOARD = false;
// 公開版：這些縣市的即時來源不允許網頁直連（沒有 CORS），公開版沒有桌機代抓
window.NO_LIVE = ['newtaipei'];
