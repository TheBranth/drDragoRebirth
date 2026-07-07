import { WebSocket } from 'ws';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- STARTING WEBSOCKET MATCHMAKING TESTS ---');

// Start server as a child process on port 3001 to avoid conflicts
const serverPath = path.join(__dirname, '..', '..', 'server.js');
console.log('Spawning matchmaking server from path:', serverPath);
const serverProc = fork(serverPath, [], {
    env: { ...process.env, PORT: '3001' },
    silent: true
});

let testPassed = true;

// Wait for server to boot
setTimeout(() => {
    runTests();
}, 2000);

function runTests() {
    console.log('Connecting test WebSocket clients to ws://localhost:3001...');
    
    const wsUrl = 'ws://localhost:3001';
    const clientA = new WebSocket(wsUrl);
    const clientB = new WebSocket(wsUrl);

    let clientAReceivedMatch = false;
    let clientBReceivedMatch = false;
    let matchedCode = null;

    clientA.on('open', () => {
        console.log('Client Alice connected. Queuing with winRatio = 0.70');
        clientA.send(JSON.stringify({
            action: 'find_match',
            name: 'Alice',
            winRatio: 0.70
        }));
    });

    clientB.on('open', () => {
        // Wait 200ms to let Alice queue first
        setTimeout(() => {
            console.log('Client Bob connected. Queuing with winRatio = 0.75');
            clientB.send(JSON.stringify({
                action: 'find_match',
                name: 'Bob',
                winRatio: 0.75
            }));
        }, 200);
    });

    clientA.on('message', (message) => {
        const data = JSON.parse(message);
        console.log('Alice received message:', data);
        if (data.action === 'match_found') {
            clientAReceivedMatch = true;
            matchedCode = data.code;
            if (data.role !== 'host') {
                console.error('FAIL: Alice was not designated Host.');
                testPassed = false;
            }
        }
    });

    clientB.on('message', (message) => {
        const data = JSON.parse(message);
        console.log('Bob received message:', data);
        if (data.action === 'match_found') {
            clientBReceivedMatch = true;
            if (data.code !== matchedCode) {
                console.error('FAIL: Bob received a different room code.');
                testPassed = false;
            }
            if (data.role !== 'guest') {
                console.error('FAIL: Bob was not designated Guest.');
                testPassed = false;
            }
            
            // Check final status
            verifyAndCleanup();
        }
    });

    function verifyAndCleanup() {
        if (clientAReceivedMatch && clientBReceivedMatch && testPassed) {
            console.log('PASS: Alice and Bob matched successfully by win ratio proximity!');
        } else {
            console.error('FAIL: Matchmaking test did not satisfy constraints.');
            testPassed = false;
        }

        // Close sockets
        clientA.close();
        clientB.close();

        // Kill server process
        serverProc.kill();
        
        console.log('--- ALL MATCHMAKING TESTS COMPLETED ---');
        process.exit(testPassed ? 0 : 1);
    }

    // Safeguard timeout
    setTimeout(() => {
        console.error('FAIL: Test timed out before receiving match confirmations.');
        serverProc.kill();
        process.exit(1);
    }, 8000);
}
