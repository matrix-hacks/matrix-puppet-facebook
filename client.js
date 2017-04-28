const Promise = require('bluebird');
const login = Promise.promisify(require("facebook-chat-api"));
const debug = require('debug')('matrix-puppet:facebook:client');
const EventEmitter = require('events').EventEmitter;

const readFile = Promise.promisify(require('fs').readFile);
const writeFile = Promise.promisify(require('fs').writeFile);

class Client extends EventEmitter {
  constructor(auth) {
    super();
    this.api = null;
    this.auth = auth;
  }
  login() {
    debug('Read the app state file');

    return readFile('appstate.json', 'utf8')
    .then((appState) => {
      return login({appState: JSON.parse(appState)})
      .catch((e) => {
        debug('Error when connecting using the app state: %s', e);
        debug('Trying with the plain auth');
        return login(this.auth);
      })
    })
    .catch((e) => {
      debug('Error when fetching the app state: %s', e);
      return login(this.auth);
    })
    .then((api) => {
      debug('Writing the app state file');
      return writeFile('appstate.json', JSON.stringify(api.getAppState())).then(() => api);
    })
    .then((api) => {
      this.api = api;

      api.setOptions({
        listenEvents: true,
        selfListen: true
      });
      this.userId = api.getCurrentUserID();

      debug('Getting the friend list');
      this.api.getFriendsList((err, friends) => {
        if (err) {
          debug('Error when getting the friend list');
          debug(err.stack);
        } else {
          debug('Get %d friends', friends.length);
          this.emit('friendsList', friends);
        }
      });
      debug('current user id', this.userId);
      let stop = api.listen((err, data) => {
        if ( err ) {
          debug('error', err.stack);
          console.log('gonna re-login...');
          // return this.login();
          debug('stopping it');
          stop();
          debug('stopped');
          debug('logging in again in 5 secs');
          setTimeout(() => this.login(), 5000);
          return;
        }
        debug(data);
        if ( data.type === 'typ' ) {
          if (data.isTyping === true) {
            this.emit('typing:start', data.threadId, data.userId);
          } else {
            this.emit('typing:stop', data.threadId, data.from);
          }
        } else if ( data.type === 'message' ) {
          this.emit('message', data);
        }
      });
      return this;
    });
  }
  getUserInfoById(userId) {
    const getUserInfo = Promise.promisify(this.api.getUserInfo);
    return getUserInfo([userId]).then(res=>{
      const userInfo = res[userId];
      debug('user info', userInfo);
      return userInfo;
    });
  }
  getThreadInfo(threadId) {
    const getThreadInfo = Promise.promisify(this.api.getThreadInfo);
    return getThreadInfo(threadId).then(res=>{
      debug('thread info', res);
      return res;
    });
  }
  sendMessage(threadId, msg) {
    const sendMessage = Promise.promisify(this.api.sendMessage);
    return sendMessage(msg, threadId).then(res=>{
      debug('sent msg, info back', res);
      return res;
    });
  }
  markAsRead(threadId) {
    return new Promise((resolve, reject) => {
      this.api.markAsRead(threadId, (err) => {
        if (err) {
          debug('fail when marked thread %s as read', threadId);
          debug(err);
        } else {
          debug('thread %s marked as read', threadId);
          resolve();
        }
      });
    });
  }
}

module.exports = Client;
