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
        listenEvents: true
      });
      this.userId = api.getCurrentUserID();
      debug('current user id', this.userId);
      api.listen((err, data) => {
        debug('error', err.stack);
        if ( err ) throw err;
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
    return Promise.promisify(this.api.getUserInfo)([userId]).then(res=>{
      const userInfo = res[userId];
      debug('user info', userInfo);
      return userInfo;
    });
  }
  getThreadInfo(threadId) {
    return Promise.promisify(this.api.getThreadInfo)(threadId).then(res=>{
      debug('thread info', res);
      return res;
    });
  }
}

module.exports = Client;
