const Promise = require('bluebird');
const login = Promise.promisify(require("facebook-chat-api"));
const debug = require('debug')('matrix-puppet:facebook:client');
const EventEmitter = require('events').EventEmitter;

class Client extends EventEmitter {
  constructor(auth) {
    super();
    this.api = null;
    this.auth = auth;
  }
  login() {
    return login(this.auth).then((api)=> {
      this.api = api;
      api.setOptions({
        listenEvents: true,
        selfListen: true
      });
      this.userId = api.getCurrentUserID();
      debug('current user id', this.userId);
      api.listen((err, data) => {
        if ( err ) {
          debug('error', err.stack);
          throw err;
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
    sendMessage(msg, threadId).then(res=>{
      debug('sent msg, info back', res);
      return res;
    });
  }
}

module.exports = Client;
