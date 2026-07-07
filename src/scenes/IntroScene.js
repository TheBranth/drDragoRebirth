import { getPlayerStats } from '../game/Player.js';

export default class IntroScene extends Phaser.Scene {
    constructor() {
        super('IntroScene');
        this.matchmakerSocket = null;
        this.peer = null;
        this.conn = null;
    }

    create() {
        // --- BACKGROUND ---
        this.add.gradient = this.add.graphics();
        this.add.gradient.fillGradientStyle(0x111625, 0x111625, 0x050912, 0x050912, 1);
        this.add.gradient.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // --- TITLE --- 
        this.add.text(centerX, centerY - 160, "Baron Blackwood's Crazy Races", {
            font: 'bold 44px Arial',
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(centerX, centerY - 110, "Inspired by a certain Madcap Chase", {
            font: 'italic 20px Arial',
            fill: '#dddddd',
            align: 'center'
        }).setOrigin(0.5);

        // --- PLAYER PROFILE & NAME INPUT (DOM overlay) ---
        const stats = getPlayerStats();
        const profileForm = this.add.dom(centerX, centerY - 20).createFromHTML(`
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; font-family: Arial; color: #fff; background: rgba(29, 39, 58, 0.45); padding: 15px 25px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.15);">
                <div style="font-size: 13px; color: #a0aec0;">
                    Your Record: ${stats.wins} Wins / ${stats.matches} Matches (Win Ratio: ${(stats.winRatio * 100).toFixed(0)}%)
                </div>
                <input type="text" id="player-name" placeholder="Enter Racer Name" value="Racer_${Math.floor(Math.random() * 900) + 100}" 
                    style="font-size: 16px; padding: 8px 12px; width: 200px; text-align: center; border-radius: 6px; border: 1px solid #4a5568; background: #1a202c; color: white; outline: none; font-weight: bold;">
            </div>
        `);

        // Check if an autosave exists
        const hasSave = typeof localStorage !== 'undefined' && localStorage.getItem('baron_blackwood_savegame') !== null;

        // --- MENU BUTTONS (container) ---
        const menuContainer = this.add.container(centerX, centerY + 80);

        let resumeButton = null;
        let startY = 0;

        if (hasSave) {
            resumeButton = this.add.text(0, startY, 'Resume Save', {
                font: 'bold 24px Arial',
                fill: '#00ffcc',
                backgroundColor: '#111c2e',
                padding: { x: 25, y: 8 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            
            resumeButton.on('pointerdown', () => {
                this.cleanup();
                this.scene.start('GameScene', { resume: true });
            });
            menuContainer.add(resumeButton);
            startY += 50;
        }

        const localButton = this.add.text(0, startY, 'Local Game (vs AI)', {
            font: '22px Arial',
            fill: '#ffffff',
            backgroundColor: '#2d3748',
            padding: { x: 25, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        localButton.on('pointerdown', () => {
            const nameInput = document.getElementById('player-name');
            const playerName = nameInput ? nameInput.value.trim() : 'Player 1';
            this.registry.set('local_player_name', playerName);
            
            this.cleanup();
            // Start local character selection
            this.scene.start('PlayerSelectScene', { selectedCharacter: 'professor_quantum' });
        });
        menuContainer.add(localButton);
        startY += 50;

        const hostPrivateButton = this.add.text(0, startY, 'Host Private Lobby', {
            font: '22px Arial',
            fill: '#00ff66',
            backgroundColor: '#1a202c',
            padding: { x: 25, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        hostPrivateButton.on('pointerdown', () => {
            const nameInput = document.getElementById('player-name');
            const playerName = nameInput ? nameInput.value.trim() : 'Host';
            this.registry.set('local_player_name', playerName);
            
            menuContainer.setVisible(false);
            profileForm.setVisible(false);
            this.showLobbyOverlay('host', null, playerName);
        });
        menuContainer.add(hostPrivateButton);
        startY += 50;

        const joinPrivateButton = this.add.text(0, startY, 'Join Private Lobby', {
            font: '22px Arial',
            fill: '#ffff00',
            backgroundColor: '#1a202c',
            padding: { x: 25, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        joinPrivateButton.on('pointerdown', () => {
            const nameInput = document.getElementById('player-name');
            const playerName = nameInput ? nameInput.value.trim() : 'Guest';
            this.registry.set('local_player_name', playerName);

            menuContainer.setVisible(false);
            profileForm.setVisible(false);
            this.showLobbyOverlay('join', null, playerName);
        });
        menuContainer.add(joinPrivateButton);
        startY += 50;

        const findMatchButton = this.add.text(0, startY, 'Find Match (Online Matchmaker)', {
            font: '22px Arial',
            fill: '#00a8ff',
            backgroundColor: '#1a202c',
            padding: { x: 25, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        findMatchButton.on('pointerdown', () => {
            const nameInput = document.getElementById('player-name');
            const playerName = nameInput ? nameInput.value.trim() : 'Racer';
            this.registry.set('local_player_name', playerName);

            menuContainer.setVisible(false);
            profileForm.setVisible(false);
            this.showLobbyOverlay('matchmake', stats.winRatio, playerName);
        });
        menuContainer.add(findMatchButton);

        // --- OVERLAY FOR STATUSES (matches matchmaking, hosting codes, joining form) ---
        this.statusOverlay = this.add.container(centerX, centerY + 80).setVisible(false);
    }

    showLobbyOverlay(mode, winRatio, playerName) {
        this.statusOverlay.removeAll(true);
        this.statusOverlay.setVisible(true);

        let html = '';
        if (mode === 'host') {
            const randomCode = this.generateRandomCode();
            html = `
                <div id="lobby-panel" style="display: flex; flex-direction: column; align-items: center; gap: 15px; color: #fff; font-family: Arial; background: rgba(17, 24, 39, 0.95); padding: 25px; border-radius: 12px; border: 2px solid #00ff66; width: 340px; box-shadow: 0 0 25px rgba(0, 255, 102, 0.25);">
                    <h3 style="margin: 0; color: #00ff66; font-size: 20px;">Hosting Private Room</h3>
                    <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #ffffff; background: #1a202c; padding: 10px 20px; border-radius: 6px; border: 1px solid #2d3748;">
                        ${randomCode}
                    </div>
                    <p id="lobby-status" style="margin: 5px 0; font-size: 14px; text-align: center; color: #a0aec0;">Initializing Peer connection...</p>
                    <button id="cancel-lobby-btn" style="background: #ff4757; color: white; border: none; padding: 10px 20px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; outline: none;">Cancel</button>
                </div>
            `;
            const dom = this.add.dom(0, 0).createFromHTML(html);
            this.statusOverlay.add(dom);

            this.initPeerHost(randomCode, playerName);
        } else if (mode === 'join') {
            html = `
                <div id="lobby-panel" style="display: flex; flex-direction: column; align-items: center; gap: 15px; color: #fff; font-family: Arial; background: rgba(17, 24, 39, 0.95); padding: 25px; border-radius: 12px; border: 2px solid #ffff00; width: 340px; box-shadow: 0 0 25px rgba(255, 255, 0, 0.25);">
                    <h3 style="margin: 0; color: #ffff00; font-size: 20px;">Join Private Room</h3>
                    <input type="text" id="room-code-input" placeholder="Enter Room Code" style="font-size: 18px; padding: 8px; width: 180px; text-align: center; border-radius: 6px; border: 1px solid #4a5568; background: #1a202c; color: white; outline: none; font-weight: bold; text-transform: uppercase;">
                    <p id="lobby-status" style="margin: 5px 0; font-size: 14px; text-align: center; color: #a0aec0;">Input 4-digit code and click Connect.</p>
                    <div style="display: flex; gap: 10px;">
                        <button id="connect-lobby-btn" style="background: #00ff66; color: black; border: none; padding: 10px 20px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; outline: none;">Connect</button>
                        <button id="cancel-lobby-btn" style="background: #ff4757; color: white; border: none; padding: 10px 20px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; outline: none;">Cancel</button>
                    </div>
                </div>
            `;
            const dom = this.add.dom(0, 0).createFromHTML(html);
            this.statusOverlay.add(dom);

            const connectBtn = dom.getChildByID('connect-lobby-btn');
            connectBtn.addEventListener('click', () => {
                const codeInput = dom.getChildByID('room-code-input').value.trim().toUpperCase();
                if (codeInput.length === 4) {
                    this.initPeerGuest(codeInput, playerName);
                } else {
                    const statusText = dom.getChildByID('lobby-status');
                    if (statusText) statusText.innerText = "Error: Code must be 4 characters.";
                }
            });
        } else if (mode === 'matchmake') {
            html = `
                <div id="lobby-panel" style="display: flex; flex-direction: column; align-items: center; gap: 15px; color: #fff; font-family: Arial; background: rgba(17, 24, 39, 0.95); padding: 25px; border-radius: 12px; border: 2px solid #00a8ff; width: 340px; box-shadow: 0 0 25px rgba(0, 168, 255, 0.25);">
                    <h3 style="margin: 0; color: #00a8ff; font-size: 20px;">Finding Opponent</h3>
                    <div style="width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.1); border-top-color: #00a8ff; border-radius: 50%; animation: spin 1s infinite linear;"></div>
                    <p id="lobby-status" style="margin: 5px 0; font-size: 14px; text-align: center; color: #a0aec0;">Connecting to matchmaking queue...</p>
                    <button id="cancel-lobby-btn" style="background: #ff4757; color: white; border: none; padding: 10px 20px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; outline: none;">Cancel</button>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </div>
            `;
            const dom = this.add.dom(0, 0).createFromHTML(html);
            this.statusOverlay.add(dom);

            this.initMatchmaking(playerName, winRatio);
        }

        // Cancel button action for all modes
        const cancelBtn = this.statusOverlay.list[0].getChildByID('cancel-lobby-btn');
        cancelBtn.addEventListener('click', () => {
            this.cleanup();
            this.scene.restart();
        });
    }

    initPeerHost(code, playerName) {
        const statusEl = document.getElementById('lobby-status');
        const peerId = `bbxr-${code}`;

        // Initialize PeerJS host
        this.peer = new Peer(peerId);

        this.peer.on('open', (id) => {
            if (statusEl) statusEl.innerText = "Lobby open. Waiting for racer to join...";
            console.log(`Hosted lobby created with peer ID: ${id}`);
        });

        this.peer.on('connection', (connection) => {
            console.log('Remote guest connected!');
            this.conn = connection;

            this.conn.on('open', () => {
                if (statusEl) statusEl.innerText = "Racer connected! Launching lobby...";
                
                // Store connection details in registry
                this.registry.set('network_peer', this.peer);
                this.registry.set('network_connection', this.conn);
                this.registry.set('network_role', 'host');
                this.registry.set('local_player_name', playerName);

                this.time.delayedCall(1000, () => {
                    this.scene.start('MultiplayerSelectScene');
                });
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer host error:', err);
            if (statusEl) statusEl.innerText = `Error: Connection lost (${err.type}).`;
        });
    }

    initPeerGuest(code, playerName) {
        const statusEl = document.getElementById('lobby-status');
        const targetPeerId = `bbxr-${code}`;

        if (statusEl) statusEl.innerText = "Connecting to host lobby...";
        
        // Initialize PeerJS client with random ID
        this.peer = new Peer();

        this.peer.on('open', () => {
            console.log('Connecting to target peer:', targetPeerId);
            this.conn = this.peer.connect(targetPeerId);

            this.conn.on('open', () => {
                if (statusEl) statusEl.innerText = "Connected to host lobby! Launching...";

                this.registry.set('network_peer', this.peer);
                this.registry.set('network_connection', this.conn);
                this.registry.set('network_role', 'guest');
                this.registry.set('local_player_name', playerName);

                this.time.delayedCall(1000, () => {
                    this.scene.start('MultiplayerSelectScene');
                });
            });

            this.conn.on('error', (err) => {
                console.error('Connection error:', err);
                if (statusEl) statusEl.innerText = "Error: Failed to connect to lobby.";
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (statusEl) statusEl.innerText = "Error: Failed to initialize network.";
        });
    }

    initMatchmaking(playerName, winRatio) {
        const statusEl = document.getElementById('lobby-status');
        
        // Connect to server WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        console.log('Connecting to matchmaking socket:', wsUrl);

        this.matchmakerSocket = new WebSocket(wsUrl);

        this.matchmakerSocket.onopen = () => {
            if (statusEl) statusEl.innerText = "Queued in lobby. Searching for closest win ratio...";
            
            // Send matchmaking request
            this.matchmakerSocket.send(JSON.stringify({
                action: 'find_match',
                name: playerName,
                winRatio: winRatio
            }));
        };

        this.matchmakerSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Matchmaker response:', data);

                if (data.action === 'match_found') {
                    if (statusEl) statusEl.innerText = `Match found! Pairing with ${data.opponent}...`;

                    const role = data.role;
                    const code = data.code;

                    if (role === 'host') {
                        // Close matchmaking socket first so we don't leak
                        this.closeMatchmaker();
                        this.initPeerHost(code, playerName);
                    } else {
                        this.closeMatchmaker();
                        // Wait briefly to allow host peer server to open
                        this.time.delayedCall(1500, () => {
                            this.initPeerGuest(code, playerName);
                        });
                    }
                }
            } catch (e) {
                console.error('Error handling matchmaker msg:', e);
            }
        };

        this.matchmakerSocket.onerror = (err) => {
            console.error('Matchmaker socket error:', err);
            if (statusEl) statusEl.innerText = "Error: Could not reach matchmaking server.";
        };

        this.matchmakerSocket.onclose = () => {
            console.log('Matchmaker socket closed.');
        };
    }

    closeMatchmaker() {
        if (this.matchmakerSocket) {
            try {
                this.matchmakerSocket.close();
            } catch (e) {}
            this.matchmakerSocket = null;
        }
    }

    cleanup() {
        this.closeMatchmaker();
        // Do not close peer/conn here because they are passed to the next scene!
    }

    generateRandomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
}
