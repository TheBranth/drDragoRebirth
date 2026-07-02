export default class Player {
    constructor(name, startNodeIndex, character) {
        this.name = name;
        this.character = character;
        this.money = 30000 * (character.startMoneyModifier || 1);
        this.car = { speed: 3, condition: 100 };
        this.currentNodeIndex = typeof startNodeIndex === 'number' ? startNodeIndex : 399;
        this.shares = [];
        this.passiveAbility = character.getAbility ? character.getAbility() : null;
        
        // Movement tracking
        this.movesRemaining = 0;
        this.pathHistory = [this.currentNodeIndex];
    }

    startTurn(moves) {
        this.movesRemaining = moves;
        this.pathHistory = [this.currentNodeIndex];
    }

    /**
     * Move to a neighboring node index.
     * Handles forward movement and backward undo/refund.
     * @param {number} neighborIndex 
     * @param {Board} board 
     * @returns {boolean} true if movement was successful
     */
    moveTo(neighborIndex, board) {
        const currentNode = board.findNodeById(this.currentNodeIndex);
        if (!currentNode) return false;

        // Check if neighborIndex is actually connected
        if (!currentNode.neighbors.includes(neighborIndex)) {
            return false;
        }

        // Check if we are backtracking to the previous node in the history
        if (this.pathHistory.length > 1 && neighborIndex === this.pathHistory[this.pathHistory.length - 2]) {
            // Undo: refund move
            this.movesRemaining++;
            this.pathHistory.pop();
            this.currentNodeIndex = neighborIndex;
            return true;
        }

        // Otherwise, we move forward if we have moves remaining
        if (this.movesRemaining > 0) {
            this.movesRemaining--;
            this.pathHistory.push(neighborIndex);
            this.currentNodeIndex = neighborIndex;
            return true;
        }

        return false;
    }

    confirmMove() {
        this.pathHistory = [this.currentNodeIndex];
        this.movesRemaining = 0;
    }
}
