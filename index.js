const path = require('path');

const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");

const puppet = new Puppet(path.join(__dirname, './config.json' ));

const GroupMeClient = require('./client');

class App extends MatrixPuppetBridgeBase {
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

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("groupmebot");
      reg.addRegexPattern("users", "@__mpb__groupme_.*", true);
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
