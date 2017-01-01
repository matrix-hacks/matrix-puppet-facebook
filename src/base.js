const Promise = require('bluebird');
const { Bridge, MatrixRoom, RemoteRoom } = require('matrix-appservice-bridge');

class Base {
  constructor(config, puppet) {
    this.config = config;
    this.puppet = puppet;
    this.domain = config.bridge.domain;
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
          protocols: [this.getServicePrefix()],
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
  initThirdPartyClient() {
    throw new Error("override me");
  }
  /**
   * Async call to get additional data about the third party room
   *
   * @param {string} thirdPartyRoomId The unique identifier on the third party's side
   * @returns {Promise->object} Promise resolving object { name:string, topic:string }
   */
  getThirdPartyRoomDataById(_thirdPartyRoomId) {
    throw new Error("override me");
  }
  /**
   * The short string to put before the ghost user name.
   * e.g. return "groupme" for @groupme_bob:your.host.com
   *
   * @returns {string} The string to prefix localpart user ids of ghost users
   */
  getServicePrefix() {
    throw new Error("override me");
  }
  /**
   * Return a user id to match against 3rd party user id's in order to know if the message is of self-origin
   *
   * @returns {string} Your user ID from the perspective of the third party
   */
  getPuppetThirdPartyUserId() {
    throw new Error('override me');
  }
  getGhostUserFromThirdPartySenderId(id) {
    return "@"+this.getServicePrefix()+"_user"+id+":"+this.domain;
  }
  getRoomAliasFromThirdPartyRoomId(id) {
    return "#"+this.getServicePrefix()+"_room"+id+':'+this.domain;
  }
  getIntentFromThirdPartySenderId(senderId) {
    return this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(senderId));
  }
  getIntentFromApplicationServerBot() {
    return this.bridge.getIntent();
  }
  getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId) {
    const autoJoinNewRoom = true; // false was not tested
    const roomStore = this.bridge.getRoomStore();
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
    return roomStore.getEntryById(roomAlias).then(entry=>{
      // get or otherwise create the matrix room
      if ( entry ) return entry;
      else {
        // it is not in our entry, so lets get the third party info for now so we have it
        return this.getThirdPartyRoomDataById(thirdPartyRoomId).then(thirdPartyRoomData => {
          // our local cache may be empty, so we should find out if this room
          // is already on matrix and get that first using the room alias
          const botIntent = this.getIntentFromApplicationServerBot();
          const botClient = botIntent.getClient();
          return botClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
            // we got the room ID. so it exists on matrix.
            // we just need to update our local cache, return the matrix room id for now
            return room_id;
          }, (_err) => {
            // the room doesn't exist. we need to create it for the first time
            return botIntent.createRoom({ createAsClient: true }).then(({room_id}) => {
              return Promise.all([
                botIntent.createAlias(roomAlias, room_id),
                botIntent.setRoomName(room_id, thirdPartyRoomData.name),
                botIntent.setRoomTopic(room_id, thirdPartyRoomData.topic),
                autoJoinNewRoom ? this.puppet.getClient().joinRoom(room_id) : botIntent.invite(room_id, this.puppet.id),
                botIntent.setPowerLevel(room_id, this.puppet.id, 100)
              ]).then(()=>{
                // now return the matrix room id so we can use it to update the cache
                return room_id;
              });
            });
          });
        }).then(matrixRoomId => {
          // now's the time to update our local cache for this linked room
          return roomStore.upsertEntry({
            id: roomAlias,
            remote: new RemoteRoom(thirdPartyRoomId),
            matrix: new MatrixRoom(matrixRoomId)
          });
        });
      }
    });
  }
  handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
    console.log('handleThirdPartyRoomMessage', thirdPartyRoomMessageData);
    const {
      thirdParty: {
        roomId,
        //messageId,
        senderName,
        senderId
      },
      //attachmentUrl,
      text
    } = thirdPartyRoomMessageData;
    return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((entry)=> {
      console.log(entry);
      if ( senderId === this.getPuppetThirdPartyUserId() ) {
        // this message was sent by me, send it as a notice to the matrix bridged room
        return this.puppet.getClient().joinRoom(entry.matrix.roomId).then(()=>{
          this.puppet.getClient().sendNotice(entry.matrix.roomId, text);
        });
      } else {
        const ghostIntent = this.getIntentFromThirdPartySenderId(senderId);
        return Promise.mapSeries([
          () => ghostIntent.setDisplayName(senderName),
          () => ghostIntent.join(entry.matrix.roomId),
          () => ghostIntent.sendText(entry.matrix.roomId, text),
        ], p => p());
      }
    });
  }
  handleMatrixEvent(req, _context) { // uses groupme client
    console.log('handle matrix event type', req.getData().type);
  }
}

module.exports = Base;
