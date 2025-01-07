import SendBirdDesk from 'sendbird-desk';
import { simplify } from '../simplify.js';
import { parseDom } from '../domparser.js';
import Spinner from './spinner.js';
import MessageElement from './message.js';
import { MessageCollectionInitPolicy, MessageFilter } from '@sendbird/chat/groupChannel';

const MESSAGE_LIMIT = 20;
const RECENT_MESSAGE_THRESHOLD = 60; // sec
const DEFAULT_PLACEHOLDER = 'Write a message...';
const DEFAULT_PLACEHOLDER_DISABLED = '';

export default class Dialog {
  constructor(ticket) {
    this.ticket = ticket;
    this.element = parseDom(`<div class='-sbd-dialog'>
            <div class='-sbd-message-list'>
            </div>
            <div class='-custom-suggested-question-list'>
              <ul class='-custom-options'>
                <li class='-custom-option'>What's Moment?</li>
                <li class='-custom-option'>How much is Moment for a month?</li>
              </ul>
            </div>
            <form class="-sbd-message-form">
                <textarea class="message" placeholder="${DEFAULT_PLACEHOLDER}" maxlength="500" rows="1"></textarea>
                <button class="button">Submit</button>
            </form>
        </div>`);
    this.isOpened = false;

    this.messageList = simplify(this.element.querySelector('.-sbd-message-list'));
    this.messageElementList = [];
    this.collisionSet = new Set();

    this.spinner = new Spinner();
    this.messageRevision = 0;

    this.isLoading = false;
    this.messageList.on('scroll', e => {
      if (!this.isLoading && this.query.hasPrevious && this.isTop()) {
        this.isLoading = true;
        const lastRevision = this.messageRevision;
        this.loadMessage(true, (res, err) => {
          if (!err) {
            if (this.messageRevision === lastRevision) {
              const messages = res;
              for (let i in messages) {
                const message = messages[i];
                if (MessageElement.isVisible(message)) {
                  this.prependMessage(message);
                }
              }
            }
          }
          this.isLoading = false;
        });
        e.preventDefault();
        e.stopPropagation();
      }
    });

    this.form = simplify(this.element.querySelector('.-sbd-message-form'));
    this.input = simplify(this.form.querySelector('.message'));
    this.button = simplify(this.form.querySelector('.button'));
    console.log(this.button)
    this.editable = true;
    // Customize for suggested questions
    this.optionList = simplify(this.element.querySelector('.-custom-suggested-question-list'));
    this.options = simplify(this.element.querySelectorAll('.-custom-option'));

    if (ticket.status === SendBirdDesk.Ticket.Status.CLOSED) {
      this.disableForm();
    }

    this.button.on('click', e => {
      e.preventDefault();
      const text = this.input.val();
      this.input.val('');

      this.optionList.fadeOut();

      if (text && this.editable) {
        if (this.ticket.status === SendBirdDesk.Ticket.Status.INITIALIZED) {
          this.ticket.status = SendBirdDesk.Ticket.Status.UNASSIGNED;
        }
        const message = {
          message: text,
        };
        this.ticket.channel
          .sendUserMessage(message)
          // .onPending((message) => {
          // })
          .onSucceeded((message) => {
            if (SendBirdDesk.Message.UrlRegExp.test(message.message)) {
              message.url = SendBirdDesk.Message.UrlRegExp.exec(message.message)[0];
              SendBirdDesk.Ticket.getUrlPreview(message.url, (res, err) => {
                if (err) throw err;
                this.ticket.channel.updateUserMessage(
                  message.messageId,
                  message.message,
                  JSON.stringify({
                    type: SendBirdDesk.Message.DataType.URL_PREVIEW,
                    body: {
                      url: message.url,
                      site_name: res.data.siteName,
                      title: res.data.title,
                      description: res.data.description,
                      image: res.data.image
                    }
                  }),
                  message.customType,
                  (res, err) => {
                    if (err) throw err;
                    this.updateMessage(res);
                  }
                );
              });
            }
            this.appendMessage(message);
            this.scrollToBottom();
          })
          .onFailed((error, message) => {
            this.ticket.status = SendBirdDesk.Ticket.Status.INITIALIZED;
          });
      }
    });

    // Customize for suggested questions
    this.options.forEach(option => {
      option.on('click', e => {
        this.optionList.fadeOut();
        console.log(e.target, e.target.innerText)
        if (this.ticket.status === SendBirdDesk.Ticket.Status.INITIALIZED) {
          this.ticket.status = SendBirdDesk.Ticket.Status.UNASSIGNED;
        }
        const message = {
          message: e.target.innerText,
        };
        this.ticket.channel
          .sendUserMessage(message)
          // .onPending((message) => {
          // })
          .onSucceeded((message) => {
            this.appendMessage(message);
            this.scrollToBottom();
          })
          .onFailed((error, message) => {
            this.ticket.status = SendBirdDesk.Ticket.Status.INITIALIZED;
          });
      })
    })
  }
  loadMessage(next, callback) {
    if (!this.query || !next) {
      const filter = new MessageFilter();
      const limit = MESSAGE_LIMIT;
      const startingPoint = Date.now();
      const collection = this.ticket.channel.createMessageCollection({
        filter,
        limit,
        startingPoint,
      });

      collection.initialize(MessageCollectionInitPolicy.CACHE_AND_REPLACE_BY_API)
        .onCacheResult((err, messages) => {
          // Messages are retrieved from the local cache.
          // They might be too outdated or far from the startingPoint.
        })
        .onApiResult((err, messages) => {
          // Messages are retrieved from the Sendbird server through API.
          // According to MessageCollectionInitPolicy.CACHE_AND_REPLACE_BY_API,
          // the existing data source needs to be cleared
          // before adding retrieved messages to the local cache.
        });

      this.query = collection;
      this.clearMessage();
    }
    this.query.loadPrevious().then((res) => {
      callback(res, false);
    }).catch((err) => {
      callback(null, err);
    });
  }
  open(widget) {
    if (widget) {
      this.isOpened = true;
      this.widget = widget;
      this.widget.panel.appendChild(this.element);
      this.element.addClass('opened');

      this.ticket.channel.markAsRead();
      this.spinner.attachTo(this.messageList);
      this.messageRevision++;

      const lastRevision = this.messageRevision;
      this.loadMessage(false, (res, err) => {
        if (!err) {
          if (this.messageRevision === lastRevision) {
            const messages = res;
            for (let i in messages) {
              const message = messages[i];
              if (MessageElement.isVisible(message)) {
                this.prependMessage(message);
              }
            }
            this.scrollToBottom();
          }
        }
        this.spinner.detach();
      });
    }
  }
  enableForm() {
    this.editable = true;
    this.form.removeClass('disabled');
    this.input.attr('readonly', '');
    this.input.attr('placeholder', DEFAULT_PLACEHOLDER);
  }
  disableForm() {
    this.editable = false;
    this.form.addClass('disabled');
    this.input.attr('readonly', 'readonly');
    this.input.attr('placeholder', DEFAULT_PLACEHOLDER_DISABLED);
  }
  isMessageStreak(recent, adjacent) {
    return (
      ((!recent.sender && !adjacent.sender) ||
        (recent.sender && adjacent.sender && recent.sender.userId === adjacent.sender.userId)) &&
      Math.round((recent.createdAt - adjacent.createdAt) / 1000) < RECENT_MESSAGE_THRESHOLD
    );
  }
  prependMessage(message) {
    if (!this.collisionSet.has(message.messageId)) {
      this.collisionSet.add(message.messageId);

      let streak = false;
      if (this.messageElementList.length > 0) {
        let firstNonStreak = null;
        for (let i in this.messageElementList) {
          const messageElement = this.messageElementList[i];
          if (!messageElement.streak) {
            firstNonStreak = messageElement;
            break;
          }
        }
        if (firstNonStreak) {
          streak = this.isMessageStreak(firstNonStreak.message, message);
        }
      }

      const wm = new MessageElement(message, streak);
      wm.addTicket(this.ticket);
      this.messageElementList.unshift(wm);
      if (this.messageList.firstChild) {
        this.messageList.insertBefore(wm.element, this.messageList.firstChild);
      } else this.messageList.appendChild(wm.element);
    }
  }
  appendMessage(message) {
    if (!this.collisionSet.has(message.messageId)) {
      this.collisionSet.add(message.messageId);

      if (this.messageElementList.length > 0) {
        const lastNonStreak = this.messageElementList[this.messageElementList.length - 1];
        const streak = this.isMessageStreak(message, lastNonStreak.message);
        if (streak) {
          lastNonStreak.streak = true;
          lastNonStreak.render();
        }
      }

      const wasBottom = this.isBottom();
      const wm = new MessageElement(message);
      wm.addTicket(this.ticket);
      this.messageElementList.push(wm);
      this.messageList.appendChild(wm.element);
      if (!this.spinner.isAttached() && wasBottom) {
        this.scrollToBottom();
      }
    }
  }
  updateMessage(message) {
    for (let i in this.messageElementList) {
      const messageElement = this.messageElementList[i];
      if (messageElement.message.messageId === message.messageId) {
        messageElement.message = message;
        messageElement.render();
        break;
      }
    }
  }
  clearMessage() {
    this.collisionSet = new Set();
    this.messageList.removeAll('-sbd-message-item');
    this.messageElementList = [];
  }
  isTop() {
    return this.messageList.scrollTop === 0;
  }
  isBottom() {
    return this.messageList.scrollHeight - this.messageList.scrollTop === this.messageList.clientHeight;
  }
  scrollToBottom() {
    this.messageList.scrollTo(0, this.messageList.scrollHeight);
  }
}
