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
  initThirdPartyClient() {
    this.threadInfo = {};
    this.thirdPartyClient = new FacebookClient(this.config.facebook);
    this.thirdPartyClient.on('message', (data)=>{
      const { senderID, body, threadID, isGroup, attachments } = data;
      const isMe = senderID === this.thirdPartyClient.userId;
      debug("ISME? " + isMe);
      this.threadInfo[threadID] = { isGroup };

      var payload;
      if (body !== undefined) {
        debug('Message has body');
        payload = {
          roomId: threadID,
          // senderName: senderID,
          senderId: isMe ? undefined : senderID,
          text: body
        };
        debug(payload);
        return this.handleThirdPartyRoomMessage(payload);
      } else if (attachments.length >= 0) {
        debug('Message has an attachment');
        let attachment = attachments[0];
        if (attachment.type === 'sticker') {
          debug('Attachment is a sticker');
          payload = {
            roomId: threadID,
            senderId: isMe? undefined : senderID,
            text: "sticker",
            url: attachment.url,
            h: attachment.height,
            w: attachment.width,
            mimetype: 'image/png'
          };
          return this.handleThirdPartyRoomImageMessage(payload);
        } else if (attachment.type === 'animated_image') {
          debug('Attachment is an animated image');
          payload = {
            roomId: threadID,
            senderId: isMe? undefined : senderID,
            text: attachment.name, 
            url: attachment.previewUrl,
            h: attachment.previewWidth,
            w: attachment.previewHeight,
            mimetype: 'image/gif'
          };
          return this.handleThirdPartyRoomImageMessage(payload);
        } else if (attachment.type === 'photo') {
          debug('Attachment is a photo');
          payload = {
            roomId: threadID,
            senderId: isMe? undefined : senderID,
            text: attachment.name,
            url: attachment.largePreviewUrl || attachment.previewUrl,
            h: attachment.largePreviewHeight || attachment.previewHeight,
            w: attachment.largePreviewWidth || attachment.previewWidth
          };
          return this.handleThirdPartyRoomImageMessage(payload);
        } else if (attachment.type === 'file') {
          debug('Attachment is a file');
          payload = {
            roomId: threadID,
            senderId: isMe? undefined : senderID,
            text: attachment.name + ': ' + attachment.url
          };
          return this.handleThirdPartyRoomMessage(payload);
        } else {
          debug('Unknown attachment type %s', attachment.type);
        }
      } else {
        debug('Unknown message');
      }
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
        name: data.name,
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
