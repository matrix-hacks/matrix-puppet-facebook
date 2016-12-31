const tempfile = require('tempfile');
const App = require('../../src/app');
const { AppServiceRegistration } = require("matrix-appservice");

const appConfig = () => ({
  puppet: {
    id: '@me:example.com'
  },
  bridge: {
    roomStore: tempfile('.db'),
    userStore: tempfile('.db'),
    homeserverUrl: 'http://example.com',
    domain: 'example.com',
    clientFactory: function() {
      console.log('sup');
    },
    registration: AppServiceRegistration.fromObject({
      id: "an_id",
      hs_token: "h5_t0k3n",
      as_token: "a5_t0k3n",
      url: "http://app-service-url",
      sender_localpart: 'bot',
      namespaces: {
        users: [{
          exclusive: true,
          regex: "@virtual_.*"
        }],
        aliases: [{
          exclusive: true,
          regex: "#virtual_.*"
        }]
      }
    })
  }
});

module.exports.buildFakeApp = (edits={}) => {
  const app = new App(appConfig(), {});
  return app.bridge.loadDatabases().then(()=>{
    app.thirdPartyUserId = 'not same';
    app.thirdPartyClient = { api: edits.thirdPartyClientApi || {} };
    app.bridge._botClient = { register: ()=>Promise.resolve('ok') };
    app.bridge._clientFactory = {
      getClientAs: (userId) => Object.assign({},{
        credentials: { userId },
      },edits.matrixClientApi||{})
    };
    app.matrixClient = {
      joinRoom: ()=> Promise.resolve()
    };
    return app;
  });
};
