const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const GroupMeClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "groupme";
  }
  initThirdPartyClient() {
    this.thirdPartyClient = new GroupMeClient(this.config.groupme.accessToken);
    return this.thirdPartyClient.connect().then(() => {
      return this.thirdPartyClient.api.getMe();
    }).then(user => {
      return this.thirdPartyClient.subscribe(`/user/${user.id}`).then(userSub => {
        console.log('Subscribed to GroupMe user messages');
        userSub.on('line.create', (data) => {
          const { subject: { id, group_id, user_id, text, name } } = data;
          return this.handleThirdPartyRoomMessage({
            roomId: group_id,
            messageId: id,
            senderName: name,
            senderId: user_id === user.id ? undefined : user_id,
            text
          });
        });
      });
    });
  }
  getThirdPartyRoomDataById(id) {
    return this.thirdPartyClient.api.showGroup(id).then(data=>({
      name: data.name, topic: data.description
    }));
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.thirdPartyClient.api.sendGroupMessage(id)(text);
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
      reg.addRegexPattern("users", "@groupme_.*", true);
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
