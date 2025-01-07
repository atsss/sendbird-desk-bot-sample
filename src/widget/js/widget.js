import SendBird, { ConnectionHandler } from '@sendbird/chat';
import { GroupChannelHandler, GroupChannelModule } from '@sendbird/chat/groupChannel';
import SendBirdDesk from 'sendbird-desk';

import { simplify } from './simplify.js';
import { parseDom } from './domparser.js';
import Broadcast from './broadcast.js';

import Dialog from './component/dialog.js';
import Spinner from './component/spinner.js';
import TicketElement from './component/ticket.js';
import MessageElement from './component/message.js';
import NotificationElement from './component/notification.js';
import { setSb } from './globalStore.js';

/** Default settings
 */
const connectionError = 'Cannot connect to internet.';

const DEBUG = false;

export default class Widget {
  constructor(user, options) {
    /** Build UI elements
     */
    this.element = document.getElementById('sb-desk');
    this.element.className = '-sbd-widget';
    if (!options) options = {};

    Widget.panel = this.panel = parseDom(`<div class='-sbd-panel'>
            <div class='-sbd-header'>
                <div class='-sbd-title'>Inbox</div>
            </div>
            <div class='-sbd-ticket-list'>
                <div class='-sbd-ticket-new'>
                    <div class='icon'></div>
                    <div class='label'>Start a new conversation.</div>
                </div>
            </div>
            <div class='-sbd-error'>${connectionError}</div>
        </div>`);
    this.element.appendChild(this.panel);
    this.error = simplify(this.element.querySelector('.-sbd-error'));

    this.ticketList = simplify(document.querySelector('.-sbd-panel > .-sbd-ticket-list'));
    this.ticketElementList = [];

    this.ticketRevision = 0;
    this.isLoading = false;
    this.noMoreTicket = false;

    let ticketNew = simplify(document.querySelector('.-sbd-ticket-list > .-sbd-ticket-new'));
    ticketNew.on('click', () => {
      const ticketNum = ('000' + (new Date().getTime() % 1000)).slice(-3);
      const tempTicketTitle = `Issue #${ticketNum}`;
      this.spinner.attachTo(this.ticketList);
      SendBirdDesk.Ticket.create(tempTicketTitle, user.nickname, (ticket, err) => {
        if (err) throw err;
        this.spinner.detach();
        this.startNewDialog(ticket);
      });
    });

    this.spinner = new Spinner();
    this.currentPage = 0;
    this.payloadTicket = null;

    /** SendBird Desk Widget action button
     */
    this.active = false;
    this.action = parseDom(`<div class='-sbd-action-button'></div>`);
    this.action.on('click', () => {
      this.active = !this.active;
      this.action.toggleClass('is-active');
      this.panel.toggleClass('fade-in');
      if (!this.active && this.dialog) {
        setTimeout(() => {
          this.dialog.close(true);
        }, 500);
      }
    });
    this.action.hide();
    this.element.appendChild(this.action);

    /** SendBird SDK and SendBird Desk SDK init
     *  NOTICE!
     *  Both this.sendbird.connect() and desk.authenticate() may have accessToken as a second param.
     *  The accessToken is not provided by SendBird SDK and Desk SDK.
     *  For more information, see https://docs.sendbird.com/javascript#authentication_3_connecting_with_userid_and_access_token.
     */
    // const accessToken = 'PUT-YOUR-OWN-ACCESS-TOKEN-HERE';
    const params = {
      appId: user.appId,
      modules: [new GroupChannelModule()],
    }

    this.sendbird = SendBird.init(params);
    setSb(this.sendbird);
    // I use self here to pass `this` inside the async function
    // why use async function? because I want to use await instead of `Promise.then` hell
    const self = this;
    async function init() {
      try {
        // await self.sendbird.connect(user.userId, accessToken);
        await self.sendbird.connect(user.userId);
        await self.sendbird.updateCurrentUserInfo({ nickname: user.nickname });
      } catch (error) {
        console.log('sendbird sdk init error', error);
        throw error;
      }
      if (DEBUG) SendBirdDesk.setDebugMode();
      SendBirdDesk.init(self.sendbird);
      SendBirdDesk.authenticate(
        user.userId,
        // accessToken,
        () => {
          self.action.show();
          /// connection event handler
          const connectionHandler = new ConnectionHandler();
          connectionHandler.onReconnectStarted = () => {
            if (self.active) self.spinner.attachTo(self.ticketList);
          };
          connectionHandler.onReconnectSucceeded = () => {
            if (self.active) {
              self.error.hide();

              if (self.dialog && self.dialog.isOpened) {
                self.dialog.ticket.channel.markAsRead();
                self.dialog.ticket.refresh((res, err) => {
                  if (!err) {
                    self.dialog.ticket = res;
                    self.dialog.updateAgent(res.agent);
                  }
                });
                const lastRevision = self.dialog.messageRevision;
                self.dialog.loadMessage(false, (res, err) => {
                  if (!err) {
                    if (self.dialog.messageRevision === lastRevision) {
                      const messages = res;
                      for (let i in messages) {
                        const message = messages[i];
                        if (MessageElement.isVisible(message)) {
                          self.dialog.prependMessage(message);
                        }
                      }
                      self.dialog.scrollToBottom();
                    }
                    self.spinner.detach();
                  }
                });
              } else {
                self.spinner.detach();
              }
            }
          };
          connectionHandler.onReconnectFailed = () => {
            if (self.active) {
              self.spinner.detach();
              self.error.show();
            }
          };
          self.sendbird.addConnectionHandler('widget', connectionHandler);

          /// channel/message event handler
          const channelHandler  = new GroupChannelHandler();
          channelHandler.onMessageReceived = (channel, message) => {
            let data = null;
            try {
              data = message.data ? JSON.parse(message.data) : null;
            } catch (e) {
              throw e;
            }

            SendBirdDesk.Ticket.getByChannelUrl(channel.url, (res, err) => {
              if (err) throw err;
              const ticket = res;
              if (data && data.ticket) ticket.status = data.ticket.status;

              /** check if the message is system message
               *  - isAssigned indicates that the ticket is assigned by an agent
               *  - isTransferred indicates that the ticket is assigned to another agent
               *  - isClosed indicates that the ticket is actually closed
               */
              message.isAssigned = data && data.type === SendBirdDesk.Message.DataType.TICKET_ASSIGN;
              message.isTransferred = data && data.type === SendBirdDesk.Message.DataType.TICKET_TRANSFER;
              message.isClosed = data && data.type === SendBirdDesk.Message.DataType.TICKET_CLOSE;

              /// update ticket instance
              if (message.isAssigned || message.isTransferred) {
                ticket.agent = data.ticket.agent;
              }

              const ticketElementIndex = self.ticketElementList.findIndex(
                ticketElement => ticketElement.ticket.id === ticket.id
              );
              const ticketElement = ticketElementIndex >= 0 ? self.ticketElementList[ticketElementIndex] : null;
              if (ticketElement) {
                ticketElement.ticket = ticket;
                ticketElement.render();
                if (message.isClosed) {
                  self.ticketElementList.splice(ticketElementIndex, 1);
                  self.ticketList.removeChild(ticketElement.element);
                }
              }

              // show notification
              if (!self.active) {
                if (SendBirdDesk.isDeskChannel(channel)) {
                  if (MessageElement.isVisible(message)) {
                    const notification = new NotificationElement(ticket, message);
                    notification.render();
                    notification.onClick(ticket => {
                      notification.close();
                      self.payloadTicket = ticket;
                      self.action.click();
                    });
                    notification.open(this);
                  }
                }
              }
            });
            if (self.dialog && self.dialog.isOpened) {
              if (self.dialog.ticket.channel.url === channel.url) {
                if (MessageElement.isVisible(message)) {
                  self.dialog.appendMessage(message);
                }
                self.dialog.ticket.channel.markAsRead(() => {});
              }
            }
          };
          self.sendbird.groupChannel.addGroupChannelHandler('widget', channelHandler);
        }
      );
    }
    init();
  }

  startNewDialog(ticket) {
    this.dialog = new Dialog(ticket);
    this.dialog.open(this);
  }
}
