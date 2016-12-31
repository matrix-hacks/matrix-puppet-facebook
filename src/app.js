const ThirdPartyClient = require('groupme-push-client');
const { Bridge, MatrixRoom, RemoteRoom } = require('matrix-appservice-bridge');

class App {
  constructor(config, puppet) {
    this.config = config;
    this.puppet = puppet;
    this.bridge = new Bridge(Object.assign({}, config.bridge, {
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query', queriedUser);
          return {}; // auto provision users w no additional data
        },
        onEvent: this.handleMatrixEvent,
        onAliasQuery: function() {
          console.log('on alias query');
        },
        thirdPartyLookup: {
          protocols: ["groupme"],
          getProtocol: function() {
            console.log('get proto');
          },
          getLocation: function() {
            console.log('get loc');
          },
          getUser: function() {
            console.log('get user');
          }
        }
      }
    }));
  }
  initMatrixClient() {
    return this.puppet.createMatrixClient().then(matrixClient => {
      this.matrixClient = matrixClient;
      this.matrixClient.startClient();
    });
  }
  initThirdPartyClient() {
    this.thirdPartyClient = new ThirdPartyClient(this.config.groupme.accessToken);
    return this.thirdPartyClient.connect().then(() => {
      return this.thirdPartyClient.api.getMe();
    }).then(user => {
      this.thirdPartyUserId = user.id;
      return this.thirdPartyClient.subscribe(`/user/${user.id}`);
    }).then(userSub => {
      console.log('Subscribed to GroupMe user messages');
      userSub.on('line.create', ({
        subject: { id, group_id, user_id, text, name, picture_url }
      }) => this.handleThirdPartyRoomMessage({
        thirdParty: {
          roomId: group_id,
          messageId: id,
          senderName: name,
          senderId: user_id,
        },
        attachmentUrl: picture_url,
        text
      }));
    });
  }
  getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty, intent) {
    const roomStore = this.bridge.getRoomStore();
    return roomStore.getEntryById(thirdParty.roomId).then(entry=>{
      // get or otherwise create the matrix room
      if ( entry ) return entry;
      else {
        return Promise.all([
          intent.createRoom({ createAsClient: true }),
          this.thirdPartyClient.api.showGroup(thirdParty.roomId)
        ]).then(([matrixRoom, data]) => {
          return roomStore.upsertEntry({
            id: thirdParty.roomId,
            remote: new RemoteRoom(thirdParty.roomId, {
              name: data.name,
              description: data.description,
              members: data.members
            }),
            matrix: new MatrixRoom(matrixRoom.room_id)
          }).then(()=> {
            return this.matrixClient.setPowerLevel(
              matrixRoom.room_id, this.config.puppet.id, 100
            );
          });
        }).then(()=> {
          return roomStore.getEntryById(thirdParty.roomId);
        });
      }
    });
  }
  handleThirdPartyRoomMessage({thirdParty, text}) {
    // uses the matrix client, and bridge
    console.log('handleThirdPartyRoomMessage', thirdParty, text);
    if ( thirdParty.senderId === this.thirdPartyUserId ) {
      // this message was sent by me, send it as a notice to the matrix bridged room
      // if it isn't already in matrix, it should be relayed over to matrix as a notice
      // in the meantime, let's ignore it.
      console.log('ignoring message from myself. should really send it as a notice though');
      return;
    }
    const ghost = "@groupme_"+thirdParty.senderId+":"+this.config.bridge.domain;
    const intent = this.bridge.getIntent(ghost);
    return this.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty, intent).then(entry => {
      // join the room with the puppetted matrix user
      return this.matrixClient.joinRoom(entry.matrix.roomId);
    });
  }
  handleMatrixEvent(req, context) { // uses groupme client
    console.log('context', context);
    console.log('handle matrix event type', req.getData().type);
  }
}

module.exports = App;





  /* handle matrix event....
    let r = req.getData();
    console.log('got incoming matrix request of type', r.type);

    if (r.type === "m.room.message") {
      console.log('handing message from matrix user');
      console.log('room id', r.room_id);
      console.log('message', r.content.body);

      // Another form of duplicate message prevention, see other usage of
      // lastMsgsFromMyself further down.
      if(r.sender == config.puppet.id) {
        lastMsgsFromMyself.push(r.content.body);
        while(lastMsgsFromMyself.length > 10) {
          lastMsgsFromMyself.shift();
        }
      }

      // Ignore m.notice messages -- Such messages were probably
      // self-sent via the groupme app by way of this very bridge! And
      // so they should not be re-propogated, otherwise duplicate
      // messages would be sent/shown in iMessages.
      //
      // This typically also has the side-benefit of showing these
      // groupme-sent messages as slightly distinct color in the matrix
      // client, so it's very clear that they originated from groupme.
      if(r.content.msgtype != 'm.notice') {
        storage.getItem(r.room_id).then((meta) => {
          if ( meta && meta.handle ) {
            console.log('i must deliver this to', meta.handle);
            console.log('ok delivering it using ' + meta.service);

            //groupme.(meta.handle, r.content.body, meta.service != "iMessage" ? "sms" : "iMessage");
          }
        })
      }
    }
*/


  /*
  handle third party event = (msg, fileRecipient) => {
    console.log('handling incoming message from apple', msg);
    let roomHandle = msg.isMe ? msg.subject : msg.sender;

    //const ghost = msg.isMe ? "@groupme_"+msg.subject+":"+config.bridge.domain : "@groupme_"+msg.sender+":"+config.bridge.domain;
    const ghost = "@groupme_"+roomHandle+":"+config.bridge.domain;

    // TODO: These various setDisplayName/setRoomName/etc calls should move
    // into the createRoom block below, but development is in flux at the
    // moment, so I'm running them every time for a while before moving them
    // there. This way we clean up any old/incorrect room settings from prior
    // versions.
    let intent = bridge.getIntent(ghost);

    if(fileRecipient)
    {
      intent.setDisplayName(fileRecipient);
    }

    return storage.getItem(ghost).then((meta) => {
      if (meta && meta.room_id) {
        console.log('found room', meta);

        storage.getItem(meta.room_id).then((handleMeta) => {
          if (handleMeta && handleMeta.handle) {
            if (msg.service != handleMeta.service) {
              console.log("service has changed from " + meta.service + " to " + msg.service + ". persisting...");
              handleMeta.service = msg.service;
              storage.setItem(meta.room_id, handleMeta);
            }
          }
        });

        return meta;
      } else {
        return intent.createRoom({ createAsClient: true }).then(({room_id}) => {
          let meta = {
            room_id,
            "service": msg.service
          };

          console.log('created room', meta);
          // we need to store room_id => groupme handle
          // in order to fulfill responses from the matrix user
          return storage.setItem(room_id, { handle: roomHandle, service: msg.service }).then(() => {
            // and store the room ID info so we don't create dupe rooms
            return storage.setItem(ghost, meta)
          }).then(()=>meta);
        })
      }
    }).then((meta) => {
      // Always join our puppetted matrix user to the room.
      return matrixClient.joinRoom(meta.room_id).then(() => {
        console.log("joined room " + meta.room_id);

        // TODO Ultimately this should move into the createRoom block.
        return intent.setPowerLevel(meta.room_id, config.owner, 100);
      }).then(()=> {
        // This legacy code to cleanup old secondary users and room names.
        // TODO: These can be moved/removed a bit later.
        let selfIntent = bridge.getIntent("@groupme_" + config.ownerSelfName + ":" + config.bridge.domain);
        selfIntent.leave(meta.room_id); // dont catch this promise if it fails.
      }).then(()=>{
        return intent.setRoomName(meta.room_id, ""); // NOTE: Using unamed rooms
      }).then(()=>{
        // keeps the push notification messages short. If a room name exists, it
        // adds the " in <room name>" to the end of any push notif message.
        // It's also important to keep the rooms to 2 people only to maintain
        // these short notification messages, otherwise it will start adding
        // things like " and <user 2> and <user 3>" to the notification
        // message.
        return intent.setRoomTopic(meta.room_id, "iMessage"); // can probably be moved as an option to the createRoom call.
      }).then(()=>{
        console.log('checking if msg is me');
        // This should prevent self-sent messages that originate from matrix from being re-sent to groupme.
        if(msg.isMe) {
          console.log('msg is me');
          if(lastMsgsFromMyself.indexOf(msg.message) != -1 ) { // Lol, hacks... there are so many ways this can not work.
            console.log("Bailing on mirroring of self-sent message from matrix.");
            console.log("Would result in identical message - perhaps it was already sent using a matrix client?");
            return;
          }
        }

        // If a self-sent message, use the matrix puppet to mirror it over.
        // Otherwise use the virtual (groupme_*) user that represents the
        // person we're talking to.
        var msgSender = msg.isMe ? matrixClient.sendNotice.bind(matrixClient) : intent.sendText.bind(intent);
        console.log("sending = " + msg.message + " = to " + meta.room_id);
        return msgSender(meta.room_id, msg.message);
      })
    })
*/
