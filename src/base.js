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
  getThirdPartyRoomDataById(thirdPartyRoomId) {
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
  getGhostFromThirdPartySenderId(senderId) {
    return "@"+this.getServicePrefix()+"_"+senderId+":"+this.config.bridge.domain;
  }
  getIntentFromThirdPartySenderId(senderId) {
    return this.bridge.getIntent(this.getGhostFromThirdPartySenderId(senderId));
  }
  getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty) {
    const roomStore = this.bridge.getRoomStore();
    const intent = this.getIntentFromThirdPartySenderId(thirdParty.senderId);
    return roomStore.getEntryById(thirdParty.roomId).then(entry=>{
      // get or otherwise create the matrix room
      if ( entry ) return [entry, false, intent];
      else {
        return Promise.all([
          intent.createRoom({ createAsClient: true }),
          this.getThirdPartyRoomDataById(thirdParty.roomId)
        ]).then(([matrixRoom, data]) => {
          return roomStore.upsertEntry({
            id: thirdParty.roomId,
            remote: new RemoteRoom(thirdParty.roomId, data),
            matrix: new MatrixRoom(matrixRoom.room_id)
          });
        }).then(()=> Promise.all([
          roomStore.getEntryById(thirdParty.roomId),
          true, intent
        ]))
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
    return this.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty).spread((entry, justCreated, intent) => {
      // join the room with the puppetted matrix user
      return this.matrixClient.joinRoom(entry.matrix.roomId).then(()=>{
        if (justCreated) {
          console.log('room was just created, doing 1st time setup');
          // the room was just created, so any 1-time configurations that require
          // the puppet user to be joined can happen here, namely:
          // * setting the puppet to have full power
          // * setting the room name to that of the 3rd party
          return this.firstTimeRoomConfiguration(entry, intent);
        }
      }).then(() => {
        console.log('room is ready. relay the 3rd party message into it');
      });
    });
  }
  firstTimeRoomConfiguration(entry, intent) {
    return Promise.all([
      intent.setPowerLevel(entry.matrix.roomId, this.config.puppet.id, 100),
      intent.setRoomName(entry.matrix.roomId, entry.remote.data.name),
      intent.setRoomTopic(entry.matrix.roomId, entry.remote.data.topic)
    ]);
  }
  handleMatrixEvent(req, context) { // uses groupme client
    console.log('handle matrix event type', req.getData().type);
  }
}

module.exports = Base;
