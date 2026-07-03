import Game, { CARD_TEMPLATES } from '../game/Game.js';
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
        this.load.image('europe_map', 'assets/images/modern_europe.png');
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
        mapImage.setDisplaySize(4096, 4096);
        this.cameras.main.setBounds(0, 0, 4096, 4096);
        
        // Start camera centered on Prague (Index 399: x=156, y=121)
        const pragueX = 156 * 16 + 8;
        const pragueY = 121 * 16 + 8;
        this.cameras.main.centerOn(pragueX, pragueY);
        this.cameras.main.setZoom(1);

        // --- DRAW NODE GLOW & CONNECTIONS ---
        const connectionGraphics = this.add.graphics();

        nodes.forEach((node, index) => {
            const px = node.x * 16 + 8;
            const py = node.y * 16 + 8;

            // Draw connections to neighbors (only draw forward links to avoid duplicates)
            node.neighbors.forEach((neighborIndex, dir) => {
                if (neighborIndex !== null && neighborIndex > index) {
                    const neighbor = board.findNodeById(neighborIndex);
                    if (neighbor) {
                        const isWater = node.flight[dir] === 1;
                        if (isWater) {
                            connectionGraphics.lineStyle(2.5, 0x00a8ff, 0.85); // Dashed electric blue
                            this.drawDashedLine(connectionGraphics, px, py, neighbor.x * 16 + 8, neighbor.y * 16 + 8, 8, 6);
                        } else {
                            connectionGraphics.lineStyle(3, 0xf1f2f6, 0.7); // Solid silver road
                            connectionGraphics.beginPath();
                            connectionGraphics.moveTo(px, py);
                            connectionGraphics.lineTo(neighbor.x * 16 + 8, neighbor.y * 16 + 8);
                            connectionGraphics.strokePath();
                        }
                    }
                }
            });
        });

        // --- TARGET CAPITAL GLOW MARKER ---
        this.targetGlow = this.add.graphics();
        this.updateTargetCapitalMarker();

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

            let size = node.type === 'capital' ? 8 : (node.type === 'city' ? 6 : 4);
            const circle = this.add.circle(px, py, size, color, 0.9);
            circle.setStrokeStyle(1.5, 0xffffff, 0.7);

            // Node hover interactivity
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
            const body = this.add.circle(0, 0, 12, playerColors[idx], 1);
            body.setStrokeStyle(2, 0xffffff, 1);
            
            const text = this.add.text(0, 0, player.name.substring(0, 2).toUpperCase(), {
                fontSize: '11px',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            playerContainer.add([body, text]);
            this.playerSprites.push(playerContainer);
        });

        // --- BARON BLACKWOOD SPRITE ---
        const blackwoodNode = board.findNodeById(this.game.blackwoodPosition);
        this.blackwoodContainer = this.add.container(blackwoodNode.x * 16 + 8, blackwoodNode.y * 16 + 8);
        const blackwoodBody = this.add.circle(0, 0, 11, 0xff0000, 0.9);
        blackwoodBody.setStrokeStyle(2.5, 0xffff00, 1);
        const blackwoodText = this.add.text(0, 0, 'BB', {
            fontSize: '10px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.blackwoodContainer.add([blackwoodBody, blackwoodText]);

        // --- CAMERA PAN & ZOOM ---
        this.input.on('pointermove', pointer => {
            if (!pointer.isDown) return;
            this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
            this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
        });

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            let newZoom = this.cameras.main.zoom - deltaY * 0.001;
            newZoom = Phaser.Math.Clamp(newZoom, 0.4, 2.5);
            this.cameras.main.setZoom(newZoom);
        });

        // --- KEYBOARD ARROW MOVEMENT ---
        this.input.keyboard.on('keydown', event => {
            const currentPlayer = this.game.players[this.game.currentPlayerIndex];
            
            // Only allow movement if player has rolled and has moves left OR can backtrack
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

        // --- HUD & INTERFACE ---
        this.setupUI();

        // --- START GAME ---
        this.game.startGame();
        this.updateUIStatus();
        this.centerOnActivePlayer();
    }

    setupUI() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Floating Header (Status panel)
        const headerBg = this.add.graphics();
        headerBg.fillStyle(0x111625, 0.9);
        headerBg.fillRoundedRect(20, 20, 520, 90, 12);
        headerBg.lineStyle(2, 0x8c6d58, 0.4);
        headerBg.strokeRoundedRect(20, 20, 520, 90, 12);
        headerBg.setScrollFactor(0);

        this.statusText = this.add.text(40, 32, 'Initializing Game...', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setScrollFactor(0);

        this.movesText = this.add.text(40, 58, 'Roll dice to start moving.', {
            fontSize: '14px',
            color: '#a0aec0',
            fontFamily: 'Arial'
        }).setScrollFactor(0);

        this.playerBalanceText = this.add.text(40, 80, '', {
            fontSize: '13px',
            color: '#00ff66',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setScrollFactor(0);

        // Control Panel
        const controlBg = this.add.graphics();
        controlBg.fillStyle(0x111625, 0.9);
        controlBg.fillRoundedRect(20, 130, 200, 190, 12);
        controlBg.lineStyle(2, 0x8c6d58, 0.4);
        controlBg.strokeRoundedRect(20, 130, 200, 190, 12);
        controlBg.setScrollFactor(0);

        this.rollButton = this.add.text(40, 150, '🎲 Roll Dice', {
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

        this.endTurnButton = this.add.text(40, 230, '🏁 Confirm Turn', {
            fontSize: '18px',
            color: '#a0aec0',
            backgroundColor: '#161d2d',
            padding: { x: 14, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0).setScrollFactor(0);

        // Compass HUD (Top Right)
        this.compassContainer = this.add.container(width - 150, 70).setScrollFactor(0);
        const compassBg = this.add.graphics();
        compassBg.fillStyle(0x111625, 0.9);
        compassBg.fillCircle(0, 0, 45);
        compassBg.lineStyle(2.5, 0x8c6d58, 0.5);
        compassBg.strokeCircle(0, 0, 45);

        this.compassNeedle = this.add.graphics();
        this.compassNeedle.fillStyle(0xff4757, 1); // Red arrow tip
        this.compassNeedle.fillTriangle(0, -35, -7, -10, 7, -10);
        this.compassNeedle.fillStyle(0x7f8c8d, 1); // Gray tail
        this.compassNeedle.fillTriangle(0, 35, -7, 10, 7, 10);

        this.compassText = this.add.text(0, 55, '', {
            fontSize: '12px',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            backgroundColor: '#111625',
            padding: { x: 8, y: 4 }
        }).setOrigin(0.5);

        this.compassContainer.add([compassBg, this.compassNeedle, this.compassText]);

        // Hover Node Label
        this.nodeLabel = this.add.text(width / 2, 40, '', {
            fontSize: '15px',
            color: '#ffffff',
            backgroundColor: '#111625',
            padding: { x: 12, y: 6 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

        // Card Drawer UI (Fixed Bottom Panel)
        this.cardDrawer = this.add.container(width / 2, height - 85).setScrollFactor(0);
        this.cardDrawerBg = this.add.graphics();
        this.cardDrawerBg.fillStyle(0x0e131f, 0.92);
        this.cardDrawerBg.fillRoundedRect(-400, -50, 800, 100, 16);
        this.cardDrawerBg.lineStyle(2, 0x8c6d58, 0.4);
        this.cardDrawerBg.strokeRoundedRect(-400, -50, 800, 100, 16);
        
        this.cardDrawerTitle = this.add.text(0, -42, 'FEATURE CARD HAND', {
            fontSize: '11px',
            color: '#a0aec0',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.cardButtonsContainer = this.add.container(0, 5);
        this.cardDrawer.add([this.cardDrawerBg, this.cardDrawerTitle, this.cardButtonsContainer]);

        // Dynamic Modals Container
        this.modalOverlay = this.add.container(0, 0).setScrollFactor(0).setVisible(false);
        const overlayBg = this.add.graphics();
        overlayBg.fillStyle(0x000000, 0.65);
        overlayBg.fillRect(0, 0, width, height);

        this.modalBox = this.add.container(width / 2, height / 2);
        const boxBg = this.add.graphics();
        boxBg.fillStyle(0x111625, 0.98);
        boxBg.fillRoundedRect(-280, -180, 560, 360, 16);
        boxBg.lineStyle(2.5, 0x8c6d58, 0.6);
        boxBg.strokeRoundedRect(-280, -180, 560, 360, 16);

        this.modalTitle = this.add.text(0, -140, '', {
            fontSize: '22px',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.modalBody = this.add.text(0, -80, '', {
            fontSize: '15px',
            color: '#cbd5e0',
            fontFamily: 'Arial',
            align: 'center',
            wordWrap: { width: 500 }
        }).setOrigin(0.5);

        this.modalButtons = this.add.container(0, 20);

        this.modalBox.add([boxBg, this.modalTitle, this.modalBody, this.modalButtons]);
        this.modalOverlay.add([overlayBg, this.modalBox]);
    }

    updateTargetCapitalMarker() {
        this.targetGlow.clear();
        if (this.game.targetCapitalIndex === null) return;

        const board = this.game.board;
        const targetNode = board.findNodeById(this.game.targetCapitalIndex);
        if (targetNode) {
            const tx = targetNode.x * 16 + 8;
            const ty = targetNode.y * 16 + 8;

            this.targetGlow.lineStyle(2, 0xffd700, 0.85); // Pulsing Gold ring
            this.targetGlow.strokeCircle(tx, ty, 15);
            
            // Add a pulsating tween effect
            this.tweens.add({
                targets: this.targetGlow,
                alpha: { from: 1, to: 0.2 },
                duration: 1200,
                yoyo: true,
                repeat: -1
            });
        }
    }

    rollDicePhase() {
        this.rollButton.disableInteractive().setAlpha(0.3);
        const result = this.game.startTurn();

        if (result.skipped) {
            // Player turn skipped
            this.showEventModal('TURN SKIPPED', `${result.player.name}'s turn is skipped due to a freeze effect!`, () => {
                this.finishTurn();
            });
            return;
        }

        // Check if Blackwood event occurred
        if (result.blackwoodEvent) {
            this.showEventModal("BARON BLACKWOOD'S SABOTAGE!", result.blackwoodEvent.msg, () => {
                this.updateUIStatus();
                this.highlightNeighbors();
            });
        } else {
            this.updateUIStatus();
            this.highlightNeighbors();
        }
    }

    handleStepMove(direction) {
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const board = this.game.board;
        const currentNode = board.findNodeById(currentPlayer.currentNodeIndex);
        if (!currentNode) return;

        const targetNodeIndex = currentNode.neighbors[direction];
        if (targetNodeIndex === null) return; // No connection

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
                    
                    // Check for "hot potato" Baron Blackwood curse passing
                    const transfer = this.game.checkCurseTransfer();
                    if (transfer) {
                        // Smoothly snap Blackwood to new player container
                        this.tweens.add({
                            targets: this.blackwoodContainer,
                            x: tx,
                            y: ty,
                            duration: 300,
                            ease: 'Quad.easeInOut'
                        });
                        this.showEventModal('CURSE PASSED!', `${transfer.from.name} passed the Baron Blackwood curse to ${transfer.to.name}!`, () => {});
                    }
                }
            });
        }
    }

    highlightNeighbors() {
        this.nodeMarkers.forEach(m => m.setAlpha(0.5));

        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        if (currentPlayer.movesRemaining > 0 || currentPlayer.pathHistory.length > 1) {
            const board = this.game.board;
            const currentNode = board.findNodeById(currentPlayer.currentNodeIndex);
            if (currentNode) {
                currentNode.neighbors.forEach(neighborIndex => {
                    if (neighborIndex !== null) {
                        this.nodeMarkers[neighborIndex].setAlpha(1.0);
                    }
                });
            }
        }
    }

    finishTurn() {
        this.endTurnButton.disableInteractive().setAlpha(0.3).setStyle({ color: '#a0aec0', backgroundColor: '#161d2d' });
        
        // Execute landing node rules
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const landResult = this.game.landOnNode(currentPlayer);

        if (landResult) {
            if (landResult.type === 'yellow') {
                this.showYellowModal(landResult);
            } else if (landResult.type === 'purple') {
                this.showPurpleModal();
            } else if (landResult.type === 'property') {
                this.showPropertyModal(landResult.node);
            } else if (landResult.type === 'blue') {
                this.showBlueModal(landResult);
            } else if (landResult.type === 'red') {
                this.showRedModal(landResult);
            } else {
                this.completeTurnEnding();
            }
        } else {
            this.completeTurnEnding();
        }
    }

    completeTurnEnding() {
        const winDetails = this.game.endTurn();

        // Animate Baron Blackwood position update
        const blackwoodNode = this.game.board.findNodeById(this.game.blackwoodPosition);
        const dx = blackwoodNode.x * 16 + 8;
        const dy = blackwoodNode.y * 16 + 8;
        this.tweens.add({
            targets: this.blackwoodContainer,
            x: dx,
            y: dy,
            duration: 400,
            ease: 'Quad.easeInOut'
        });

        if (winDetails) {
            // Stage was won! Show modal
            this.showEventModal('STAGE CLEARED!', `🏆 ${winDetails.winner.name} reached ${winDetails.oldTargetName} and gets $${winDetails.prize.toLocaleString()}!\n\nNext Destination: ${winDetails.newTargetName}.\n💀 Baron Blackwood moved to haunt ${winDetails.furthestPlayer.name}!`, () => {
                this.updateTargetCapitalMarker();
                this.advanceToNextTurn();
            });
        } else {
            this.advanceToNextTurn();
        }
    }

    advanceToNextTurn() {
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

    update(time, delta) {
        this.updateCompass();
    }

    updateCompass() {
        if (this.game.targetCapitalIndex === null) return;

        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        const targetNode = this.game.board.findNodeById(this.game.targetCapitalIndex);
        const playerNode = this.game.board.findNodeById(currentPlayer.currentNodeIndex);

        if (targetNode && playerNode) {
            const px = playerNode.x * 16 + 8;
            const py = playerNode.y * 16 + 8;
            const tx = targetNode.x * 16 + 8;
            const ty = targetNode.y * 16 + 8;

            // Rotate compass needle toward target
            const angle = Phaser.Math.Angle.Between(px, py, tx, ty);
            this.compassNeedle.setRotation(angle + Math.PI / 2);

            // Compute step distance
            const distance = this.game.board.getShortestPathDistance(currentPlayer.currentNodeIndex, this.game.targetCapitalIndex);
            this.compassText.setText(`${targetNode.name}\n${distance} steps`);
        }
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

        const netWorth = currentPlayer.getNetWorth(this.game.board);
        this.playerBalanceText.setText(`Cash: $${currentPlayer.money.toLocaleString()} | Net Worth: $${netWorth.toLocaleString()}${currentPlayer.blackwoodHaunted ? ' | 💀 HAUNTED' : ''}`);

        // Update Card Drawer buttons
        this.renderCardDrawer(currentPlayer);
    }

    renderCardDrawer(player) {
        // Clear old buttons
        this.cardButtonsContainer.removeAll(true);

        const cardWidth = 90;
        const spacing = 10;
        const totalWidth = (player.cards.length * cardWidth) + ((player.cards.length - 1) * spacing);
        const startX = -totalWidth / 2 + cardWidth / 2;

        player.cards.forEach((card, idx) => {
            const cx = startX + idx * (cardWidth + spacing);
            const cy = 0;

            const cardGroup = this.add.container(cx, cy);

            const bg = this.add.graphics();
            bg.fillStyle(0x1d273a, 1);
            bg.fillRoundedRect(-40, -30, 80, 60, 8);
            bg.lineStyle(1.5, 0x8c6d58, 0.4);
            bg.strokeRoundedRect(-40, -30, 80, 60, 8);

            const name = this.add.text(0, -15, card.name, {
                fontSize: '11px',
                color: '#00ff66',
                fontStyle: 'bold',
                align: 'center',
                wordWrap: { width: 75 }
            }).setOrigin(0.5);

            const desc = this.add.text(0, 10, card.id.replace('_', ' ').toUpperCase(), {
                fontSize: '9px',
                color: '#cbd5e0',
                align: 'center'
            }).setOrigin(0.5);

            cardGroup.add([bg, name, desc]);

            // Add play interactivity (only clickable BEFORE rolling dice)
            if (player.movesRemaining === 0 && player.pathHistory.length === 1) {
                bg.setInteractive(new Phaser.Geom.Rectangle(-40, -30, 80, 60), Phaser.Geom.Rectangle.Contains, true);
                bg.on('pointerdown', () => this.playCardAction(idx));
                bg.on('pointerover', () => bg.lineStyle(2, 0x00ff66, 1).strokeRoundedRect(-40, -30, 80, 60, 8));
                bg.on('pointerout', () => bg.lineStyle(1.5, 0x8c6d58, 0.4).strokeRoundedRect(-40, -30, 80, 60, 8));
            } else {
                cardGroup.setAlpha(0.5);
            }

            this.cardButtonsContainer.add(cardGroup);
        });
    }

    playCardAction(cardIndex) {
        const result = this.game.playCard(this.game.currentPlayerIndex, cardIndex);
        if (result.success) {
            this.showEventModal('CARD PLAYED', result.msg, () => {
                this.updateUIStatus();
            });
        }
    }

    // --- MODAL UTILITIES ---

    showEventModal(title, text, onClose) {
        this.modalTitle.setText(title).setColor('#ffd700');
        this.modalBody.setText(text);
        this.modalButtons.removeAll(true);

        const btn = this.add.text(0, 60, 'CONTINUE', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#8c6d58',
            padding: { x: 20, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              if (onClose) onClose();
          });

        this.modalButtons.add(btn);
        this.modalOverlay.setVisible(true);
    }

    showYellowModal(result) {
        this.modalTitle.setText('CARD DRAWN').setColor('#eccc68');
        
        let text = '';
        if (result.drawn) {
            text = `You landed on a Chance node and drew:\n\n"${result.card.name}"\n(${result.card.desc})`;
        } else {
            text = `You landed on a Chance node, but since your hand is already full (8 cards), you had to discard "${result.card.name}".`;
        }

        this.modalBody.setText(text);
        this.modalButtons.removeAll(true);

        const btn = this.add.text(0, 60, 'OK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#eccc68',
            padding: { x: 20, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              this.completeTurnEnding();
          });

        this.modalButtons.add(btn);
        this.modalOverlay.setVisible(true);
    }

    showBlueModal(result) {
        this.modalTitle.setText('SPONSOR PAYOUT!').setColor('#00ff66');
        this.modalBody.setText(`You landed on a Blue space!\n\nA local sponsor rewards your racing team with a cash prize of:\n\n+$${result.amount.toLocaleString()}\n\n(Multiplier: ${result.visitedCount} cities visited)`);
        this.modalButtons.removeAll(true);

        const btn = this.add.text(0, 60, 'OK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#00ff66',
            padding: { x: 20, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              this.completeTurnEnding();
          });

        this.modalButtons.add(btn);
        this.modalOverlay.setVisible(true);
    }

    showRedModal(result) {
        this.modalTitle.setText('REPAIR PENALTY!').setColor('#ff4757');
        this.modalBody.setText(`You landed on a Red space!\n\nYour radiator overheated and required emergency mechanic assistance. You paid:\n\n-$${result.amount.toLocaleString()}\n\n(Multiplier: ${result.visitedCount} cities visited)`);
        this.modalButtons.removeAll(true);

        const btn = this.add.text(0, 60, 'PAY FEE', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#ff4757',
            padding: { x: 20, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              this.completeTurnEnding();
          });

        this.modalButtons.add(btn);
        this.modalOverlay.setVisible(true);
    }

    showPurpleModal() {
        const player = this.game.players[this.game.currentPlayerIndex];
        this.modalTitle.setText('CARD SHOP').setColor('#a4b0be');
        this.modalBody.setText(`Would you like to buy a card or sell one of yours?\n\nYour Cash: $${player.money.toLocaleString()}`);
        this.modalButtons.removeAll(true);

        // Buy button (only if has money and hand not full)
        const canBuy = player.money >= 5000 && player.cards.length < 8;
        const buyBtn = this.add.text(-120, 60, 'BUY CARD ($5,000)', {
            fontSize: '14px',
            color: canBuy ? '#ffffff' : '#4a5568',
            backgroundColor: canBuy ? '#00ff66' : '#1a202c',
            padding: { x: 12, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        if (canBuy) {
            buyBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                const randomCard = CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)];
                player.money -= 5000;
                player.drawCard(randomCard);
                this.modalOverlay.setVisible(false);
                this.showEventModal('CARD PURCHASED', `You bought:\n\n"${randomCard.name}"\n(${randomCard.desc})`, () => {
                    this.completeTurnEnding();
                });
            });
        }

        // Sell button (only if has cards to sell)
        const canSell = player.cards.length > 0;
        const sellBtn = this.add.text(120, 60, 'SELL CARD ($2,500)', {
            fontSize: '14px',
            color: canSell ? '#ffffff' : '#4a5568',
            backgroundColor: canSell ? '#ff4757' : '#1a202c',
            padding: { x: 12, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        if (canSell) {
            sellBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                // Open a sub-select overlay or just sell the first card in hand for simplicity
                const card = player.cards[0];
                player.money += 2500;
                player.cards.splice(0, 1);
                this.modalOverlay.setVisible(false);
                this.showEventModal('CARD SOLD', `You sold "${card.name}" back to the bank for $2,500.`, () => {
                    this.completeTurnEnding();
                });
            });
        }

        // Skip button
        const skipBtn = this.add.text(0, 120, 'SKIP / LEAVE', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#4a5568',
            padding: { x: 16, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              this.completeTurnEnding();
          });

        this.modalButtons.add([buyBtn, sellBtn, skipBtn]);
        this.modalOverlay.setVisible(true);
    }

    showPropertyModal(node) {
        const player = this.game.players[this.game.currentPlayerIndex];
        this.modalTitle.setText(node.name.toUpperCase()).setColor('#ff7f50');

        // Check ownership of properties in city
        let bodyText = `Welcome to ${node.name}!\n\nProperties in this city:\n`;
        node.properties.forEach((p, idx) => {
            bodyText += `${idx + 1}. ${p.name} - Cost: $${p.cost.toLocaleString()} | Rent: $${p.rent.toLocaleString()} (${p.owner ? 'Owner: ' + p.owner : 'AVAILABLE'})\n`;
        });
        bodyText += `\nYour Cash: $${player.money.toLocaleString()}`;
        this.modalBody.setText(bodyText);

        this.modalButtons.removeAll(true);

        // Add purchase button for each available property the player can afford
        let btnCount = 0;
        node.properties.forEach((p, idx) => {
            if (p.owner === null && player.money >= p.cost) {
                const buyBtn = this.add.text(0, idx * 45 - 20, `BUY ${p.name.toUpperCase()} ($${p.cost.toLocaleString()})`, {
                    fontSize: '13px',
                    color: '#ffffff',
                    backgroundColor: '#ff7f50',
                    padding: { x: 14, y: 6 },
                    fontFamily: 'Arial',
                    fontStyle: 'bold'
                }).setOrigin(0.5)
                  .setInteractive({ useHandCursor: true })
                  .on('pointerdown', () => {
                      player.buyProperty(currentPlayer.currentNodeIndex, idx, this.game.board);
                      this.modalOverlay.setVisible(false);
                      this.completeTurnEnding();
                  });
                this.modalButtons.add(buyBtn);
                btnCount++;
            }
        });

        // Close / Don't buy button
        const skipBtn = this.add.text(0, btnCount * 45 - 20, 'LEAVE CITY', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#4a5568',
            padding: { x: 16, y: 8 },
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              this.modalOverlay.setVisible(false);
              this.completeTurnEnding();
          });

        this.modalButtons.add(skipBtn);
        this.modalOverlay.setVisible(true);
    }

    /**
     * Helper to draw dashed lines.
     */
    drawDashedLine(graphics, x1, y1, x2, y2, dashLength = 8, gapLength = 6) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const numDashes = Math.floor(distance / (dashLength + gapLength));
        const stepX = dx / distance;
        const stepY = dy / distance;

        graphics.beginPath();
        for (let i = 0; i < numDashes; i++) {
            const startDist = i * (dashLength + gapLength);
            const endDist = startDist + dashLength;
            graphics.moveTo(x1 + stepX * startDist, y1 + stepY * startDist);
            graphics.lineTo(x1 + stepX * endDist, y1 + stepY * endDist);
        }
        const remaining = distance - numDashes * (dashLength + gapLength);
        if (remaining > dashLength) {
            const startDist = numDashes * (dashLength + gapLength);
            const endDist = startDist + dashLength;
            graphics.moveTo(x1 + stepX * startDist, y1 + stepY * startDist);
            graphics.lineTo(x1 + stepX * endDist, y1 + stepY * endDist);
        }
        graphics.strokePath();
    }
}
