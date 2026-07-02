import Board from './Board.js';
import Player from './Player.js';
import Characters from './Characters.js';

export default class Game {
    constructor(playerConfigs) { // playerConfigs: [{ name: 'Player 1', character: 'professor_quantum' }]
        this.board = new Board();
        this.players = playerConfigs.map(config => {
            const character = Characters[config.character];
            return new Player(config.name, 399, character); // Start at Prague (399)
        });
        this.currentPlayerIndex = 0;
        this.dragoPosition = 399; // Start at Prague (399)
    }

    startGame() {
        console.log('Game starting!');
    }

    /**
     * Start the turn for the current player.
     * Rolls the dice and configures their moves.
     * @returns {object} { player, diceRoll }
     */
    startTurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        const diceRoll = this.rollDice(currentPlayer);
        currentPlayer.startTurn(diceRoll);
        console.log(`${currentPlayer.name} rolled a ${diceRoll}. Remaining moves: ${currentPlayer.movesRemaining}`);
        return {
            player: currentPlayer,
            diceRoll: diceRoll
        };
    }

    /**
     * Ends the current turn. Confirms movements and advances to the next player.
     */
    endTurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        currentPlayer.confirmMove();
        
        // Move Dr. Drago randomly
        this.moveDrago();

        // Advance turn
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
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

    moveDrago() {
        const dragoNode = this.board.findNodeById(this.dragoPosition);
        if (dragoNode) {
            const validNeighbors = dragoNode.neighbors.filter(n => n !== null);
            if (validNeighbors.length > 0) {
                const randomIndex = Math.floor(Math.random() * validNeighbors.length);
                this.dragoPosition = validNeighbors[randomIndex];
                console.log(`Dr. Drago moved to node index ${this.dragoPosition} (${this.board.findNodeById(this.dragoPosition).name || 'Unnamed'}).`);
            }
        }
    }
}
