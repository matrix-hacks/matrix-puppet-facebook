# matrix-appservice-groupme

This is a Matrix bridge for GroupMe

## requirements

You will need to acquire your Access Token from GroupMe.

* Get your access token by going to https://dev.groupme.com/ and clicking the "Access Token" link in the top right.

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

## register the app service

Generate an `groupme-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `groupme-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `groupme-registration.yaml` file.

Launch the bridge with ```node index.js```.

Restart your HS.
