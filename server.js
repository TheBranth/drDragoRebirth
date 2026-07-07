import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static game assets
app.use(express.static(__dirname));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

let matchmakingQueue = [];

wss.on('connection', (ws) => {
    console.log('Client connected to matchmaking WebSocket.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received WebSocket message:', data);

            if (data.action === 'find_match') {
                const name = data.name || 'Anonymous';
                const winRatio = typeof data.winRatio === 'number' ? data.winRatio : 0.0;

                // Avoid duplicate queue entry for the same socket connection
                matchmakingQueue = matchmakingQueue.filter(p => p.socket !== ws);

                console.log(`Adding ${name} (win ratio: ${winRatio}) to matchmaking queue.`);
                matchmakingQueue.push({ socket: ws, name, winRatio, addedAt: Date.now() });

                // Try to pair players
                tryMatchmaking();
            } else if (data.action === 'cancel_match') {
                console.log('Client requested matchmaking cancel.');
                matchmakingQueue = matchmakingQueue.filter(p => p.socket !== ws);
            }
        } catch (e) {
            console.error('Error handling WebSocket message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected from matchmaking.');
        matchmakingQueue = matchmakingQueue.filter(p => p.socket !== ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket connection error:', err);
        matchmakingQueue = matchmakingQueue.filter(p => p.socket !== ws);
    });
});

function tryMatchmaking() {
    // Need at least 2 players to form a match
    if (matchmakingQueue.length < 2) return;

    // Sort queue by win ratio to easily compare neighbors
    matchmakingQueue.sort((a, b) => a.winRatio - b.winRatio);

    const maxWinRatioDiff = 0.15; // Threshold for matching win ratios

    for (let i = 0; i < matchmakingQueue.length - 1; i++) {
        const playerA = matchmakingQueue[i];
        const playerB = matchmakingQueue[i + 1];

        const diff = Math.abs(playerA.winRatio - playerB.winRatio);
        if (diff <= maxWinRatioDiff) {
            // Found a valid match!
            const roomCode = generateRoomCode();
            console.log(`Matched! pairing ${playerA.name} and ${playerB.name}. Room Code: ${roomCode}`);

            // Send confirmation (one is designated Host/PeerJS server receiver, other joins)
            playerA.socket.send(JSON.stringify({
                action: 'match_found',
                role: 'host',
                code: roomCode,
                opponent: playerB.name
            }));

            playerB.socket.send(JSON.stringify({
                action: 'match_found',
                role: 'guest',
                code: roomCode,
                opponent: playerA.name
            }));

            // Remove matched players from queue
            matchmakingQueue = matchmakingQueue.filter(p => p !== playerA && p !== playerB);

            // Recursively search for more matches
            tryMatchmaking();
            return;
        }
    }

    // Proximity fallback: If players have been waiting in queue for over 10 seconds, pair them regardless of win ratio
    const now = Date.now();
    const longWaitingPlayers = matchmakingQueue.filter(p => (now - p.addedAt) > 10000);
    if (longWaitingPlayers.length >= 2) {
        // Sort by longest waiting
        longWaitingPlayers.sort((a, b) => a.addedAt - b.addedAt);
        const playerA = longWaitingPlayers[0];
        const playerB = longWaitingPlayers[1];

        const roomCode = generateRoomCode();
        console.log(`Matchmaking timeout fallback! Pairing ${playerA.name} and ${playerB.name}. Room Code: ${roomCode}`);

        playerA.socket.send(JSON.stringify({
            action: 'match_found',
            role: 'host',
            code: roomCode,
            opponent: playerB.name
        }));

        playerB.socket.send(JSON.stringify({
            action: 'match_found',
            role: 'guest',
            code: roomCode,
            opponent: playerA.name
        }));

        matchmakingQueue = matchmakingQueue.filter(p => p !== playerA && p !== playerB);
        tryMatchmaking();
    }
}

function generateRoomCode() {
    // Generate a clean 4-letter room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid O, 0, I, 1 confusion
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

server.listen(port, () => {
    console.log(`Baron Blackwood web server running at http://localhost:${port}`);
});
