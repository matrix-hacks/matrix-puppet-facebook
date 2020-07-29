const Promise = require('bluebird');
const login = Promise.promisify(require("facebook-chat-api"));
const debug = require('debug')('matrix-puppet:facebook:client');
const EventEmitter = require('events').EventEmitter;

const readFile = Promise.promisify(require('fs').readFile);
const writeFile = Promise.promisify(require('fs').writeFile);

class Client extends EventEmitter {
  constructor() {
    super();
    this.api = null;
    this.lastMsgId = null;
  }
  login() {
    debug('Read the app state file');

    return readFile('appstate.json', 'utf8')
    .then((appState) => {
      return login({appState: JSON.parse(appState)})
      .catch((e) => {
        console.error('Error when connecting using appstate.json: %s', e);
        console.error('Please confirm that your appstate.json was saved correctly. Consider re-running \'node login.js\'.');
        process.exit();
      })
    })
    .catch((e) => {
      console.error('Error when reading the appstate.json file: %s', e);
      console.error('Please confirm that your appstate.json was saved correctly. Consider re-running \'node login.js\'.');
      process.exit();
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
          debug(err);
        } else {
          debug('Get %d friends', friends.length);
          this.emit('friendsList', friends);
        }
      });

      debug('current user id', this.userId);
      let stop = api.listenMqtt((err, data) => {
        if ( err ) {
          debug('error', err);
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
        } else if ((data.type === 'message' || data.type === 'message_reply') && data.messageID !== this.lastMsgId) {
          this.lastMsgId = data.messageID;
          this.emit('message', data);
        } else if (data.type === 'event') {
          this.lastMsgId = data.messageID;
          this.emit('event', data);
        } else {
          debug("Unknown type received: ", data.type);
        }
      });

      // Restart every 8 hours, give or take an hour
      var restartHours = 8 + Math.random();
      var restartMs = Math.floor(restartHours*60*60*1000);

      setTimeout(() => {
        console.log("Dying and allowing supervisor process to restart me. ", restartHours.toFixed(2), "hours (", restartMs, " ms) have passed since starting.");
        process.exit();
      }, restartMs);

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

  getThreadName(threadInfo) {
    // Takes threadInfo as an argument and returns a Promise that resolves to
    // an array with at least the other participant's name on the name
    // attribute.
    // The result of that promise is intended to match the result of the
    // this.getUserInfoById promise so that it can just return that promise
    // instead when valid
    //
    // I'm surprised and annoyed that Facebook doesn't do this themselves, but gotta work with what we got
    //
    // FIXME: What about the room image? Looks like createRoom doesn't support setting that on creation
    // FIXME: This doesn't currently support room name *changes*, what can we do about that?
    //        ref: https://github.com/matrix-hacks/matrix-puppet-facebook/issues/16

    if (!threadInfo['name'] && !threadInfo['isGroup'] && threadInfo['participantIDs'].length == 2) {
      // FIXME: Is there a better way to get the participant that isn't me other than looping through all (2) participants?
      for (let memberID of threadInfo['participantIDs']) {
        if (memberID != this.userId) {
          // FIXME: Is it even worth using the nickname since per-room nicknames aren't properly supported yet anyway?
          if (threadInfo['nicknames'][memberID]) {
            debug("Setting room name to participant's nickname");
            return Promise.resolve({name: threadInfo['nicknames'][memberID]});
          } else {
            debug("Setting room name to participant's real name");
            return this.getUserInfoById(memberID);
          }
        }
      }
    } else {
      // FIXME: If there's no name on the group chat it should be set to the name of *all* participants
      debug('room name was already set or is a group chat, not changing');
      return Promise.resolve({name: threadInfo['name']});
    }
  }

  getThreadInfo(threadId) {
    const getThreadInfo = Promise.promisify(this.api.getThreadInfo);
    // I need threadInfo to be in this scope so that it can be called from inside both of the chained .than functions
    var threadInfo
    return getThreadInfo(threadId).then(res => {
      threadInfo = res;
      return this.getThreadName(threadInfo);
    }).then(additionalThreadInfo => {
      threadInfo['name'] = additionalThreadInfo['name'];
      debug('thread info', threadInfo);
      return threadInfo;
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
