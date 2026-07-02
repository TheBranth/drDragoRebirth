import Game from '../game/Game.js';
import Characters from '../game/Characters.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.selectedCharacter = null;
    }

    init(data) {
        this.selectedCharacter = data.selectedCharacter;
    }

    preload() {
        this.load.image('europe_map', 'assets/images/europe_map.png');
    }

    create() {
        // --- SETUP THE GAME ---
        const availableCharacters = Object.keys(Characters);
        const opponentCharacter = availableCharacters.find(key => key !== this.selectedCharacter) || availableCharacters[0];
        const playerConfigs = [
            { name: 'Player 1', character: this.selectedCharacter },
            { name: 'Player 2', character: opponentCharacter }
        ];
        this.game = new Game(playerConfigs);
        const board = this.game.board;
        const nodes = board.getNodes();

        // --- MAP AND CAMERA ---
        const mapImage = this.add.image(0, 0, 'europe_map').setOrigin(0, 0);
        this.cameras.main.setBounds(0, 0, 4096, 4096);
        
        // Start camera centered on Prague (Index 399: x=156, y=121)
        const pragueX = 156 * 16 + 8;
        const pragueY = 121 * 16 + 8;
        this.cameras.main.centerOn(pragueX, pragueY);
        this.cameras.main.setZoom(1);

        // --- DRAW NODE GLOW & CONNECTIONS ---
        const connectionGraphics = this.add.graphics();
        connectionGraphics.lineStyle(2, 0xffffff, 0.2);

        nodes.forEach((node, index) => {
            const px = node.x * 16 + 8;
            const py = node.y * 16 + 8;

            // Draw connections to neighbors (only draw forward links to avoid duplicates)
            node.neighbors.forEach(neighborIndex => {
                if (neighborIndex !== null && neighborIndex > index) {
                    const neighbor = board.findNodeById(neighborIndex);
                    if (neighbor) {
                        connectionGraphics.beginPath();
                        connectionGraphics.moveTo(px, py);
                        connectionGraphics.lineTo(neighbor.x * 16 + 8, neighbor.y * 16 + 8);
                        connectionGraphics.strokePath();
                    }
                }
            });
        });

        // --- DRAW DYNAMIC NODES ---
        this.nodeMarkers = [];
        const typeColors = {
            'blue': 0x00a8ff,
            'red': 0xff4757,
            'yellow': 0xeccc68,
            'purple': 0xa4b0be,
            'city': 0xffa502,
            'capital': 0xff7f50,
            'view': 0x7bed9f
        };

        nodes.forEach((node, index) => {
            const px = node.x * 16 + 8;
            const py = node.y * 16 + 8;
            const color = typeColors[node.type] || 0xffffff;

            let size = node.type === 'capital' ? 7 : (node.type === 'city' ? 6 : 4);
            const circle = this.add.circle(px, py, size, color, 0.9);
            circle.setStrokeStyle(1.5, 0xffffff, 0.7);

            // Add interactivity to nodes
            circle.setInteractive({ useHandCursor: true });
            circle.on('pointerover', () => {
                this.nodeLabel.setText(node.name ? `${node.name} (${node.type.toUpperCase()})` : `Space (${node.type.toUpperCase()})`);
                this.nodeLabel.setVisible(true);
            });
            circle.on('pointerout', () => {
                this.nodeLabel.setVisible(false);
            });

            this.nodeMarkers.push(circle);
        });

        // --- PLAYER SPRITES ---
        this.playerSprites = [];
        const playerColors = [0x0084ff, 0x00ff66];
        this.game.players.forEach((player, idx) => {
            const startNode = board.findNodeById(player.currentNodeIndex);
            const px = startNode.x * 16 + 8;
            const py = startNode.y * 16 + 8;

            const playerContainer = this.add.container(px, py);
            const body = this.add.circle(0, 0, 10, playerColors[idx], 1);
            body.setStrokeStyle(2, 0xffffff, 1);
            
            // Add a visual indicator showing the player's initials
            const text = this.add.text(0, 0, player.name.substring(0, 2).toUpperCase(), {
                fontSize: '10px',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            playerContainer.add([body, text]);
            this.playerSprites.push(playerContainer);
        });

        // --- DRAGO SPRITE ---
        const dragoNode = board.findNodeById(this.game.dragoPosition);
        this.dragoSprite = this.add.circle(dragoNode.x * 16 + 8, dragoNode.y * 16 + 8, 9, 0xff0000, 0.8);
        this.dragoSprite.setStrokeStyle(2, 0xffff00, 1);
        const dragoText = this.add.text(dragoNode.x * 16 + 8, dragoNode.y * 16 + 8, 'DR', {
            fontSize: '9px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.dragoText = dragoText;

        // --- CAMERA CONTROLS (PAN & ZOOM) ---
        this.input.on('pointermove', pointer => {
            if (!pointer.isDown) return;
            this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
            this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
        });

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            let newZoom = this.cameras.main.zoom - deltaY * 0.001;
            newZoom = Phaser.Math.Clamp(newZoom, 0.5, 3.0);
            this.cameras.main.setZoom(newZoom);
        });

        // --- KEYBOARD INPUT FOR INTERACTIVE MOVEMENT ---
        this.cursors = this.input.keyboard.createCursorKeys();
        this.input.keyboard.on('keydown', event => {
            const currentPlayer = this.game.players[this.game.currentPlayerIndex];
            if (currentPlayer.movesRemaining > 0 || currentPlayer.pathHistory.length > 1) {
                let direction = -1;
                if (event.key === 'ArrowUp') direction = 0;
                else if (event.key === 'ArrowRight') direction = 1;
                else if (event.key === 'ArrowDown') direction = 2;
                else if (event.key === 'ArrowLeft') direction = 3;

                if (direction !== -1) {
                    this.handleStepMove(direction);
                }

                if (event.key === 'Enter' && currentPlayer.movesRemaining === 0) {
                    this.finishTurn();
                }
            }
        });

        // --- MODERN UI PANEL ---
        this.setupUI();

        // --- START GAME ---
        this.game.startGame();
        this.updateUIStatus();
        this.centerOnActivePlayer();
    }

    setupUI() {
        const width = this.cameras.main.width;

        // Floating Header Status Bar (Glassmorphism look)
        const headerBg = this.add.graphics();
        headerBg.fillStyle(0x111625, 0.85);
        headerBg.fillRoundedRect(20, 20, 480, 80, 12);
        headerBg.lineStyle(1.5, 0xffffff, 0.15);
        headerBg.strokeRoundedRect(20, 20, 480, 80, 12);
        headerBg.setScrollFactor(0);

        this.statusText = this.add.text(40, 32, 'Initializing Game...', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setScrollFactor(0);

        this.movesText = this.add.text(40, 62, 'Roll the dice to start moving.', {
            fontSize: '14px',
            color: '#a0aec0',
            fontFamily: 'Arial'
        }).setScrollFactor(0);

        // Control Panel
        const controlBg = this.add.graphics();
        controlBg.fillStyle(0x111625, 0.85);
        controlBg.fillRoundedRect(20, 120, 200, 180, 12);
        controlBg.lineStyle(1.5, 0xffffff, 0.15);
        controlBg.strokeRoundedRect(20, 120, 200, 180, 12);
        controlBg.setScrollFactor(0);

        this.rollButton = this.add.text(40, 140, '🎲 Roll Dice', {
            fontSize: '20px',
            color: '#00ff66',
            backgroundColor: '#1d273a',
            padding: { x: 16, y: 10 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0)
          .setInteractive({ useHandCursor: true })
          .setScrollFactor(0)
          .on('pointerdown', () => this.rollDicePhase())
          .on('pointerover', () => this.rollButton.setStyle({ color: '#ffffff', backgroundColor: '#28364f' }))
          .on('pointerout', () => this.rollButton.setStyle({ color: '#00ff66', backgroundColor: '#1d273a' }));

        this.endTurnButton = this.add.text(40, 220, '🏁 Confirm Turn', {
            fontSize: '18px',
            color: '#a0aec0',
            backgroundColor: '#161d2d',
            padding: { x: 14, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0)
          .setScrollFactor(0);

        // Hover Node Label
        this.nodeLabel = this.add.text(width / 2, 40, '', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#111625',
            padding: { x: 12, y: 6 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

        // Sightseeing FACT modal UI (hidden by default)
        this.factModal = this.add.container(width / 2, this.cameras.main.height / 2).setScrollFactor(0).setVisible(false);
        const modalBack = this.add.graphics();
        modalBack.fillStyle(0x0e131f, 0.95);
        modalBack.fillRoundedRect(-300, -150, 600, 300, 16);
        modalBack.lineStyle(2, 0x00a8ff, 0.8);
        modalBack.strokeRoundedRect(-300, -150, 600, 300, 16);

        this.factTitle = this.add.text(0, -110, 'SIGHTSEEING LANDMARK', {
            fontSize: '22px',
            color: '#00a8ff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.factDesc = this.add.text(0, -40, '', {
            fontSize: '15px',
            color: '#e2e8f0',
            fontFamily: 'Arial',
            align: 'center',
            wordWrap: { width: 520, useAdvancedWrap: true }
        }).setOrigin(0.5);

        const closeBtn = this.add.text(0, 90, 'CLOSE', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#00a8ff',
            padding: { x: 24, y: 10 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.closeFactModal());

        this.factModal.add([modalBack, this.factTitle, this.factDesc, closeBtn]);
    }

    rollDicePhase() {
        this.rollButton.disableInteractive().setAlpha(0.3);
        const result = this.game.startTurn();
        this.updateUIStatus();
        this.highlightNeighbors();
    }

    handleStepMove(direction) {
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const board = this.game.board;
        const currentNode = board.findNodeById(currentPlayer.currentNodeIndex);
        if (!currentNode) return;

        const targetNodeIndex = currentNode.neighbors[direction];
        if (targetNodeIndex === null) return; // No path in that direction

        const oldNodeIndex = currentPlayer.currentNodeIndex;
        const success = currentPlayer.moveTo(targetNodeIndex, board);

        if (success) {
            this.updateUIStatus();
            this.highlightNeighbors();

            // Smooth tween movement
            const targetNode = board.findNodeById(currentPlayer.currentNodeIndex);
            const tx = targetNode.x * 16 + 8;
            const ty = targetNode.y * 16 + 8;

            this.tweens.add({
                targets: this.playerSprites[this.game.currentPlayerIndex],
                x: tx,
                y: ty,
                duration: 250,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.centerOnActivePlayer();
                    // If arrived at view node and movesRemaining == 0, trigger sightseeing popup
                    if (currentPlayer.movesRemaining === 0 && targetNode.type === 'view') {
                        this.showSightseeingFact(targetNode);
                    }
                }
            });
        }
    }

    highlightNeighbors() {
        // Reset all nodes opacity
        this.nodeMarkers.forEach(m => m.setAlpha(0.6));

        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        if (currentPlayer.movesRemaining > 0 || currentPlayer.pathHistory.length > 1) {
            const board = this.game.board;
            const currentNode = board.findNodeById(currentPlayer.currentNodeIndex);
            if (currentNode) {
                // Highlight valid neighboring directions
                currentNode.neighbors.forEach(neighborIndex => {
                    if (neighborIndex !== null) {
                        this.nodeMarkers[neighborIndex].setAlpha(1.0);
                    }
                });
            }
        }
    }

    showSightseeingFact(node) {
        this.factTitle.setText(node.name ? node.name.toUpperCase() : 'LOCAL LANDMARK');
        this.factDesc.setText(node.text || 'A beautiful historical site to visit along your rally journey.');
        this.factModal.setVisible(true);
    }

    closeFactModal() {
        this.factModal.setVisible(false);
    }

    finishTurn() {
        this.endTurnButton.disableInteractive().setAlpha(0.3).setStyle({ color: '#a0aec0', backgroundColor: '#161d2d' });
        this.game.endTurn();

        // Animate Dr. Drago move
        const dragoNode = this.game.board.findNodeById(this.game.dragoPosition);
        const dx = dragoNode.x * 16 + 8;
        const dy = dragoNode.y * 16 + 8;

        this.tweens.add({
            targets: [this.dragoSprite, this.dragoText],
            x: dx,
            y: dy,
            duration: 400,
            ease: 'Quad.easeInOut'
        });

        // Setup for next player
        this.updateUIStatus();
        this.rollButton.setInteractive({ useHandCursor: true }).setAlpha(1);
        this.highlightNeighbors();
        this.centerOnActivePlayer();
    }

    centerOnActivePlayer() {
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const node = this.game.board.findNodeById(currentPlayer.currentNodeIndex);
        const px = node.x * 16 + 8;
        const py = node.y * 16 + 8;

        this.cameras.main.pan(px, py, 500, 'Quad.easeInOut');
    }

    updateUIStatus() {
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const currentNode = this.game.board.findNodeById(currentPlayer.currentNodeIndex);

        this.statusText.setText(`Turn: ${currentPlayer.name} (${currentNode.name || 'En Route'})`);

        if (currentPlayer.movesRemaining > 0) {
            this.movesText.setText(`Moves Remaining: ${currentPlayer.movesRemaining} | Use arrow keys to travel.`);
            this.endTurnButton.disableInteractive().setAlpha(0.3).setStyle({ color: '#a0aec0', backgroundColor: '#161d2d' });
        } else if (currentPlayer.pathHistory.length > 1) {
            this.movesText.setText('Out of moves! Press ENTER or click Confirm Turn.');
            this.endTurnButton.setInteractive({ useHandCursor: true })
                .setAlpha(1)
                .setStyle({ color: '#ffffff', backgroundColor: '#00ff66' })
                .off('pointerdown')
                .on('pointerdown', () => this.finishTurn())
                .on('pointerover', () => this.endTurnButton.setStyle({ backgroundColor: '#00e65c' }))
                .on('pointerout', () => this.endTurnButton.setStyle({ backgroundColor: '#00ff66' }));
        } else {
            this.movesText.setText('Roll the dice to start moving.');
            this.endTurnButton.disableInteractive().setAlpha(0.3).setStyle({ color: '#a0aec0', backgroundColor: '#161d2d' });
        }
    }
}
