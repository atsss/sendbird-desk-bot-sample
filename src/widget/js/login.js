import { simplify } from './simplify.js';
import { parseDom } from './domparser.js';

import Broadcast from './broadcast.js';
import Widget from './widget.js';

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
      user.appId = localStorage.getItem(LOGIN_CACHE_KEY_APP_ID) || 'FF5F3200-5D57-4426-8AF7-A15BF140E139';
      user.userId = localStorage.getItem(LOGIN_CACHE_KEY_USER_ID) || '2025-01-07-test-user-01';
      user.nickname = localStorage.getItem(LOGIN_CACHE_KEY_NICKNAME) || '2025-01-07-test-user-01';
      console.log('Cached:', localStorage)
    }

    this.element = parseDom(`<div class='-sbd-login-background'>
          <div class='-sbd-login'>
            <div class='logo'></div>
            <div class='title'><span class='bold'>Desk Widget</span> Login</div>
            <div class='panel'>
              <div class='form form-login'>
                <div class='error'></div>
              </div>
              <div class='control'>
                <div class='login button'>Login</div>
              </div>
            </div>
          </div>
        </div>`);

    const error = simplify(this.element.querySelector('.form-login .error'));
    const login = simplify(this.element.querySelector('.control .login'));

    login.on('click', () => {
      if (user.appId && user.userId && user.nickname) {
        const options = {};
        if (caching) {
          localStorage.setItem(LOGIN_CACHE_KEY_APP_ID, user.appId);
          localStorage.setItem(LOGIN_CACHE_KEY_USER_ID, user.userId);
          localStorage.setItem(LOGIN_CACHE_KEY_NICKNAME, user.nickname);
        }
        new Widget(user, options);
        this.hide();
      } else {
        error.html('Insert app ID, user ID and name to login.');
        error.show();
      }
    });
    Broadcast.subscribe('signout', () => this.show());
    this.show();
  }
  show() {
    document.body.appendChild(this.element);
    this.element.addClass('shown');
  }
  hide() {
    this.element.removeClass('shown');
    setTimeout(() => {
      document.body.removeChild(this.element);
    }, 2000);
  }
}
window.onload = () => {
  new Login();
};
