import Board from './Board.js';
import Player from './Player.js';
import Characters from './Characters.js';

export const CARD_TEMPLATES = [
    { id: 'double_dice', name: 'Nitrous Boost', desc: 'Rolls 2 dice on your next turn.', actionType: 'dice_modifier' },
    { id: 'triple_dice', name: 'Rocket Thruster', desc: 'Rolls 3 dice on your next turn.', actionType: 'dice_modifier' },
    { id: 'specific_1', name: 'Cruise Control 1', desc: 'Sets your next roll to exactly 1.', actionType: 'dice_modifier' },
    { id: 'specific_2', name: 'Cruise Control 2', desc: 'Sets your next roll to exactly 2.', actionType: 'dice_modifier' },
    { id: 'specific_3', name: 'Cruise Control 3', desc: 'Sets your next roll to exactly 3.', actionType: 'dice_modifier' },
    { id: 'blackwood_shield', name: 'Decoy Hologram', desc: 'Instantly expels Baron Blackwood if you are haunted.', actionType: 'defensive' },
    { id: 'teleport', name: 'Wormhole Swap', desc: 'Swaps position with your opponent.', actionType: 'movement' },
    { id: 'steal_cash', name: 'IRS Tax Audit', desc: 'Steals $10,000 from your opponent.', actionType: 'sabotage' },
    { id: 'freeze_opponent', name: 'Sugar in the Engine', desc: 'Forces your opponent to skip their next turn.', actionType: 'sabotage' }
];

export default class Game {
    constructor(playerConfigs) { // playerConfigs: [{ name: 'Player 1', character: 'professor_quantum' }]
        this.board = new Board();
        this.players = playerConfigs.map(config => {
            const character = Characters[config.character];
            return new Player(config.name, 399, character); // Start at Prague (399)
        });
        this.currentPlayerIndex = 0;
        this.blackwoodPosition = 399; // Start Baron Blackwood at Prague
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
     * Handles skip turns, passive rent collection, Blackwood penalties, and dice rolling.
     * @returns {object} turn details
     */
    startTurn(overrideDiceRoll = null, overrideBlackwoodEvent = null) {
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

        // 3. Baron Blackwood penalty application
        let blackwoodEventDetails = null;
        if (currentPlayer.blackwoodHaunted) {
            blackwoodEventDetails = this.applyBlackwoodPenalty(currentPlayer, overrideBlackwoodEvent);
        }

        // 4. Dice Roll calculation
        let diceRoll = 0;
        if (typeof overrideDiceRoll === 'number') {
            diceRoll = overrideDiceRoll;
            currentPlayer.activeCardModifier = null; // Clear active card modifier
        } else {
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
        }

        currentPlayer.startTurn(diceRoll);
        console.log(`${currentPlayer.name} rolled a ${diceRoll}. Remaining moves: ${currentPlayer.movesRemaining}`);

        return {
            skipped: false,
            player: currentPlayer,
            diceRoll: diceRoll,
            rentCollected: rentCollected,
            blackwoodEvent: blackwoodEventDetails
        };
    }

    /**
     * Ends the current turn. Confirms movements, checks for stage wins, and advances turn.
     * @returns {object|null} win details if stage was won, else null
     */
    endTurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        currentPlayer.confirmMove(this.board);
        
        // Check for stage win
        const winDetails = this.checkStageWin();

        // Move Baron Blackwood randomly if he is not currently haunting someone on their space
        this.moveBlackwoodRandomly();

        // Advance turn
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

        // Autosave the state
        this.saveToLocalStorage();

        return winDetails;
    }

    /**
     * Checks if the active player landed exactly on the target capital node.
     * Awards $100,000, selects a new destination, and transfers Baron Blackwood to the furthest player.
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

            // Reassign Baron Blackwood
            this.players.forEach(p => {
                p.blackwoodHaunted = false;
            });
            if (furthestPlayer) {
                furthestPlayer.blackwoodHaunted = true;
                this.blackwoodPosition = furthestPlayer.currentNodeIndex;
                console.log(`💀 Baron Blackwood has attached to the furthest player: ${furthestPlayer.name}!`);
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
        if (!currentPlayer.blackwoodHaunted) return null;

        // Check if current player shares the space with any other player
        const otherPlayer = this.players.find(p => p !== currentPlayer && p.currentNodeIndex === currentPlayer.currentNodeIndex);
        if (otherPlayer) {
            currentPlayer.blackwoodHaunted = false;
            otherPlayer.blackwoodHaunted = true;
            this.blackwoodPosition = otherPlayer.currentNodeIndex;
            console.log(`💀 Curse passed! ${currentPlayer.name} passed the Blackwood curse to ${otherPlayer.name}!`);
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
        } else if (card.id === 'blackwood_shield') {
            if (player.blackwoodHaunted) {
                player.blackwoodHaunted = false;
                this.blackwoodPosition = 399; // Banish to Prague
                msg = `${player.name} deployed a Decoy Hologram. Baron Blackwood has been banished back to Prague!`;
            } else {
                return { success: false, msg: 'You are not haunted by Baron Blackwood.' };
            }
        } else if (card.id === 'teleport') {
            const tempNode = player.currentNodeIndex;
            player.currentNodeIndex = opponent.currentNodeIndex;
            opponent.currentNodeIndex = tempNode;
            
            // Re-sync Baron Blackwood position if he was haunting someone
            if (player.blackwoodHaunted) this.blackwoodPosition = player.currentNodeIndex;
            else if (opponent.blackwoodHaunted) this.blackwoodPosition = opponent.currentNodeIndex;

            msg = `${player.name} activated a Wormhole Swap! Swapped positions with ${opponent.name}.`;
        } else if (card.id === 'steal_cash') {
            const stolen = Math.min(10000, opponent.money);
            opponent.money -= stolen;
            player.money += stolen;
            msg = `${player.name} initiated an IRS Tax Audit and confiscated $${stolen} from ${opponent.name}!`;
        } else if (card.id === 'freeze_opponent') {
            opponent.skipNextTurn = true;
            msg = `${player.name} poured Sugar in the Engine of ${opponent.name}! They will skip their next turn.`;
        }

        // Remove card from hand
        player.cards.splice(cardIndex, 1);
        return { success: true, msg: msg, cardId: card.id };
    }

    /**
     * Triggers start-of-turn penalties when targeted by Baron Blackwood.
     * @param {Player} player 
     * @returns {object} details of the penalty
     */
    applyBlackwoodPenalty(player, overrideEvent = null) {
        const events = ['steal', 'sell', 'card', 'distribute'];
        const randomEvent = overrideEvent || events[Math.floor(Math.random() * events.length)];
        
        let msg = '';
        if (randomEvent === 'steal') {
            const stolen = Math.floor(Math.random() * 10000) + 5000; // $5k - $15k
            player.money = Math.max(0, player.money - stolen);
            msg = `Baron Blackwood steals $${stolen} to pay off his luxury sports car loan.`;
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
                msg = `Baron Blackwood sells your property "${targetProperty.name}" in ${targetNode.name} at a fire-sale loss for $${refund}!`;
            } else {
                // Fallback to steal cash
                const stolen = 5000;
                player.money = Math.max(0, player.money - stolen);
                msg = `Baron Blackwood tries to sell a property, but since you own nothing, he just steals $${stolen}!`;
            }
        } else if (randomEvent === 'card') {
            if (player.cards.length > 0) {
                const cardIdx = Math.floor(Math.random() * player.cards.length);
                const destroyedCard = player.cards[cardIdx];
                player.cards.splice(cardIdx, 1);
                msg = `Baron Blackwood shreds your Feature Card: "${destroyedCard.name}"!`;
            } else {
                // Fallback to steal cash
                const stolen = 5000;
                player.money = Math.max(0, player.money - stolen);
                msg = `Baron Blackwood tries to destroy a card, but since your hand is empty, he steals $${stolen}!`;
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
            msg = `Baron Blackwood robs you of $${sum} and splits it equally ($${split} each) among other players!`;
        }

        // Keep Baron Blackwood at player's node position
        this.blackwoodPosition = player.currentNodeIndex;

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

    moveBlackwoodRandomly() {
        // Only move Baron Blackwood randomly if he is NOT haunting a player on their current node
        const isHauntingPlayer = this.players.some(p => p.blackwoodHaunted && p.currentNodeIndex === this.blackwoodPosition);
        if (isHauntingPlayer) return;

        const blackwoodNode = this.board.findNodeById(this.blackwoodPosition);
        if (blackwoodNode) {
            const validNeighbors = blackwoodNode.neighbors.filter(n => n !== null);
            if (validNeighbors.length > 0) {
                const randomIndex = Math.floor(Math.random() * validNeighbors.length);
                this.blackwoodPosition = validNeighbors[randomIndex];
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
        } else if (node.type === 'blue') {
            // Scaled cash reward based on unique cities visited
            const baseRandom = Math.floor(Math.random() * 2001) + 1000; // $1,000 - $3,000
            const multiplier = 1 + 0.2 * player.visitedCities.length;
            const reward = Math.floor(baseRandom * multiplier);
            player.money += reward;
            return { type: 'blue', amount: reward, visitedCount: player.visitedCities.length };
        } else if (node.type === 'red') {
            // Scaled cash penalty based on unique cities visited
            const baseRandom = Math.floor(Math.random() * 2001) + 1000; // $1,000 - $3,000
            const multiplier = 1 + 0.2 * player.visitedCities.length;
            const penalty = Math.floor(baseRandom * multiplier);
            const actualLoss = Math.min(penalty, player.money);
            player.money -= actualLoss;
            return { type: 'red', amount: actualLoss, visitedCount: player.visitedCities.length };
        }
        return null;
    }

    /**
     * Serializes the game state to a plain JSON-compatible object.
     * @returns {object} plain serialized game data
     */
    serialize() {
        return {
            currentPlayerIndex: this.currentPlayerIndex,
            blackwoodPosition: this.blackwoodPosition,
            currentTargetIndex: this.targetCapitalIndex,
            stagesCount: this.stagesCount,
            players: this.players.map(p => p.serialize())
        };
    }

    /**
     * Deserializes the game state and restores board property ownership.
     * @param {object} data plain serialized game data
     */
    deserialize(data) {
        this.currentPlayerIndex = data.currentPlayerIndex;
        this.blackwoodPosition = data.blackwoodPosition;
        this.targetCapitalIndex = data.currentTargetIndex;
        this.stagesCount = data.stagesCount;

        // Restore player states
        this.players.forEach((player, idx) => {
            if (data.players[idx]) {
                player.deserialize(data.players[idx], Characters);
            }
        });

        // Reset all board properties ownership
        this.board.getNodes().forEach(node => {
            if (node.properties) {
                node.properties.forEach(p => {
                    p.owner = null;
                });
            }
        });

        // Restore ownership based on each player's deserialized properties list
        this.players.forEach(player => {
            player.properties.forEach(propRef => {
                const node = this.board.findNodeById(propRef.nodeId);
                if (node && node.properties && node.properties[propRef.propertyIndex]) {
                    node.properties[propRef.propertyIndex].owner = player.name;
                }
            });
        });
    }

    /**
     * Saves the current game state to localStorage.
     */
    saveToLocalStorage() {
        if (typeof localStorage === 'undefined') return;
        try {
            const data = this.serialize();
            localStorage.setItem('baron_blackwood_savegame', JSON.stringify(data));
            console.log('Game autosaved successfully.');
        } catch (e) {
            console.error('Error autosaving game state:', e);
        }
    }

    /**
     * Loads the game state from localStorage.
     * @returns {boolean} true if loaded successfully, else false
     */
    loadFromLocalStorage() {
        if (typeof localStorage === 'undefined') return false;
        try {
            const saved = localStorage.getItem('baron_blackwood_savegame');
            if (saved) {
                const data = JSON.parse(saved);
                this.deserialize(data);
                return true;
            }
        } catch (e) {
            console.error('Error loading game state:', e);
        }
        return false;
    }

    /**
     * Clears any saved game state from localStorage.
     */
    clearLocalStorageSave() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.removeItem('baron_blackwood_savegame');
            console.log('Cleared savegame from localStorage.');
        } catch (e) {
            console.error('Error clearing savegame:', e);
        }
    }
}
