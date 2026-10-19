const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.gltf']);
const gzipCache = new Map();

// ============================================================================
// CO-OP MULTIPLAYER ROOM MANAGER (WebSocket + HTTP REST Fallback)
// ============================================================================
const rooms = new Map(); // code -> Room

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createRoom(hostId, hostName, difficulty = 6, seed = null) {
  const code = genCode();
  const room = {
    code,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'lobby', // 'lobby' | 'running'
    difficulty: Number(difficulty ?? 6),
    seed: seed || (Date.now() & 0x7fffffff),
    roundStartedFloor: 0,
    sharedRelics: [], // [{ relicId, fromPlayerId, fromName, ts }]
    crossroadsVotes: {}, // { [playerId]: gateIndex }
    players: {
      [hostId]: {
        id: hostId,
        slot: 1,
        name: hostName || 'Joueur 1',
        isHost: true,
        isBot: false,
        ready: true,
        roundReady: false,
        readyFloor: 0,
        phase: 'Lobby',
        floor: 1,
        act: 1,
        shards: 15,
        stabilizerShards: 10,
        board: [],
        bench: [],
        relics: [],
        inventory: [],
        battleState: null, // { status: 'fighting'|'won'|'lost', elapsed: 0, alliesAlive: 0, enemiesAlive: 0 }
        inbox: [], // queued events for HTTP polling fallback
        ws: null,
        lastSeen: Date.now(),
      },
    },
  };
  rooms.set(code, room);
  return room;
}

function serializeRoom(room, forPlayerId = null) {
  const playersSummary = {};
  for (const [pid, p] of Object.entries(room.players)) {
    playersSummary[pid] = {
      id: p.id,
      slot: p.slot,
      name: p.name,
      isHost: p.isHost,
      isBot: !!p.isBot,
      ready: !!p.ready,
      roundReady: !!p.roundReady,
      readyFloor: Number(p.readyFloor || 0),
      phase: p.phase,
      floor: p.floor,
      act: p.act,
      shards: p.shards,
      stabilizerShards: p.stabilizerShards,
      board: p.board || [],
      bench: p.bench || [],
      relics: p.relics || [],
      inventory: p.inventory || [],
      battleState: p.battleState || null,
      online: p.isBot || (Date.now() - p.lastSeen < 30000),
    };
  }
  const inbox = forPlayerId && room.players[forPlayerId]
    ? room.players[forPlayerId].inbox.splice(0, room.players[forPlayerId].inbox.length)
    : [];
  return {
    code: room.code,
    status: room.status,
    difficulty: room.difficulty,
    seed: room.seed,
    roundStartedFloor: Number(room.roundStartedFloor || 0),
    sharedRelics: room.sharedRelics,
    crossroadsVotes: room.crossroadsVotes,
    players: playersSummary,
    inbox,
  };
}

function sendEventToPlayer(room, targetPlayerId, eventObj) {
  const p = room.players[targetPlayerId];
  if (!p) return;
  const payload = { ...eventObj, ts: Date.now() };
  if (p.ws && p.ws.writable) {
    wsSendJson(p.ws, payload);
  } else {
    p.inbox.push(payload);
    if (p.inbox.length > 100) p.inbox.shift();
  }
}

function broadcastRoom(room, eventObj, excludePlayerId = null) {
  room.updatedAt = Date.now();
  for (const pid of Object.keys(room.players)) {
    if (pid === excludePlayerId) continue;
    sendEventToPlayer(room, pid, eventObj);
  }
}

function handleCoopAction(room, playerId, msg) {
  const player = room.players[playerId];
  if (!player) return;
  player.lastSeen = Date.now();

  const partnerId = Object.keys(room.players).find((id) => id !== playerId);
  const partner = partnerId ? room.players[partnerId] : null;

  switch (msg.type) {
    case 'SET_DIFFICULTY': {
      if (player.isHost) {
        room.difficulty = Number(msg.difficulty ?? 6);
        broadcastRoom(room, { type: 'ROOM_SYNC', room: serializeRoom(room) });
      }
      break;
    }
    case 'LOBBY_READY': {
      player.ready = msg.ready !== undefined ? !!msg.ready : !player.ready;
      broadcastRoom(room, { type: 'ROOM_SYNC', room: serializeRoom(room) });
      break;
    }
    case 'ADD_BOT': {
      if (Object.keys(room.players).length < 2) {
        const botId = 'bot_partner';
        room.players[botId] = {
          id: botId,
          slot: 2,
          name: msg.botName || 'Aria (Bot Allié)',
          isHost: false,
          isBot: true,
          ready: true,
          roundReady: true,
          readyFloor: 1,
          phase: 'Lobby',
          floor: 1,
          act: 1,
          shards: 15,
          stabilizerShards: 10,
          board: [],
          bench: [],
          relics: [],
          inventory: [],
          battleState: null,
          inbox: [],
          ws: null,
          lastSeen: Date.now(),
        };
        broadcastRoom(room, { type: 'ROOM_SYNC', room: serializeRoom(room) });
      }
      break;
    }
    case 'START_COOP_RUN': {
      room.status = 'running';
      room.roundStartedFloor = 0;
      room.difficulty = Number(msg.difficulty ?? room.difficulty ?? 6);
      room.seed = Number(msg.seed || room.seed || (Date.now() & 0x7fffffff));
      for (const p of Object.values(room.players)) {
        p.roundReady = !!p.isBot;
        p.readyFloor = p.isBot ? 1 : 0;
      }
      broadcastRoom(room, {
        type: 'START_COOP_RUN',
        difficulty: room.difficulty,
        seed: room.seed,
        room: serializeRoom(room),
      });
      break;
    }
    case 'ROUND_READY': {
      const targetFloor = Number(msg.floor || player.floor || 1);
      const isReady = msg.ready !== undefined ? !!msg.ready : true;
      player.roundReady = isReady;
      player.readyFloor = targetFloor;
      player.floor = targetFloor;

      if (partner && partner.isBot) {
        partner.roundReady = true;
        partner.readyFloor = targetFloor;
        partner.floor = targetFloor;
      }

      const playersList = Object.values(room.players);
      const allReady = playersList.length >= 2 && playersList.every((p) => p.isBot || (p.roundReady && Number(p.readyFloor) === targetFloor));

      if (allReady) {
        room.roundStartedFloor = targetFloor;
        for (const p of playersList) {
          p.roundReady = false;
        }
        broadcastRoom(room, {
          type: 'START_ROUND_NOW',
          floor: targetFloor,
          room: serializeRoom(room),
        });
      } else {
        broadcastRoom(room, {
          type: 'ROUND_READY_SYNC',
          fromId: playerId,
          fromName: player.name,
          ready: player.roundReady,
          floor: targetFloor,
          room: serializeRoom(room),
        });
      }
      break;
    }
    case 'STATE_UPDATE': {
      const s = msg.state || msg;
      if (s.phase) player.phase = s.phase;
      if (s.floor != null) {
        if (Number(s.floor) !== Number(player.readyFloor)) {
          player.roundReady = false;
        }
        player.floor = s.floor;
      }
      if (s.act != null) player.act = s.act;
      if (s.shards != null) player.shards = s.shards;
      if (s.stabilizerShards != null) player.stabilizerShards = s.stabilizerShards;
      if (Array.isArray(s.board)) player.board = s.board;
      if (Array.isArray(s.bench)) player.bench = s.bench;
      if (Array.isArray(s.relics)) {
        player.relics = s.relics;
        for (const r of s.relics) {
          const rid = Number(r?.relicId ?? r?.id ?? r);
          if (rid && !room.sharedRelics.some((sr) => sr.relicId === rid && sr.fromPlayerId === playerId)) {
            const entry = { relicId: rid, fromPlayerId: playerId, fromName: player.name, ts: Date.now() };
            room.sharedRelics.push(entry);
            if (partner) {
              sendEventToPlayer(room, partner.id, { type: 'SHARED_RELIC_ADDED', entry, sharedRelics: room.sharedRelics });
            }
          }
        }
      }
      if (Array.isArray(s.inventory)) player.inventory = s.inventory;
      if (s.battleState !== undefined) player.battleState = s.battleState;

      if (partner) {
        sendEventToPlayer(room, partner.id, {
          type: 'PARTNER_STATE',
          partner: serializeRoom(room).players[playerId],
          room: serializeRoom(room),
          sharedRelics: room.sharedRelics,
        });
      }
      break;
    }
    case 'REINFORCEMENT_SEND': {
      // Player finished combat with surviving heroes -> send them to partner's battle!
      if (partner) {
        sendEventToPlayer(room, partner.id, {
          type: 'REINFORCEMENT_ARRIVED',
          fromId: playerId,
          fromName: player.name,
          floor: msg.floor || player.floor,
          survivors: msg.survivors || [],
        });
      }
      break;
    }
    case 'TRADE_SEND': {
      // Send shards, item, or hero to partner
      if (partner) {
        sendEventToPlayer(room, partner.id, {
          type: 'TRADE_RECEIVED',
          fromId: playerId,
          fromName: player.name,
          gift: msg.gift, // { kind: 'shards'|'item'|'hero', amount, itemId, hero }
        });
      }
      break;
    }
    case 'CROSSROADS_VOTE': {
      room.crossroadsVotes[playerId] = msg.gateIndex;
      broadcastRoom(room, {
        type: 'CROSSROADS_VOTES',
        votes: room.crossroadsVotes,
        fromId: playerId,
        fromName: player.name,
        gateIndex: msg.gateIndex,
      });
      break;
    }
    case 'PING': {
      if (partner) {
        sendEventToPlayer(room, partner.id, {
          type: 'PARTNER_PING',
          fromId: playerId,
          fromName: player.name,
          text: msg.text || 'Prêt !',
        });
      }
      break;
    }
  }
}

// ============================================================================
// MINIMAL RFC 6455 WEBSOCKET FRAME PARSER & SENDER (Zero Dependencies)
// ============================================================================
function wsSendJson(socket, obj) {
  try {
    const json = JSON.stringify(obj);
    const payload = Buffer.from(json, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  } catch (e) {}
}

function attachWebSocket(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = isMasked ? 4 : 0;
      if (buffer.length < offset + maskLen + payloadLen) return;

      const mask = isMasked ? buffer.slice(offset, offset + 4) : null;
      offset += maskLen;
      const data = Buffer.from(buffer.slice(offset, offset + payloadLen));
      buffer = buffer.slice(offset + payloadLen);

      if (opcode === 0x8) {
        // Close frame
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      }
      if (opcode === 0x1) {
        if (isMasked && mask) {
          for (let i = 0; i < data.length; i++) {
            data[i] ^= mask[i & 3];
          }
        }
        try {
          const parsed = JSON.parse(data.toString('utf8'));
          onMessage(parsed);
        } catch (e) {}
      }
    }
  });
  socket.on('close', () => onClose && onClose());
  socket.on('error', () => onClose && onClose());
}

// ============================================================================
// HTTP SERVER (Static Gzip + /api/coop/* REST Endpoints)
// ============================================================================
function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // ---- CO-OP REST API ENDPOINTS ----
    if (pathname === '/api/coop/create' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const playerId = body.playerId || `p_${crypto.randomBytes(4).toString('hex')}`;
      const room = createRoom(playerId, body.playerName || 'Joueur 1', body.difficulty ?? 6, body.seed);
      return sendJson(res, 200, { ok: true, playerId, room: serializeRoom(room, playerId) });
    }

    if (pathname === '/api/coop/join' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = String(body.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        return sendJson(res, 404, { ok: false, error: 'Salon introuvable. Vérifie le code à 4 caractères.' });
      }
      let playerId = body.playerId || `p_${crypto.randomBytes(4).toString('hex')}`;
      if (room.players[playerId] && room.players[playerId].isHost && Object.keys(room.players).length < 2) {
        playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
      }
      if (!room.players[playerId]) {
        const existingIds = Object.keys(room.players);
        // Replace bot if one was added, or add as slot 2
        if (existingIds.length >= 2) {
          const botKey = existingIds.find((k) => room.players[k].isBot);
          if (botKey) delete room.players[botKey];
          else return sendJson(res, 400, { ok: false, error: 'Ce salon Co-Op est déjà complet (2/2).' });
        }
        room.players[playerId] = {
          id: playerId,
          slot: 2,
          name: body.playerName || 'Joueur 2',
          isHost: false,
          isBot: false,
          ready: false,
          roundReady: false,
          readyFloor: 0,
          phase: 'Lobby',
          floor: 1,
          act: 1,
          shards: 15,
          stabilizerShards: 10,
          board: [],
          bench: [],
          relics: [],
          inventory: [],
          battleState: null,
          inbox: [],
          ws: null,
          lastSeen: Date.now(),
        };
      } else {
        room.players[playerId].lastSeen = Date.now();
        if (body.playerName) room.players[playerId].name = body.playerName;
      }
      broadcastRoom(room, { type: 'ROOM_SYNC', room: serializeRoom(room) }, playerId);
      return sendJson(res, 200, { ok: true, playerId, room: serializeRoom(room, playerId) });
    }

    if (pathname === '/api/coop/action' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = String(body.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return sendJson(res, 404, { ok: false, error: 'Room not found' });
      handleCoopAction(room, body.playerId, body.action || body);
      return sendJson(res, 200, { ok: true, room: serializeRoom(room, body.playerId) });
    }

    if (pathname === '/api/coop/poll' && req.method === 'GET') {
      const code = String(parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
      const playerId = parsedUrl.searchParams.get('playerId') || '';
      const room = rooms.get(code);
      if (!room) return sendJson(res, 404, { ok: false, error: 'Room not found' });
      if (room.players[playerId]) room.players[playerId].lastSeen = Date.now();
      return sendJson(res, 200, { ok: true, room: serializeRoom(room, playerId) });
    }

    // ---- STATIC FILE SERVING ----
    if (pathname === '/') pathname = '/index.html';

    const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isAsset = pathname.startsWith('/assets/');
      const headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
      };

      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip')) {
        const cacheKey = `${safePath}:${stats.mtimeMs}`;
        const cached = gzipCache.get(cacheKey);
        if (cached) {
          headers['Content-Encoding'] = 'gzip';
          headers['Content-Length'] = cached.length;
          res.writeHead(200, headers);
          res.end(cached);
          return;
        }
        fs.readFile(safePath, (readErr, raw) => {
          if (readErr) {
            res.writeHead(500);
            res.end('Error');
            return;
          }
          zlib.gzip(raw, (gzErr, compressed) => {
            if (gzErr) {
              res.writeHead(200, headers);
              res.end(raw);
              return;
            }
            gzipCache.set(cacheKey, compressed);
            headers['Content-Encoding'] = 'gzip';
            headers['Content-Length'] = compressed.length;
            res.writeHead(200, headers);
            res.end(compressed);
          });
        });
      } else {
        headers['Content-Length'] = stats.size;
        res.writeHead(200, headers);
        fs.createReadStream(safePath).pipe(res);
      }
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// Upgrade HTTP -> WebSocket for /ws/coop
server.on('upgrade', (req, socket) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (parsedUrl.pathname !== '/ws/coop') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    const code = String(parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
    const playerId = parsedUrl.searchParams.get('playerId') || '';
    const room = rooms.get(code);
    if (room && room.players[playerId]) {
      room.players[playerId].ws = socket;
      room.players[playerId].lastSeen = Date.now();
      wsSendJson(socket, { type: 'ROOM_SYNC', room: serializeRoom(room, playerId) });
    }

    attachWebSocket(
      socket,
      (msg) => {
        const r = rooms.get(String(msg.code || code).toUpperCase());
        const pid = msg.playerId || playerId;
        if (!r || !r.players[pid]) return;
        r.players[pid].ws = socket;
        handleCoopAction(r, pid, msg);
      },
      () => {
        if (room && room.players[playerId] && room.players[playerId].ws === socket) {
          room.players[playerId].ws = null;
        }
      }
    );
  } catch (e) {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Fast Guildrun Server + Co-Op WebSocket listening on http://0.0.0.0:${PORT}`);
});
