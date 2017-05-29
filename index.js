const { MatrixPuppetBridge } = require("matrix-puppet-bridge");
const FacebookClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:facebook');

const threadInfo = {};

const fb = new FacebookClient(config.facebook);

const app = new MatrixPuppetBridge({
  getServicePrefix: () => 'facebook',
  getServiceName: () => 'Facebook',
  getUserInfo: id => {
    return fb.getUserInfoById(id).then(userInfo=>{
      debug('got user data', userInfo);
      // TODO use userInfo.thumbSrc as the avatar
      return { senderName: userInfo.name };
    });
  },
  getRoomInfo: id => {
    let label = threadInfo[id].isGroup ? "Group" : "Friend";
    // https://github.com/Schmavery/facebook-chat-api/blob/master/DOCS.md#getThreadInfo
    // maybe we can get rid of our own threadInfo.isgroup
    return fb.getThreadInfo(id).then((data)=>{
      debug('thread info', id, data); // is knowledge of if it's a group here?
      return { name, topic: `Facebook ${label}` }
    });
  },
  sendMessage: (id, text) => {
    return fb.sendMessage(id, text);
  },
  sendImageMessage: (id, {text, url}) => {
    return fb.sendMessage(id, { body: text, url });
  },
  sendReadReceipt: (id) => {
    return fb.markAsRead(id);
  }
});

fb.on('message', (data) => {
  const { senderID, body, threadID, isGroup, attachments } = data;
  const isMe = senderID === fb.userId;
  threadInfo[threadID] = { isGroup };

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
    return app.handleThirdPartyRoomMessage(payload);
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
      return app.handleThirdPartyRoomImageMessage(payload);
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
      return app.handleThirdPartyRoomImageMessage(payload);
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
      return app.handleThirdPartyRoomImageMessage(payload);
    } else if (attachment.type === 'file') {
      debug('Attachment is a file');
      payload = {
        roomId: threadID,
        senderId: isMe? undefined : senderID,
        text: attachment.name + ': ' + attachment.url
      };
      return app.handleThirdPartyRoomMessage(payload);
    } else if (attachment.type === 'share' && 'facebookUrl' in attachment) {
      debug('Attachment is a facebook share');
      var url;
      if (attachment.facebookUrl.startsWith('http://') || attachment.facebookUrl.startsWith('https://')) {
        url = attachment.facebookUrl;
      } else {
        url = 'https://www.facebook.com' + attachment.facebookUrl;
      }

      payload = {
        roomId: threadID,
        senderId: isMe? undefined : senderID,
        text: attachment.title + ': ' + url
      };
      return this.handleThirdPartyRoomMessage(payload);
    } else {
      debug('Unknown attachment type %s', attachment.type);
      app.sendStatusMsg({}, 'Unknown attachment type', attachment.type);
    }
  } else {
    debug('Unknown message');
    app.sendStatusMsg({}, 'Unknown message');
  }
})

fb.on('friendsList', (friends) => {
  let thirdPartyUsers = [];

  for (const i in friends) {
    const friend = friends[i];
    thirdPartyUsers.push({
      userId: friend.userID,
      name: friend.fullName,
      avatarUrl: friend.profilePicture
    });
  }

  return app.joinThirdPartyUsersToStatusRoom(thirdPartyUsers);
});

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
      return fb.login();
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
