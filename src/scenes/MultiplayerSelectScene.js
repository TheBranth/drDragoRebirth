import Characters from '../game/Characters.js';

export default class MultiplayerSelectScene extends Phaser.Scene {
    constructor() {
        super('MultiplayerSelectScene');
        this.selectedCharacter = null;
        this.selectionCheckmark = null;
        this.localReady = false;
        this.remoteReady = false;
        this.remoteCharacter = null;
        
        this.peer = null;
        this.conn = null;
        this.role = null; // 'host' or 'guest'
        this.localName = 'Player';
        this.remoteName = 'Opponent';

        this.remoteStatusText = null;
        this.remotePortrait = null;
        this.remoteCharNameText = null;
        this.remoteDescText = null;
    }

    preload() {
        for (const key in Characters) {
            this.load.image(key, Characters[key].portrait);
        }
        this.load.script('webfont', 'https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js');
    }

    create() {
        // --- RETRIEVE NETWORK HANDLES ---
        this.peer = this.registry.get('network_peer');
        this.conn = this.registry.get('network_connection');
        this.role = this.registry.get('network_role');
        this.localName = this.registry.get('local_player_name') || (this.role === 'host' ? 'Host' : 'Guest');

        // Reset ready statuses
        this.localReady = false;
        this.remoteReady = false;
        this.selectedCharacter = null;
        this.remoteCharacter = null;

        WebFont.load({
            google: { families: ['Roboto'] },
            active: () => {
                this.buildUI();
                this.setupNetworkListeners();
                
                // Immediately send name exchange to sync usernames
                this.sendAction({
                    action: 'exchange_names',
                    name: this.localName
                });
            }
        });
    }

    buildUI() {
        this.add.gradient = this.add.graphics();
        this.add.gradient.fillGradientStyle(0x111625, 0x111625, 0x050912, 0x050912, 1);
        this.add.gradient.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        const centerX = this.cameras.main.width / 2;
        this.add.text(centerX, 50, 'Multiplayer Race Lobby', { 
            font: 'bold 36px Roboto', 
            fill: '#ffffff' 
        }).setOrigin(0.5);

        // --- LEFT COLUMN: YOUR CHARACTER SELECT ---
        const leftX = centerX - 250;
        this.add.text(leftX, 110, `Local Player: ${this.localName}`, { font: 'bold 20px Roboto', fill: '#00ffcc' }).setOrigin(0.5);

        const characterKeys = Object.keys(Characters);
        characterKeys.forEach((key, index) => {
            const char = Characters[key];
            const y = 180 + (index * 135);

            const card = this.add.graphics();
            card.fillStyle(0xffffff, 0.05);
            card.fillRoundedRect(-180, -55, 360, 110, 10);
            card.lineStyle(1.5, 0xffffff, 0.1);
            card.strokeRoundedRect(-180, -55, 360, 110, 10);

            const container = this.add.container(leftX, y);
            container.add(card);

            const portrait = this.add.image(-130, 0, key).setScale(0.55);
            const name = this.add.text(-80, -45, char.name, { font: 'bold 16px Roboto', fill: '#ffd700' }).setOrigin(0);
            const ability = this.add.text(-80, -15, char.passiveAbility, { font: '13px Roboto', fill: '#a0aec0', wordWrap: { width: 250 } }).setOrigin(0);

            container.add([portrait, name, ability]);
            container.setSize(360, 110);
            container.setInteractive({ useHandCursor: true });

            container.on('pointerdown', () => {
                if (!this.localReady) {
                    this.selectLocalCharacter(key, container);
                }
            });
        });

        // --- RIGHT COLUMN: OPPONENT SELECTION ---
        const rightX = centerX + 200;
        this.remoteTitleText = this.add.text(rightX, 110, `Remote Player: ${this.remoteName}`, { font: 'bold 20px Roboto', fill: '#a0aec0' }).setOrigin(0.5);

        // Opponent visual card border
        const opCard = this.add.graphics();
        opCard.fillStyle(0x1d273a, 0.2);
        opCard.fillRoundedRect(-170, -150, 340, 300, 12);
        opCard.lineStyle(2, 0xffffff, 0.15);
        opCard.strokeRoundedRect(-170, -150, 340, 300, 12);

        this.opponentContainer = this.add.container(rightX, 310);
        this.opponentContainer.add(opCard);

        // Opponent profile elements
        this.remotePortrait = this.add.image(0, -60, 'professor_quantum').setScale(0.95).setVisible(false);
        this.remoteCharNameText = this.add.text(0, 15, 'Selecting character...', { font: 'bold 18px Roboto', fill: '#ffd700' }).setOrigin(0.5);
        this.remoteDescText = this.add.text(0, 50, '', { font: '14px Roboto', fill: '#ffffff', wordWrap: { width: 300 }, align: 'center' }).setOrigin(0.5);
        this.remoteStatusText = this.add.text(0, 100, 'NOT READY', { font: 'bold 18px Roboto', fill: '#ff4757' }).setOrigin(0.5);

        this.opponentContainer.add([this.remotePortrait, this.remoteCharNameText, this.remoteDescText, this.remoteStatusText]);

        // --- BOTTOM: READY BUTTON ---
        this.createReadyButton();
    }

    selectLocalCharacter(key, container) {
        this.selectedCharacter = key;

        if (this.selectionCheckmark) {
            this.selectionCheckmark.destroy();
        }

        // Green checkmark
        this.selectionCheckmark = this.add.text(container.x + 155, container.y + 15, '✔', { font: 'bold 26px Arial', fill: '#00ff66' }).setOrigin(0.5);

        // Notify remote peer
        this.sendAction({
            action: 'select_character',
            characterKey: key
        });

        this.updateReadyButtonState();
    }

    createReadyButton() {
        const centerX = this.cameras.main.width / 2;
        const buttonY = this.cameras.main.height - 80;

        this.readyButtonBg = this.add.graphics();
        this.readyButtonText = this.add.text(centerX, buttonY, 'READY UP', { font: 'bold 20px Roboto', fill: '#ffffff' }).setOrigin(0.5);
        this.statusText = this.add.text(centerX, buttonY + 35, 'Select a character to ready up', { font: '13px Roboto', fill: '#a0aec0' }).setOrigin(0.5);

        this.drawReadyButton(0x2d3748, 0.4); // Disabled state

        this.readyButtonBg.setInteractive(new Phaser.Geom.Rectangle(centerX - 120, buttonY - 25, 240, 50), Phaser.Geom.Rectangle.Contains);
        
        this.readyButtonBg.on('pointerdown', () => {
            if (this.selectedCharacter) {
                this.toggleReady();
            }
        });
    }

    drawReadyButton(color, alpha = 1.0) {
        const centerX = this.cameras.main.width / 2;
        const buttonY = this.cameras.main.height - 80;

        this.readyButtonBg.clear();
        this.readyButtonBg.fillStyle(color, alpha);
        this.readyButtonBg.fillRoundedRect(centerX - 120, buttonY - 25, 240, 50, 10);
        this.readyButtonBg.lineStyle(1.5, 0xffffff, 0.2);
        this.readyButtonBg.strokeRoundedRect(centerX - 120, buttonY - 25, 240, 50, 10);
    }

    updateReadyButtonState() {
        if (!this.selectedCharacter) return;

        if (this.localReady) {
            this.drawReadyButton(0x1e2a3e);
            this.readyButtonText.setText('CANCEL READY').setColor('#ff4757');
            this.statusText.setText('Waiting for opponent to ready up...');
        } else {
            this.drawReadyButton(0x00ff66);
            this.readyButtonText.setText('READY UP').setColor('#000000');
            this.statusText.setText('Press ready to confirm character selection.');
        }
    }

    toggleReady() {
        this.localReady = !this.localReady;
        this.updateReadyButtonState();

        this.sendAction({
            action: 'set_ready',
            ready: this.localReady
        });

        this.checkGameStartCondition();
    }

    setupNetworkListeners() {
        if (!this.conn) return;

        this.conn.off('data'); // Unbind previous listeners
        this.conn.on('data', (data) => {
            console.log('Lobby received PeerJS data:', data);

            if (data.action === 'exchange_names') {
                this.remoteName = data.name;
                this.remoteTitleText.setText(`Remote Player: ${this.remoteName}`);
                console.log(`Matched with player name: ${this.remoteName}`);
            } else if (data.action === 'select_character') {
                this.remoteCharacter = data.characterKey;
                const char = Characters[data.characterKey];

                if (char) {
                    this.remotePortrait.setTexture(data.characterKey).setVisible(true);
                    this.remoteCharNameText.setText(char.name).setColor('#ffd700');
                    this.remoteDescText.setText(char.description);
                }
            } else if (data.action === 'set_ready') {
                this.remoteReady = data.ready;
                if (data.ready) {
                    this.remoteStatusText.setText('READY').setColor('#00ff66');
                } else {
                    this.remoteStatusText.setText('NOT READY').setColor('#ff4757');
                }
                this.checkGameStartCondition();
            } else if (data.action === 'start_game') {
                // Guest receives start request from Host and runs game scene
                console.log('Received start game trigger from Host!');
                
                const configs = [
                    { name: this.role === 'host' ? this.localName : this.remoteName, character: data.hostChar, isLocal: this.role === 'host' },
                    { name: this.role === 'guest' ? this.localName : this.remoteName, character: data.guestChar, isLocal: this.role === 'guest' }
                ];

                this.scene.start('GameScene', { playerConfigs: configs, isMultiplayer: true });
            }
        });

        this.conn.on('close', () => {
            console.warn('Opponent closed the connection.');
            this.handleDisconnect();
        });
    }

    checkGameStartCondition() {
        if (this.localReady && this.remoteReady) {
            if (this.role === 'host') {
                // Host triggers game startup and broadcasts config
                console.log('Both players ready! Host launching game...');
                
                this.sendAction({
                    action: 'start_game',
                    hostChar: this.selectedCharacter,
                    guestChar: this.remoteCharacter
                });

                const configs = [
                    { name: this.localName, character: this.selectedCharacter, isLocal: true },
                    { name: this.remoteName, character: this.remoteCharacter, isLocal: false }
                ];

                this.time.delayedCall(800, () => {
                    this.scene.start('GameScene', { playerConfigs: configs, isMultiplayer: true });
                });
            } else {
                this.statusText.setText('Both ready! Waiting for host to start...');
            }
        }
    }

    sendAction(msg) {
        if (this.conn && this.conn.open) {
            this.conn.send(msg);
        }
    }

    handleDisconnect() {
        this.registry.destroy();
        if (this.peer) {
            try { this.peer.destroy(); } catch(e) {}
        }
        
        // Show overlay popup or alert, then restart
        alert('Opponent disconnected from lobby.');
        this.scene.start('IntroScene');
    }
}
