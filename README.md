# matrix-puppet-facebook

This is a [puppetted Matrix bridge](https://github.com/AndrewJDR/matrix-puppet-bridge) for Facebook.

## quick start
```
git clone ...
cd matrix-puppet-facebook
npm install
cp config.sample.json ./config.json
node login.js
node index.js -r -u "http://gyetpet.ko.tl:8090"
cp facebook-registration.yaml /etc/matrix-synapse/
nano homeserver.yaml
```

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

Run `node login.js`. This prompts you for your Facebook username/password, logs in, and creates an appstate.json containing your login token. It will also prompt you about login approvals (i.e. 2FA) if you have them enabled on your Facebook account. Note this script may output some errors, but as long as appstate.json is written and works properly once you run the bridge, you can ignore them.

## register the app service

Generate an `facebook-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `facebook-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `facebook-registration.yaml` file.

Launch the bridge with ```./start.sh``` (see \* below for more details on this). This is a bash script, so it only works on linux / osx. If you're on windows, you'll need to take a look at the script and make an equivalent batch file. It should be very simple.

Restart your HS.

\* Just to explain the reason for `start.sh`, facebook-chat-api contains a bug - https://github.com/Schmavery/facebook-chat-api/issues/555 that necessitates reconnecting to facebook periodically, otherwise message sending will start to fail after a couple of days. `start.sh` ensures that the process restarts properly any time it dies.
