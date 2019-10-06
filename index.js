const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase,
  utils: { download }
} = require("matrix-puppet-bridge");
const FacebookClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:facebook');
const fs = require('fs');

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

            // Raw text message
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

            // Formatted HTML message
            let msgHtml = '<blockquote>';
            if (attachment.title) {
              msgHtml += `<strong><a href="${url}">${attachment.title}</a></strong><br/>`;
            } else {
              msgHtml += `<strong><a href="${url}">${url}</a></strong><br/>`;
            }
            if (attachment.description) {
              msgHtml += `<em>${attachment.description}</em><br/>`;
            }
            if (attachment.source) {
              msgHtml += `(${attachment.source})`;
            }
            msgHtml += '</blockquote>';

            payload = {
              roomId: threadID,
              senderId: isMe? undefined : senderID,
              text: msgText,
              html: msgHtml
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

    this.thirdPartyClient.on('friendsList', async (friends) => {
        const statusRoomId = await this.getStatusRoomId();
        debug(`Join ${friends.length} users to the status room (${statusRoomId})`);

        // If the server is not yet ready, it will throw "Too Many Requests" errors.
        // Thus, we wait some time here.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const botIntent = this.getIntentFromApplicationServerBot();
        const botClient = botIntent.getClient();
        const puppetClient = this.puppet.getClient();
        const puppetId = puppetClient.getUserId();

        for (let i = 0; i < friends.length; i++) {
          const friend = friends[i]
          // to test with a single facebook user
          //
          // if (friend.fullName !== "Yodan Theburgimastr" && friend.fullName !== "Lord Reetveter") {
          //   continue; // DEBUG
          // }

          debug(`Getting user client ${i}/${friends.length} for ${friend.fullName} (ID: ${friend.userID})`)

          const ghostIntent = await this.getIntentFromThirdPartySenderId(
            friend.userID,
            friend.fullName,
            friend.profilePicture
          );
          await ghostIntent.join(statusRoomId);
          const ghostClient = await ghostIntent.getClient();
          ghostClient.setMaxListeners(ghostClient.getMaxListeners() + 1);

          ghostClient.on("RoomMember.membership", async (event, member) => {
            // https://github.com/matrix-org/matrix-js-sdk/issues/720
            const roomIdInvitationRoom = member.roomId;
            const invitationRoom = puppetClient.getRoom(roomIdInvitationRoom);
            const invitationRoomAllMembers = invitationRoom.currentState.getMembers();
            const isDM = (invitationRoom.getDMInviter() || (invitationRoomAllMembers.length == 2 && invitationRoomAllMembers.some((m) => {return m === m.getDMInviter();})));

            if (isDM) {
              if (member.membership === "invite" && member.userId === ghostClient.getUserId()) {
                try {
                  const roomAlias = ghostClient.getUserId().replace("@", "#");

                  let roomId;
                  try {
                    roomId = (await ghostClient.getRoomIdForAlias(roomAlias)).room_id;
                    debug(`Found matrix room via alias "${roomAlias}" (ID: ${roomId})`);

                    await ghostClient.joinRoom(roomIdInvitationRoom);
                    await ghostClient.sendMessage(roomIdInvitationRoom, {
                      "msgtype": "m.text",
                      "body": `Please use matrix room ${roomAlias} (ID: ${roomId}) for your communication with ${friend.fullName}. This room is *NOT* connected to facebook!`
                    });
                    await ghostClient.leave(roomIdInvitationRoom);

                    await ghostClient.invite(roomId, puppetId);
                    debug(`Invited myself (${puppetId}) in case I had left the conversation and the room already exists`);
                  } catch(err) {
                    roomId = roomIdInvitationRoom;
                    debug(`No matrix room found via alias, using the invite room (ID: ${roomId})`);

                    await ghostClient.joinRoom(roomId);
                    debug(`${friend.fullName} joined matrix room ${roomId}`);
                    await ghostClient.setRoomName(roomId, friend.fullName);
                    debug(`Name of matrix room ${roomId} set to "${friend.fullName}"`);
                    // await ghostClient.deleteAlias(roomAlias); // TODO is this necessary?
                    // debug(`Deleted alias "${roomAlias}"`);
                    await ghostClient.createAlias(roomAlias, roomId);
                    debug(`Created alias "${roomAlias}" for matrix room ${roomId}`);
                    await ghostClient.invite(roomId, puppetId);
                    debug(`Invited myself (${puppetId})`);
                  }

                  debug(`Auto-joined ${ghostClient.getUserId()} and ${botClient.getUserId()} into room ${member.roomId}`);
                } catch (err) {
                    debug(err);
                }
              }
            } else { // !isDM
              await ghostClient.joinRoom(member.roomId);
              debug(`${friend.fullName} joined matrix room ${member.roomId}`);
            }
          });

          await ghostClient.startClient();

          debug(`User client started for ${friend.fullName}`);
        }

        debug("Contact list synced");
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
    const url = text.match(/(https?:\/\/[^\s]+)/g);
    if (url) {
      return this.thirdPartyClient.sendMessage(id, {
        body: text,
        url: url[0],
      });
    } else {
      return this.thirdPartyClient.sendMessage(id, text);
    }
  }
  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    return download.getTempfile( data.url, { tagFilename: true }).then(({path}) => {
      let imgstream = fs.createReadStream(path);
      return this.thirdPartyClient.sendMessage(id, {
        body: data.text,
        attachment: imgstream,
      });
    });
  }
  sendFileMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    return download.getTempfile( data.url, { tagFilename: true }).then(({path}) => {
      let imgstream = fs.createReadStream(path);
      return this.thirdPartyClient.sendMessage(id, {
        body: data.text,
        attachment: imgstream,
      });
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
