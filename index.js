const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const FacebookClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:facebook');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "facebook";
  }

  getServiceName () {
    return "Facebook";
  }

  initThirdPartyClient() {
    this.threadInfo = {};
    this.thirdPartyClient = new FacebookClient();
    this.thirdPartyClient.on('message', (data) => {
      const { senderID, body, threadID, isGroup, attachments } = data;
      const isMe = senderID === this.thirdPartyClient.userId;
      debug("ISME? " + isMe);
      this.threadInfo[threadID] = { isGroup };

      var payload;
      if (body) {
        debug('Message has body');
        payload = {
          roomId: threadID,
          // senderName: senderID,
          senderId: isMe ? undefined : senderID,
          text: body
        };
        debug(payload);
        // Don't return yet -- there may be attachments, too.
        this.handleThirdPartyRoomMessage(payload);
      }

      // We represent attachments as separate messages, as facebook does.
      if (attachments.length >= 0) {
        debug('Message has one or more attachments');
        attachments.forEach(attachment => {
          if (attachment.type === 'sticker') {
            debug('Attachment is a sticker');
            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: attachment.description,
              url: attachment.url,
              h: 120,
              w: 120,
              mimetype: 'image/png'
            };
            this.handleThirdPartyRoomImageMessage(payload);
          } else if (attachment.type === 'animated_image') {
            debug('Attachment is an animated image');
            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: attachment.filename,
              url: attachment.previewUrl,
              h: attachment.previewWidth,
              w: attachment.previewHeight,
              mimetype: 'image/gif'
            };
            this.handleThirdPartyRoomImageMessage(payload);
          } else if (attachment.type === 'photo') {
            debug('Attachment is a photo');
            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: attachment.filename,
              url: attachment.largePreviewUrl || attachment.previewUrl,
              h: attachment.largePreviewHeight || attachment.previewHeight,
              w: attachment.largePreviewWidth || attachment.previewWidth
            };
            this.handleThirdPartyRoomImageMessage(payload);
          } else if (attachment.type === 'file') {
            debug('Attachment is a file');
            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: attachment.name + ': ' + attachment.url
            };
            this.handleThirdPartyRoomMessage(payload);
          } else if (attachment.type === 'share' && 'facebookUrl' in attachment) {
            debug('Attachment is a facebook share');
            var url;
            if (attachment.facebookUrl.startsWith('http://') || attachment.facebookUrl.startsWith('https://')) {
              const urlObject = new URL(attachment.facebookUrl);
              if (urlObject.hostname == "l.facebook.com" && urlObject.pathname == "/l.php") {
                // Remove facebook link tracker
                url = urlObject.searchParams.get("u");
              } else {
                url = attachment.facebookUrl;
              }
            } else {
              url = 'https://www.facebook.com' + attachment.facebookUrl;
            }
            let msgText = "";

            if (attachment.title) {
              msgText += attachment.title + ":\n";
            }

            if (attachment.description) {
              msgText += attachment.description + "\n";
            }

            msgText += url;

            if (attachment.source) {
              msgText += "\n(" + attachment.source + ")";
            }

            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: msgText
            };
            this.handleThirdPartyRoomMessage(payload);
          } else {
            debug('Unknown attachment type %s', attachment.type);
          }
        });
      } else {
        debug('Unknown message');
      }
    });

    this.thirdPartyClient.on('friendsList', (friends) => {
      let thirdPartyUsers = [];

      for (const i in friends) {
        const friend = friends[i];
        thirdPartyUsers.push({
          userId: friend.userID,
          name: friend.fullName,
          avatarUrl: friend.profilePicture
        });
      }

      return this.joinThirdPartyUsersToStatusRoom(thirdPartyUsers);
    });

    return this.thirdPartyClient.login();
  }

  getThirdPartyUserDataById(id) {
    return this.thirdPartyClient.getUserInfoById(id).then(userInfo=>{
      debug('got user data', userInfo);
      // TODO use userInfo.thumbSrc as the avatar
      return { senderName: userInfo.name };
    });
  }
  getThirdPartyRoomDataById(threadId) {
    debug('getting third party room data by thread id', threadId);
    let label = this.threadInfo[threadId].isGroup ? "Group" : "Friend";
    return this.thirdPartyClient.getThreadInfo(threadId).then(data=>{
      let roomData = {
        name: data.name ? data.name : '',
        topic: `Facebook ${label}`
      };
      debug('room data', roomData);
      return roomData;
    });
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.thirdPartyClient.sendMessage(id, text);
  }
  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    return this.thirdPartyClient.sendMessage(id, {
      body: data.text,
      url: data.url
    });
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId(id) {
    return this.thirdPartyClient.markAsRead(id);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("facebookbot");
      reg.addRegexPattern("users", "@facebook_.*", true);
      reg.addRegexPattern("aliases", "#facebook_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
