import { parseDom } from '../domparser.js';

const BOT_ICON_URL = 'https://file-eu-1.sendbird.com/profile_images/751cdd171b2344bd871a38c5c12f2b41.png';

export default class ThinkingIndicator {
  constructor() {
    this.attachCount = 0;
    this.element = parseDom(`<div class='-sbd-message-item'>
            <div class='profile'>
                <img src='${BOT_ICON_URL}' alt='Profile' class='image'></img>
            </div>
            <div class='content'>
              <div class='message'>
                <div id="bot-thinking">
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                </div>
              </div>
            </div>
        </div>`);
  }
  isAttached() {
    return !!this.element.parentNode;
  }
  attachTo(elem) {
    this.attachCount++;
    if (!this.isAttached()) elem.appendChild(this.element);
  }
  detach() {
    if (this.attachCount <= 0) return;

    this.attachCount--;
    if (this.isAttached() && this.attachCount === 0) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
