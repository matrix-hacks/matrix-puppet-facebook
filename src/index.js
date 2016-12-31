const config = require('../config.json');
const { Cli, AppServiceRegistration } = require("matrix-appservice-bridge");
const puppet = require('./puppet')(__dirname+'/../config.json');
const App = require('./app');

const queue = require('queue');
const q = queue();
q.timeout = 500;
q.concurrency = 1;

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
    app.initMatrixClient().then(() => {
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
