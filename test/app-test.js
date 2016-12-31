import test from 'ava';
import tempfile from 'tempfile';
import App from '../src/app';
import { AppServiceRegistration } from "matrix-appservice";


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

test("does not create entries for self-messages", async t=> {
  let app = new App(appConfig(), {});
  await app.bridge.loadDatabases();
  app.thirdPartyUserId = 'same';
  await app.handleThirdPartyRoomMessage({
    thirdParty: {
      roomId: 'rid',
      senderId: 'same'
    }
  });
  let room = await app.bridge.getRoomStore().getEntryById('rid');
  t.is(room, null);
});

test("creates, sets power level, and joins room for messages sent by others", async t=> {
  let app = new App(appConfig(), {});
  await app.bridge.loadDatabases();
  app.thirdPartyUserId = 'not same';
  app.thirdPartyClient = { api: {
    showGroup: () => Promise.resolve({ name: "remote room name" })
  } };
  app.bridge._botClient = { register: ()=>Promise.resolve('ok') };
  app.bridge._clientFactory = {
    getClientAs: (userId) => ({
      credentials: { userId },
      createRoom: () => Promise.resolve({ room_id: '!matrix:roomid' })
    })
  };
  app.matrixClient = {
    joinRoom: ()=> Promise.resolve(),
    setPowerLevel: (roomId, userId, powerLevel) => Promise.all([
      t.is(roomId, '!matrix:roomid'),
      t.is(userId, '@me:example.com'),
      t.is(powerLevel, 100),
    ])
  };
  await app.handleThirdPartyRoomMessage({
    thirdParty: {
      roomId: 'remote room id',
      senderId: 'same'
    },
    text: 'hello'
  });
  let entry = await app.bridge.getRoomStore().getEntryById('remote room id');
  t.is(entry.remote.roomId, 'remote room id');
  t.is(entry.remote.data.name, 'remote room name');
  t.is(entry.matrix.roomId, '!matrix:roomid');
});
