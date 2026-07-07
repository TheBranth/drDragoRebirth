export default class Player {
    constructor(name, startNodeIndex, character) {
        this.name = name;
        this.character = character;
        this.money = 30000 * (character.startMoneyModifier || 1);
        this.car = { speed: 3, condition: 100 };
        this.currentNodeIndex = typeof startNodeIndex === 'number' ? startNodeIndex : 399;
        this.shares = []; // Array of city node indices in which the player owns shares
        this.passiveAbility = character.getAbility ? character.getAbility() : null;
        
        // Hand of Feature Cards (limit 8)
        this.cards = [];
        this.properties = []; // Array of owned property references: { nodeId, propertyIndex }
        
        // Movement tracking
        this.movesRemaining = 0;
        this.pathHistory = [this.currentNodeIndex];
        this.visitedCities = []; // Array of unique city/capital node indices visited
        
        // Status effects
        this.skipNextTurn = false;
        this.blackwoodHaunted = false;
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

    confirmMove(board) {
        this.pathHistory = [this.currentNodeIndex];
        this.movesRemaining = 0;

        // Register the city/capital visited
        if (board) {
            const node = board.findNodeById(this.currentNodeIndex);
            if (node && (node.type === 'city' || node.type === 'capital')) {
                if (!this.visitedCities.includes(this.currentNodeIndex)) {
                    this.visitedCities.push(this.currentNodeIndex);
                }
            }
        }
    }

    /**
     * Draw a card, enforcing the hand limit of 8.
     * @param {object} card 
     * @returns {boolean} true if card was successfully drawn
     */
    drawCard(card) {
        if (this.cards.length >= 8) {
            console.log(`${this.name}'s hand is full (max 8 cards).`);
            return false;
        }
        this.cards.push(card);
        console.log(`${this.name} drew Feature Card: ${card.name}`);
        return true;
    }

    /**
     * Buys a property in a city node.
     * @param {number} nodeIndex 
     * @param {number} propertyIndex 
     * @param {Board} board 
     * @returns {boolean} true if purchase was successful
     */
    buyProperty(nodeIndex, propertyIndex, board) {
        const node = board.findNodeById(nodeIndex);
        if (!node || !node.properties || !node.properties[propertyIndex]) return false;

        const prop = node.properties[propertyIndex];
        if (prop.owner !== null) {
            console.log(`Property ${prop.name} in ${node.name} is already owned by ${prop.owner}`);
            return false;
        }

        if (this.money < prop.cost) {
            console.log(`${this.name} cannot afford ${prop.name} (cost: $${prop.cost}, cash: $${this.money})`);
            return false;
        }

        this.money -= prop.cost;
        prop.owner = this.name;
        this.properties.push({ nodeId: nodeIndex, propertyIndex: propertyIndex });
        console.log(`${this.name} bought ${prop.name} in ${node.name} for $${prop.cost}.`);
        return true;
    }

    /**
     * Sells a property back to the bank (fire-sale).
     * @param {number} nodeIndex 
     * @param {number} propertyIndex 
     * @param {Board} board 
     * @param {number} multiplier fraction of cost refunded
     * @returns {boolean} true if sale was successful
     */
    sellProperty(nodeIndex, propertyIndex, board, multiplier = 0.5) {
        const node = board.findNodeById(nodeIndex);
        if (!node || !node.properties || !node.properties[propertyIndex]) return false;

        const prop = node.properties[propertyIndex];
        if (prop.owner !== this.name) {
            console.log(`${this.name} does not own ${prop.name} in ${node.name}`);
            return false;
        }

        const payout = Math.floor(prop.cost * multiplier);
        this.money += payout;
        prop.owner = null;
        this.properties = this.properties.filter(p => !(p.nodeId === nodeIndex && p.propertyIndex === propertyIndex));
        console.log(`${this.name} sold ${prop.name} in ${node.name} for $${payout} (fire-sale).`);
        return true;
    }

    /**
     * Calculates passive rent for all properties owned by this player.
     * Doubles rent for any city where the player has a monopoly.
     * @param {Board} board 
     * @returns {number} total rent collected
     */
    collectPassiveRent(board) {
        let totalRent = 0;
        const nodes = board.getNodes();

        nodes.forEach(node => {
            if (!node.properties || node.properties.length === 0) return;

            const ownedInCity = node.properties.filter(p => p.owner === this.name);
            if (ownedInCity.length === 0) return;

            // Monopoly Check: player owns all properties in this city
            const isMonopoly = ownedInCity.length === node.properties.length;
            const rentMultiplier = isMonopoly ? 2 : 1;

            const cityRent = ownedInCity.reduce((sum, p) => sum + (p.rent * rentMultiplier), 0);
            totalRent += cityRent;

            if (isMonopoly) {
                console.log(`Monopoly bonus applied to ${node.name}! Passive income: $${cityRent}`);
            }
        });

        if (totalRent > 0) {
            this.money += totalRent;
            console.log(`${this.name} collected $${totalRent} in passive rent.`);
        }
        return totalRent;
    }

    /**
     * Calculates the player's total net worth (cash + cost of properties).
     * @param {Board} board 
     * @returns {number} total net worth
     */
    getNetWorth(board) {
        let propertyValue = 0;
        const nodes = board.getNodes();

        nodes.forEach(node => {
            if (node.properties) {
                node.properties.forEach(p => {
                    if (p.owner === this.name) {
                        propertyValue += p.cost;
                    }
                });
            }
        });

        return this.money + propertyValue;
    }

    /**
     * Serializes player data into a plain JSON-compatible object.
     * @returns {object} plain serialized player data
     */
    serialize() {
        return {
            name: this.name,
            characterName: this.character.name,
            money: this.money,
            car: { ...this.car },
            currentNodeIndex: this.currentNodeIndex,
            cards: this.cards.map(c => ({ ...c })),
            skipNextTurn: this.skipNextTurn,
            blackwoodHaunted: this.blackwoodHaunted,
            activeCardModifier: this.activeCardModifier,
            visitedCities: [...this.visitedCities],
            properties: this.properties.map(p => ({ ...p }))
        };
    }

    /**
     * Deserializes player data from a plain object.
     * @param {object} data plain serialized player data
     * @param {array} allCharacters array of all character objects to resolve reference
     */
    deserialize(data, allCharacters) {
        this.name = data.name;
        this.money = data.money;
        this.car = { ...data.car };
        this.currentNodeIndex = data.currentNodeIndex;
        this.cards = data.cards ? data.cards.map(c => ({ ...c })) : [];
        this.skipNextTurn = data.skipNextTurn || false;
        this.blackwoodHaunted = data.blackwoodHaunted || false;
        this.activeCardModifier = data.activeCardModifier || null;
        this.visitedCities = data.visitedCities ? [...data.visitedCities] : [];
        this.properties = data.properties ? data.properties.map(p => ({ ...p })) : [];

        // Resolve character reference by matching name
        if (allCharacters) {
            const charList = Array.isArray(allCharacters) ? allCharacters : Object.values(allCharacters);
            const matchedChar = charList.find(c => c.name === data.characterName);
            if (matchedChar) {
                this.character = matchedChar;
            }
        }
    }
}

/**
 * Retrieves player stats (wins, total matches, win ratio) from localStorage.
 * @returns {object} win/loss metrics
 */
export function getPlayerStats() {
    if (typeof localStorage === 'undefined') {
        return { wins: 0, matches: 0, winRatio: 0.0 };
    }
    try {
        const data = localStorage.getItem('bb_player_stats');
        if (data) {
            const parsed = JSON.parse(data);
            const wins = typeof parsed.wins === 'number' ? parsed.wins : 0;
            const matches = typeof parsed.matches === 'number' ? parsed.matches : 0;
            const winRatio = matches > 0 ? (wins / matches) : 0.0;
            return { wins, matches, winRatio };
        }
    } catch (e) {
        console.error('Error reading player stats:', e);
    }
    return { wins: 0, matches: 0, winRatio: 0.0 };
}

/**
 * Records a win or loss, recalculating win ratio in localStorage.
 * @param {boolean} isWin true if player won, else false
 */
export function recordMatchResult(isWin) {
    if (typeof localStorage === 'undefined') return;
    try {
        const stats = getPlayerStats();
        stats.matches += 1;
        if (isWin) {
            stats.wins += 1;
        }
        stats.winRatio = stats.wins / stats.matches;
        localStorage.setItem('bb_player_stats', JSON.stringify(stats));
        console.log('Recorded match result. New stats:', stats);
    } catch (e) {
        console.error('Error saving player stats:', e);
    }
}
