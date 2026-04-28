const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const indexPath = path.join(rootDir, "index.html");
const dataDir = path.join(rootDir, "data");
const saveFilePath = path.join(dataDir, "saves.json");

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(saveFilePath)) {
    fs.writeFileSync(saveFilePath, JSON.stringify({}, null, 2), "utf8");
  }
}

function readSaveStore() {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(saveFilePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    return {};
  }
}

function writeSaveStore(store) {
  ensureDataStore();
  fs.writeFileSync(saveFilePath, JSON.stringify(store, null, 2), "utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response) {
  fs.readFile(indexPath, (error, file) => {
    if (error) {
      sendJson(response, 500, { error: "index.html을 읽을 수 없습니다." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(file);
  });
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("payload too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    version: Number(payload.version || 0),
    currentCharacter: typeof payload.currentCharacter === "string" ? payload.currentCharacter : "itadori",
    lookSensitivity: Number(payload.lookSensitivity || 0.002),
    screenShakeEnabled: Boolean(payload.screenShakeEnabled),
    tutorialHintsEnabled: Boolean(payload.tutorialHintsEnabled),
    questRound: Math.max(0, Number(payload.questRound || 0)),
    coins: Math.max(0, Number(payload.coins || 0)),
    cursedFingers: Math.max(0, Number(payload.cursedFingers || 0)),
    sukunaUnlocked: Boolean(payload.sukunaUnlocked),
    hiddenQuestCompleted: Boolean(payload.hiddenQuestCompleted),
    hiddenQuestHintSeen: Boolean(payload.hiddenQuestHintSeen),
    ownedSkins: payload.ownedSkins && typeof payload.ownedSkins === "object" ? payload.ownedSkins : {},
    equippedSkin: typeof payload.equippedSkin === "string" ? payload.equippedSkin : "default"
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/save") {
    if (request.method === "GET") {
      const playerId = url.searchParams.get("playerId");
      if (!playerId) {
        sendJson(response, 400, { error: "playerId가 필요합니다." });
        return;
      }
      const store = readSaveStore();
      sendJson(response, 200, { payload: store[playerId] || null });
      return;
    }

    if (request.method === "POST") {
      try {
        const rawBody = await collectBody(request);
        const parsed = JSON.parse(rawBody || "{}");
        const playerId = typeof parsed.playerId === "string" ? parsed.playerId.trim() : "";
        const payload = sanitizePayload(parsed.payload);
        if (!playerId || !payload) {
          sendJson(response, 400, { error: "잘못된 저장 요청입니다." });
          return;
        }
        const store = readSaveStore();
        store[playerId] = payload;
        writeSaveStore(store);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 400, { error: "저장 데이터를 처리하지 못했습니다." });
      }
      return;
    }

    if (request.method === "DELETE") {
      const playerId = url.searchParams.get("playerId");
      if (!playerId) {
        sendJson(response, 400, { error: "playerId가 필요합니다." });
        return;
      }
      const store = readSaveStore();
      delete store[playerId];
      writeSaveStore(store);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 405, { error: "허용되지 않은 메서드입니다." });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendHtml(response);
    return;
  }

  sendJson(response, 404, { error: "요청한 경로를 찾을 수 없습니다." });
});

server.listen(port, host, () => {
  console.log(`Black Flash Arena server running at http://${host}:${port}`);
});
