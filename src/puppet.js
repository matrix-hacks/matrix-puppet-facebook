const Promise = require('bluebird');
const matrixSdk = require("matrix-js-sdk");
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);
const read = Promise.promisify(require('read'));
const whyPuppeting = 'https://github.com/kfatehi/matrix-appservice-imessage/commit/8a832051f79a94d7330be9e252eea78f76d774bc';

const readConfigFile = (jsonFile) => {
  return readFile(jsonFile).then(buffer => {
    return JSON.parse(buffer);
  });
};

module.exports = (jsonFile) => ({
  createMatrixClient: () => {
    return readConfigFile(jsonFile).then(config => {
      return matrixSdk.createClient({
        baseUrl: config.bridge.homeserverUrl,
        userId: config.puppet.id,
        accessToken: config.puppet.token
      });
    });
  },
  associate: () => {
    return readConfigFile(jsonFile).then(config => {
      console.log([
        'This bridge performs matrix user puppeting.',
        'This means that the bridge logs in as your user and acts on your behalf',
        'For the rationale, see '+whyPuppeting
      ].join('\n'));
      console.log("Enter your user's localpart");
      return read({ silent: false }).then(localpart => {
        let id = '@'+localpart+':'+config.bridge.domain;
        console.log("Enter password for "+id);
        return read({ silent: true, replace: '*' }).then(password => {
          return { localpart, id, password };
        });
      }).then(({localpart, id, password}) => {
        let matrixClient = matrixSdk.createClient(config.bridge.homeserverUrl);
        return matrixClient.loginWithPassword(id, password).then(accessDat => {
          console.log("log in success");
          return writeFile(jsonFile, JSON.stringify(Object.assign({}, config, {
            puppet: {
              id,
              localpart, 
              token: accessDat.access_token
            }
          }), null, 2)).then(()=>{
            console.log('Updated config file '+jsonFile);
          });
        });
      });
    });
  }
});
