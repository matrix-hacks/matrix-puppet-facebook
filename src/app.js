const Base = require('./base');
const GroupMeClient = require('groupme-push-client');

class App extends Base {
  initThirdPartyClient() {
    this.thirdPartyClient = new GroupMeClient(this.config.groupme.accessToken);
    return this.thirdPartyClient.connect().then(() => {
      return this.thirdPartyClient.api.getMe();
    }).then(user => {
      this.thirdPartyUserId = user.id;
      return this.thirdPartyClient.subscribe(`/user/${user.id}`);
    }).then(userSub => {
      console.log('Subscribed to GroupMe user messages');
      userSub.on('line.create', (data) => {
        const thirdParty = this.mapThirdPartyRoomMessageData(data);
        return this.handleThirdPartyRoomMessage(thirdParty);
      });
    });
  }
  // GroupMe can handle a discreet deduplication tag
  defaultDeduplicationTag() {
    return "\u2063";
  }
  defaultDeduplicationTagPattern() {
    return "\\u2063$";
  }
  getPuppetThirdPartyUserId() {
    return this.thirdPartyUserId;
  }
  getServicePrefix() {
    return "groupme";
  }
  getThirdPartyRoomDataById(id) {
    return this.thirdPartyClient.api.showGroup(id).then(data=>{
      return {
        name: data.name,
        topic: data.description,
      };
    });
  }
  /**
   * Converts the third party service's room message data object to that which we expect in our App
   *
   * @param {object} thirdPartyData Third party's representation of a room message
   * @returns {object} App's representation of a third party room message
   */
  mapThirdPartyRoomMessageData(thirdPartyData) {
    const {
      subject: { id, group_id, user_id, text, name, picture_url }
    } = thirdPartyData;
    return {
      thirdParty: {
        roomId: group_id,
        messageId: id,
        senderName: name,
        senderId: user_id,
      },
      attachmentUrl: picture_url,
      text
    };
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    const sendMessage = this.thirdPartyClient.api.sendGroupMessage(id);
    return sendMessage(text);
  }
}

module.exports = App;
