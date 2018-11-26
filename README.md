# matrix-puppet-facebook

This is a [puppetted Matrix bridge](https://github.com/AndrewJDR/matrix-puppet-bridge) for Facebook.


## installation

```
git clone https://github.com/matrix-hacks/matrix-puppet-facebook
cd matrix-puppet-facebook
npm install
```

## configure

```
cp config.sample.json ./config.json
nano ./config.json
```

Update config.json to match your setup

### Login to facebook

```
node login.js
```
This prompts you for your Facebook username/password, logs in, and creates an appstate.json containing your login token. It will also prompt you about login approvals (i.e. 2FA) if you have them enabled on your Facebook account. Note this script may output some errors, but as long as appstate.json is written and works properly once you run the bridge, you can ignore them.

## register the app service

```
node index.js -r -u "http://your-bridge-server:8090"
```
This will generate a `facebook-registration.yaml` file

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

```
cp facebook-registration.yaml /etc/matrix-synapse/
```

Copy this `facebook-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.


```
nano /etc/matrix-synapse/homeserver.yaml
```

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `facebook-registration.yaml` file.

## run the bridge

If you plan to run this program a service, you can continue at the next section.

Launch the bridge with ```./start.sh``` (see \* below for more details on this). This is a bash script, so it only works on linux / osx. If you're on windows, you'll need to take a look at the script and make an equivalent batch file. It should be very simple.

Restart your Homeserver.

## run as a service

If you use systemd you can run the server as a service, so it will start automatically on system boot.
First edit the path in the unit file:


```
nano matrix-puppet-facebook.service
```

After editing enable the service: 

```
cp ./matrix-puppet-facebook.service /etc/systemd/system
systemctl daemon-reload
systemctl enable matrix-puppet-facebook.service
systemctl start matrix-puppet-facebook.service
```

Restart your homeserver:

```
systemctl restart matrix-synapse.service
```

\* Just to explain the reason for `start.sh`, facebook-chat-api contains a bug - https://github.com/Schmavery/facebook-chat-api/issues/555 that necessitates reconnecting to facebook periodically, otherwise message sending will start to fail after a couple of days. `start.sh` ensures that the process restarts properly any time it dies.
