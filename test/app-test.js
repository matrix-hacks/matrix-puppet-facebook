import test from 'ava';
import { buildFakeApp } from './helpers/app-helper';

test("getOrCreateMatrixRoomFromThirdPartyRoom creates the room", async t=> {
  const app = await buildFakeApp({
    thirdPartyClientApi: {
      showGroup: ()=> Promise.resolve({ name: 'remote room name' })
    },
    matrixClientApi: {
      createRoom: () => Promise.resolve({ room_id: '!matrix:roomid' })
    }
  });
  const thirdParty = { roomId: 'remote room id' };
  const [entry, justCreated] = await app.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty);
  t.is(justCreated, true);
  t.is(entry.remote.roomId, 'remote room id');
  t.is(entry.remote.data.name, 'remote room name');
  t.is(entry.matrix.roomId, '!matrix:roomid');
});

test('getOrCreateMatrixRoomFromThirdPartyRoom justCreated is false when the room existed', async t => {
  const app = await buildFakeApp({
    thirdPartyClientApi: {
      showGroup: ()=> Promise.resolve({ name: 'remote room name' })
    },
    matrixClientApi: {
      createRoom: () => Promise.resolve({ room_id: '!matrix:roomid' })
    }
  });
  const thirdParty = { roomId: 'remote room id' };
  await app.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty);
  const [_, justCreated] = await app.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty);
  t.is(justCreated, false);
});

test("getOrCreateMatrixRoomFromThirdPartyRoom provides the intent instance for reuse", async t=> {
  const app = await buildFakeApp({
    thirdPartyClientApi: {
      showGroup: ()=> Promise.resolve({ name: 'remote room name' })
    },
    matrixClientApi: {
      createRoom: () => Promise.resolve({ room_id: '!matrix:roomid' })
    }
  });
  const thirdParty = { roomId: 'remote room id' };
  const [_1, _2, intent] = await app.getOrCreateMatrixRoomFromThirdPartyRoom(thirdParty);
  t.not(intent.client, null);
});
