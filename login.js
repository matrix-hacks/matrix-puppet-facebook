const fs = require("fs");
const login = require("facebook-chat-api");
const readline = require("readline");

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Enter email > ');
rl.on('line', (email) => {
  console.log('Enter password > ');
  rl.on('line', (password) => {
    login({email, password}, {}, (err, api) => {
      if(err) {
        switch (err.error) {
          case 'login-approval':
            console.log('If you were sent a code, enter it here. If you were asked to approve your login via another device, approve it, choose "save browser", and just hit enter here> ');
            rl.on('line', (code) => {
              err.continue(code);
              rl.close();
            });
            break;
          default:
            console.error(err);
        }
      } else {
        fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()));
        console.log("Success! App state written to file. You should be able to ignore other errors as long as appstate.json was written.");
        process.exit();
      }
    });
  });
});
