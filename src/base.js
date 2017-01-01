const Promise = require('bluebird');
const { Bridge, MatrixRoom, RemoteRoom } = require('matrix-appservice-bridge');

class Base {
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
  initMatrixClient() {
    return this.puppet.createMatrixClient().then(matrixClient => {
      this.matrixClient = matrixClient;
      this.matrixClient.startClient();
    });
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
    return "@"+this.getServicePrefix()+"_user"+id+":"+this.config.bridge.domain;
  }
  getRoomAliasFromThirdPartyRoomId(id) {
    return "#"+this.getServicePrefix()+"_room"+id+':'+this.config.bridge.domain;
  }
  getIntentFromThirdPartySenderId(senderId) {
    return this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(senderId));
  }
  getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId, intent) {
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
          return this.matrixClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
            // we got the room ID. so it exists on matrix.
            // we just need to update our local cache, return the matrix room id for now
            return room_id;
          }, (_err) => {
            // the room doesn't exist. we need to create it for the first time
            return intent.createRoom({ createAsClient: true }).then(({room_id}) => {
              return Promise.all([
                intent.createAlias(roomAlias, room_id),
                intent.setRoomName(room_id, thirdPartyRoomData.name),
                intent.setRoomTopic(room_id, thirdPartyRoomData.topic),
                this.matrixClient.joinRoom(room_id),
                intent.setPowerLevel(room_id, this.config.puppet.id, 100)
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
    const intent = this.getIntentFromThirdPartySenderId(senderId);
    if ( senderId === this.getPuppetThirdPartyUserId() ) {
      // this message was sent by me, send it as a notice to the matrix bridged room
      // if it isn't already in matrix, it should be relayed over to matrix as a notice
      // in the meantime, let's ignore it.
      console.log('ignoring message from myself. should really send it as a notice though');
      return;
    }
    // XXX setDisplayName is too chatty, move it to a better place...
    return intent.setDisplayName(senderName).then(()=>{
      return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId, intent);
    }).then(entry => {
      return intent.sendText(entry.matrix.roomId, text);
    });
  }
  handleMatrixEvent(req, _context) { // uses groupme client
    console.log('handle matrix event type', req.getData().type);
  }
}

module.exports = Base;
