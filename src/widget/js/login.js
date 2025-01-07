import Widget from './widget.js';

const SENDBIRD_APP_ID = 'FF5F3200-5D57-4426-8AF7-A15BF140E139';

const LOGIN_CACHE_KEY_APP_ID = 'sb-desk-appId';
const LOGIN_CACHE_KEY_USER_ID = 'sb-desk-userId';
const LOGIN_CACHE_KEY_NICKNAME = 'sb-desk-nickname';

export default class Login {
  constructor() {
    const caching = !!window.localStorage;
    const user = {
      appId: '',
      userId: '',
      nickname: ''
    };
    if (caching) {
      user.appId = localStorage.getItem(LOGIN_CACHE_KEY_APP_ID) || SENDBIRD_APP_ID;
      user.userId = localStorage.getItem(LOGIN_CACHE_KEY_USER_ID) || Date.now().toString();
      user.nickname = localStorage.getItem(LOGIN_CACHE_KEY_NICKNAME) || Date.now().toString();
      console.log('Cached:', localStorage)
    }

    if (user.appId && user.userId && user.nickname) {
      const options = {};
      if (caching) {
        localStorage.setItem(LOGIN_CACHE_KEY_APP_ID, user.appId);
        localStorage.setItem(LOGIN_CACHE_KEY_USER_ID, user.userId);
        localStorage.setItem(LOGIN_CACHE_KEY_NICKNAME, user.nickname);
      }
      new Widget(user, options);
    } else {
      console.error('Missing information to login');
    };
  }
}
window.onload = () => {
  new Login();
};
