import {
  Config,
  IdentityPair,
  ThirdPartyAdapter,
  UserData, RoomData,
  ContactListUserData,
  Base,
  App, AppParams
} from "matrix-puppet-bridge";

import { Client } from './client';
const path = require('path');
const debug = require('debug')('matrix-puppet:facebook');

new App({
  configPath: path.join(process.cwd(), 'config.json'),
  createAdapter: (ident: IdentityPair, base: Base) : ThirdPartyAdapter => {
    const threadInfo = {};
    const userInfo : { [id: string]: UserData } = {};
    const fb = new Client();
    fb.configure(ident.thirdParty, ident.id);
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
        return base.handleThirdPartyRoomMessage(payload);
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
          return base.handleThirdPartyRoomImageMessage(payload);
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
          return base.handleThirdPartyRoomImageMessage(payload);
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
          return base.handleThirdPartyRoomImageMessage(payload);
        } else if (attachment.type === 'file') {
          debug('Attachment is a file');
          payload = {
            roomId: threadID,
            senderId: isMe? undefined : senderID,
            text: attachment.name + ': ' + attachment.url
          };
          return base.handleThirdPartyRoomMessage(payload);
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
          base.sendStatusMsg({}, 'Unknown attachment type', attachment.type);
        }
      } else {
        debug('Unknown message');
        base.sendStatusMsg({}, 'Unknown message');
      }
    })

    fb.on('friendsList', (friends) => {
      let thirdPartyUsers = [];

      for (const i in friends) {
        const friend = friends[i];
        userInfo[friend.userID] = <UserData>{ name: friend.fullName, avatarUrl: friend.profilePicture };
        let contact : ContactListUserData = {
          userId: friend.userID,
          name: friend.fullName,
          avatarUrl: friend.profilePicture
        }
        thirdPartyUsers.push(contact);
      }

      return base.joinThirdPartyUsersToStatusRoom(thirdPartyUsers);
    });

    return {
      startClient: () => fb.login(),
      getUserData: (id: string) : Promise<UserData> => {
        debug("get user data...", id);
        return fb.getUserInfoById(id).then(userInfo=>{
          // userInfo apparently can be null, e.g. when you're the sender
          if (userInfo) {
            debug('got user data', userInfo);
            
            let userData : UserData = {  
              name: userInfo.name, avatarUrl: userInfo.thumbSrc
            }
            userInfo[id] = userData;
            return userData;
          }
        });
      },
      getRoomData: (id: string) : Promise<RoomData> => {
        const isGroup = threadInfo[id].isGroup;
        let label = isGroup ? "Group" : "Friend";
        let avatarUrl = null;
        // https://github.com/Schmavery/facebook-chat-api/blob/master/DOCS.md#getThreadInfo
        // maybe we can get rid of our own threadInfo.isgroup
        return fb.getThreadInfo(id).then((data)=>{
          debug('thread info', id, data);

          if (isGroup) {
            // not sure what to set room avatar to in this case
          } else {
            // but in this case we want to set it to the user.
            // unfortunately we need to do this because the AS bot
            // creating the room means the room does not behave like
            // a normal 1 on 1 chat wherein the ghost user's avatar
            // is automatically used as the room avatar.
            // so until that is figured out, set it manually.
            let otherUserId = data.participantIDs.find((pid)=>{
              return pid !== fb.userId
            });
            if ( otherUserId ) {
              let userData : UserData = userInfo[otherUserId];
              avatarUrl = userData.avatarUrl ;
            }
          }

          return <RoomData>{
            name: data.name,
            topic: `Facebook ${label}`,
            avatarUrl,
          }
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
    }
  }
}).start();
