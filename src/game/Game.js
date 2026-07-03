import Board from './Board.js';
import Player from './Player.js';
import Characters from './Characters.js';

export const CARD_TEMPLATES = [
    { id: 'double_dice', name: 'Double Dice', desc: 'Rolls 2 dice on your next turn.', actionType: 'dice_modifier' },
    { id: 'triple_dice', name: 'Triple Dice', desc: 'Rolls 3 dice on your next turn.', actionType: 'dice_modifier' },
    { id: 'specific_1', name: 'Direct 1', desc: 'Sets your next roll to exactly 1.', actionType: 'dice_modifier' },
    { id: 'specific_2', name: 'Direct 2', desc: 'Sets your next roll to exactly 2.', actionType: 'dice_modifier' },
    { id: 'specific_3', name: 'Direct 3', desc: 'Sets your next roll to exactly 3.', actionType: 'dice_modifier' },
    { id: 'drago_shield', name: 'Drago Shield', desc: 'Instantly expels Dr. Drago if you are haunted.', actionType: 'defensive' },
    { id: 'teleport', name: 'Teleport Swap', desc: 'Swaps position with your opponent.', actionType: 'movement' },
    { id: 'steal_cash', name: 'Cash Squeeze', desc: 'Steals $10,000 from your opponent.', actionType: 'sabotage' },
    { id: 'freeze_opponent', name: 'Freeze Opponent', desc: 'Forces your opponent to skip their next turn.', actionType: 'sabotage' }
];

export default class Game {
    constructor(playerConfigs) { // playerConfigs: [{ name: 'Player 1', character: 'professor_quantum' }]
        this.board = new Board();
        this.players = playerConfigs.map(config => {
            const character = Characters[config.character];
            return new Player(config.name, 399, character); // Start at Prague (399)
        });
        this.currentPlayerIndex = 0;
        this.dragoPosition = 399; // Start Dr. Drago at Prague
        this.targetCapitalIndex = null;
        
        // Select initial target capital destination
        this.selectNewTargetCapital();
    }

    startGame() {
        console.log('Game starting!');
    }

    /**
     * Chooses a random capital node index to be the next destination target.
     */
    selectNewTargetCapital() {
        const nodes = this.board.getNodes();
        const capitalNodes = [];
        
        nodes.forEach((node, index) => {
            if (node.type === 'capital' && index !== this.targetCapitalIndex) {
                capitalNodes.push(index);
            }
        });

        if (capitalNodes.length > 0) {
            const randomIndex = Math.floor(Math.random() * capitalNodes.length);
            this.targetCapitalIndex = capitalNodes[randomIndex];
            console.log(`New target destination capital selected: Node Index ${this.targetCapitalIndex} (${this.board.findNodeById(this.targetCapitalIndex).name})`);
        }
    }

    /**
     * Start the turn for the current player.
     * Handles skip turns, passive rent collection, Drago penalties, and dice rolling.
     * @returns {object} turn details
     */
    startTurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];

        // 1. Skip turn check
        if (currentPlayer.skipNextTurn) {
            currentPlayer.skipNextTurn = false;
            console.log(`${currentPlayer.name}'s turn is skipped!`);
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            return { skipped: true, player: currentPlayer };
        }

        // 2. Passive Rent Payout
        const rentCollected = currentPlayer.collectPassiveRent(this.board);

        // 3. Dr. Drago penalty application
        let dragoEventDetails = null;
        if (currentPlayer.dragoHaunted) {
            dragoEventDetails = this.applyDragoPenalty(currentPlayer);
        }

        // 4. Dice Roll calculation
        let diceRoll = 0;
        const modifier = currentPlayer.activeCardModifier;
        currentPlayer.activeCardModifier = null; // Clear after use

        if (modifier === 'specific_1') {
            diceRoll = 1;
        } else if (modifier === 'specific_2') {
            diceRoll = 2;
        } else if (modifier === 'specific_3') {
            diceRoll = 3;
        } else if (modifier === 'double_dice') {
            diceRoll = this.rollDice(currentPlayer) + this.rollDice(currentPlayer);
        } else if (modifier === 'triple_dice') {
            diceRoll = this.rollDice(currentPlayer) + this.rollDice(currentPlayer) + this.rollDice(currentPlayer);
        } else {
            diceRoll = this.rollDice(currentPlayer);
        }

        currentPlayer.startTurn(diceRoll);
        console.log(`${currentPlayer.name} rolled a ${diceRoll}. Remaining moves: ${currentPlayer.movesRemaining}`);

        return {
            skipped: false,
            player: currentPlayer,
            diceRoll: diceRoll,
            rentCollected: rentCollected,
            dragoEvent: dragoEventDetails
        };
    }

    /**
     * Ends the current turn. Confirms movements, checks for stage wins, and advances turn.
     * @returns {object|null} win details if stage was won, else null
     */
    endTurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        currentPlayer.confirmMove();
        
        // Check for stage win
        const winDetails = this.checkStageWin();

        // Move Dr. Drago randomly if he is not currently haunting someone on their space
        this.moveDragoRandomly();

        // Advance turn
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

        return winDetails;
    }

    /**
     * Checks if the active player landed exactly on the target capital node.
     * Awards $100,000, selects a new destination, and transfers Dr. Drago to the furthest player.
     * @returns {object|null} win details if won, else null
     */
    checkStageWin() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.currentNodeIndex === this.targetCapitalIndex) {
            console.log(`🏆 Stage Win! ${currentPlayer.name} reached the target capital ${this.board.findNodeById(this.targetCapitalIndex).name}!`);
            
            const oldTargetIndex = this.targetCapitalIndex;
            currentPlayer.money += 100000; // Prize

            // Furthest player calculation
            let furthestPlayer = null;
            let maxDistance = -1;

            this.players.forEach(p => {
                const dist = this.board.getShortestPathDistance(p.currentNodeIndex, oldTargetIndex);
                console.log(`Distance from ${p.name} to ${this.board.findNodeById(oldTargetIndex).name}: ${dist} steps.`);
                if (dist > maxDistance) {
                    maxDistance = dist;
                    furthestPlayer = p;
                }
            });

            // Reassign Dr. Drago
            this.players.forEach(p => {
                p.dragoHaunted = false;
            });
            if (furthestPlayer) {
                furthestPlayer.dragoHaunted = true;
                this.dragoPosition = furthestPlayer.currentNodeIndex;
                console.log(`💀 Dr. Drago has attached to the furthest player: ${furthestPlayer.name}!`);
            }

            // Select new target destination
            const prevTargetName = this.board.findNodeById(oldTargetIndex).name;
            this.selectNewTargetCapital();
            const newTargetName = this.board.findNodeById(this.targetCapitalIndex).name;

            return {
                winner: currentPlayer,
                prize: 100000,
                oldTargetName: prevTargetName,
                newTargetName: newTargetName,
                furthestPlayer: furthestPlayer
            };
        }
        return null;
    }

    /**
     * Checks if the haunted player crossed paths with another player to pass the curse.
     * @returns {object|null} details if curse was passed, else null
     */
    checkCurseTransfer() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer.dragoHaunted) return null;

        // Check if current player shares the space with any other player
        const otherPlayer = this.players.find(p => p !== currentPlayer && p.currentNodeIndex === currentPlayer.currentNodeIndex);
        if (otherPlayer) {
            currentPlayer.dragoHaunted = false;
            otherPlayer.dragoHaunted = true;
            this.dragoPosition = otherPlayer.currentNodeIndex;
            console.log(`💀 Curse passed! ${currentPlayer.name} passed the Drago curse to ${otherPlayer.name}!`);
            return {
                from: currentPlayer,
                to: otherPlayer
            };
        }
        return null;
    }

    /**
     * Plays a card from a player's hand.
     * @param {number} playerIndex 
     * @param {number} cardIndex 
     * @returns {object} result of card action
     */
    playCard(playerIndex, cardIndex) {
        const player = this.players[playerIndex];
        if (!player || !player.cards[cardIndex]) return { success: false, msg: 'Invalid card selection.' };

        const card = player.cards[cardIndex];
        const opponentIndex = (playerIndex + 1) % this.players.length;
        const opponent = this.players[opponentIndex];

        let msg = '';
        if (card.id === 'double_dice' || card.id === 'triple_dice' || card.id.startsWith('specific_')) {
            player.activeCardModifier = card.id;
            msg = `${player.name} played ${card.name}. Next roll is modified!`;
        } else if (card.id === 'drago_shield') {
            if (player.dragoHaunted) {
                player.dragoHaunted = false;
                this.dragoPosition = 399; // Banish to Prague
                msg = `${player.name} played Drago Shield. Dr. Drago has been banished back to Prague!`;
            } else {
                return { success: false, msg: 'You are not haunted by Dr. Drago.' };
            }
        } else if (card.id === 'teleport') {
            const tempNode = player.currentNodeIndex;
            player.currentNodeIndex = opponent.currentNodeIndex;
            opponent.currentNodeIndex = tempNode;
            
            // Re-sync Dr. Drago position if he was haunting someone
            if (player.dragoHaunted) this.dragoPosition = player.currentNodeIndex;
            else if (opponent.dragoHaunted) this.dragoPosition = opponent.currentNodeIndex;

            msg = `${player.name} played Teleport Swap! Swapped positions with ${opponent.name}.`;
        } else if (card.id === 'steal_cash') {
            const stolen = Math.min(10000, opponent.money);
            opponent.money -= stolen;
            player.money += stolen;
            msg = `${player.name} played Cash Squeeze and stole $${stolen} from ${opponent.name}!`;
        } else if (card.id === 'freeze_opponent') {
            opponent.skipNextTurn = true;
            msg = `${player.name} played Freeze Opponent. ${opponent.name} will skip their next turn!`;
        }

        // Remove card from hand
        player.cards.splice(cardIndex, 1);
        return { success: true, msg: msg, cardId: card.id };
    }

    /**
     * Triggers start-of-turn penalties when targeted by Dr. Drago.
     * @param {Player} player 
     * @returns {object} details of the penalty
     */
    applyDragoPenalty(player) {
        const events = ['steal', 'sell', 'card', 'distribute'];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        
        let msg = '';
        if (randomEvent === 'steal') {
            const stolen = Math.floor(Math.random() * 10000) + 5000; // $5k - $15k
            player.money = Math.max(0, player.money - stolen);
            msg = `Dr. Drago steals $${stolen} to pay off his luxury car loan.`;
        } else if (randomEvent === 'sell') {
            // Find an owned property
            let targetProperty = null;
            let targetNode = null;
            let targetPropIndex = -1;

            const nodes = this.board.getNodes();
            for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
                const node = nodes[nIdx];
                if (node.properties) {
                    for (let pIdx = 0; pIdx < node.properties.length; pIdx++) {
                        if (node.properties[pIdx].owner === player.name) {
                            targetProperty = node.properties[pIdx];
                            targetNode = node;
                            targetPropIndex = pIdx;
                            break;
                        }
                    }
                }
                if (targetProperty) break;
            }

            if (targetProperty) {
                const refund = Math.floor(targetProperty.cost * 0.3); // 30% fire-sale price
                player.money += refund;
                targetProperty.owner = null;
                msg = `Dr. Drago sells your property "${targetProperty.name}" in ${targetNode.name} at a fire-sale loss for $${refund}!`;
            } else {
                // Fallback to steal cash
                const stolen = 5000;
                player.money = Math.max(0, player.money - stolen);
                msg = `Dr. Drago tries to sell a property, but since you own nothing, he just steals $${stolen}!`;
            }
        } else if (randomEvent === 'card') {
            if (player.cards.length > 0) {
                const cardIdx = Math.floor(Math.random() * player.cards.length);
                const destroyedCard = player.cards[cardIdx];
                player.cards.splice(cardIdx, 1);
                msg = `Dr. Drago shreds your Feature Card: "${destroyedCard.name}"!`;
            } else {
                // Fallback to steal cash
                const stolen = 5000;
                player.money = Math.max(0, player.money - stolen);
                msg = `Dr. Drago tries to destroy a card, but since your hand is empty, he steals $${stolen}!`;
            }
        } else if (randomEvent === 'distribute') {
            const sum = Math.min(10000, player.money);
            player.money -= sum;
            
            const count = this.players.length - 1;
            const split = Math.floor(sum / count);
            this.players.forEach(p => {
                if (p !== player) {
                    p.money += split;
                }
            });
            msg = `Dr. Drago robs you of $${sum} and splits it equally ($${split} each) among other players!`;
        }

        // Keep Dr. Drago at player's node position
        this.dragoPosition = player.currentNodeIndex;

        return { event: randomEvent, msg: msg };
    }

    rollDice(player) {
        let roll = Math.floor(Math.random() * 6) + 1;
        // Apply character ability
        if (player.passiveAbility && player.passiveAbility.type === 'dice_roll_modifier') {
            if (roll < player.passiveAbility.minRoll) {
                roll = player.passiveAbility.minRoll;
            }
        }
        return roll;
    }

    moveDragoRandomly() {
        // Only move Dr. Drago randomly if he is NOT haunting a player on their current node
        const isHauntingPlayer = this.players.some(p => p.dragoHaunted && p.currentNodeIndex === this.dragoPosition);
        if (isHauntingPlayer) return;

        const dragoNode = this.board.findNodeById(this.dragoPosition);
        if (dragoNode) {
            const validNeighbors = dragoNode.neighbors.filter(n => n !== null);
            if (validNeighbors.length > 0) {
                const randomIndex = Math.floor(Math.random() * validNeighbors.length);
                this.dragoPosition = validNeighbors[randomIndex];
            }
        }
    }

    /**
     * Determines what occurs when a player lands on their final node.
     * @param {Player} player 
     * @returns {object|null} landing details
     */
    landOnNode(player) {
        const node = this.board.findNodeById(player.currentNodeIndex);
        if (!node) return null;

        if (node.type === 'yellow') {
            const randomCard = CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)];
            const drawn = player.drawCard(randomCard);
            return { type: 'yellow', card: randomCard, drawn: drawn };
        } else if (node.type === 'purple') {
            return { type: 'purple' };
        } else if (node.type === 'city' || node.type === 'capital') {
            return { type: 'property', node: node };
        }
        return null;
    }
}
