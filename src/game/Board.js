import GRAPH from './graph.js';
import VIEWS from './views.js';

export default class Board {
    constructor() {
        this.nodes = JSON.parse(JSON.stringify(GRAPH)); // Deep clone to avoid mutating original module
        this.views = VIEWS;
        this.initViews();
        this.initProperties();
    }

    initProperties() {
        const standardNames = ["Local Shop", "Factory", "Municipal Bank"];
        const capitalNames = ["Grand Palace", "National Treasury", "Embassy Headquarters"];

        this.nodes.forEach(node => {
            if (node.type === 'city') {
                node.properties = standardNames.map(name => ({
                    name: name,
                    cost: 15000,
                    rent: 1500,
                    owner: null // Name of the owning player
                }));
            } else if (node.type === 'capital') {
                node.properties = capitalNames.map(name => ({
                    name: name,
                    cost: 45000,
                    rent: 4500,
                    owner: null
                }));
            } else {
                node.properties = [];
            }
        });
    }

    initViews() {
        for (let i = 0; i < this.views.length; i++) {
            const view = this.views[i];
            const viewNode = {
                x: view.x,
                y: view.y,
                air: 0,
                neighbors: [null, null, null, null],
                flight: [0, 0, 0, 0],
                type: "view",
                name: "",
                text: view.text
            };
            this.addViewNode(viewNode);
        }
    }

    addViewNode(viewNode) {
        const viewIndex = this.nodes.length;
        this.nodes.push(viewNode);
        
        for (let i = 0; i < viewIndex; i++) {
            const node = this.nodes[i];
            
            if (node.x === viewNode.x) { /* vertical test */
                if (node.y > viewNode.y && node.neighbors[0] !== null && this.nodes[node.neighbors[0]].y < viewNode.y) { /* test up */
                    this.insertViewNode(i, 0, viewIndex);
                }
                
                if (node.y < viewNode.y && node.neighbors[2] !== null && this.nodes[node.neighbors[2]].y > viewNode.y) { /* test down */
                    this.insertViewNode(i, 2, viewIndex);
                }
            } else if (node.y === viewNode.y) { /* horizontal test */
                if (node.x > viewNode.x && node.neighbors[3] !== null && this.nodes[node.neighbors[3]].x < viewNode.x) { /* test left */
                    this.insertViewNode(i, 3, viewIndex);
                }
                
                if (node.x < viewNode.x && node.neighbors[1] !== null && this.nodes[node.neighbors[1]].x > viewNode.x) { /* test right */
                    this.insertViewNode(i, 1, viewIndex);
                }
            }
        }
    }

    insertViewNode(nodeIndex, direction, viewIndex) {
        const viewNode = this.nodes[viewIndex];
        const node = this.nodes[nodeIndex];
        
        viewNode.neighbors[direction] = node.neighbors[direction];
        node.neighbors[direction] = viewIndex;
    }

    getNodes() {
        return this.nodes;
    }

    findNodeById(id) {
        if (typeof id === 'number') {
            return this.nodes[id] || null;
        }
        const num = parseInt(id, 10);
        if (!isNaN(num) && num >= 0 && num < this.nodes.length) {
            return this.nodes[num] || null;
        }
        return null;
    }

    /**
     * Get valid neighbor indices for a node.
     * @param {number} nodeIndex 
     * @returns {Array<number>} array of neighbor indices
     */
    getNeighbors(nodeIndex) {
        const node = this.findNodeById(nodeIndex);
        if (!node) return [];
        return node.neighbors.filter(n => n !== null);
    }

    /**
     * Finds all nodes reachable from a starting node in a specific number of steps.
     * Uses a path-based Breadth-First Search (BFS) to prevent immediate backtracking
     * while allowing loops and alternative paths.
     * @param {number} startNodeIndex The index of the starting node.
     * @param {number} steps The exact number of steps to travel.
     * @returns {Array<number>} An array of node indices that are exactly `steps` away.
     */
    getPossibleMoves(startNodeIndex, steps) {
        const startNode = this.findNodeById(startNodeIndex);
        if (!startNode) {
            return [];
        }

        const queue = [{ nodeIndex: startNodeIndex, stepsRemaining: steps, parentIndex: null }];
        const possibleMoves = new Set();

        while (queue.length > 0) {
            const { nodeIndex, stepsRemaining, parentIndex } = queue.shift();

            if (stepsRemaining === 0) {
                possibleMoves.add(nodeIndex);
                continue;
            }

            const currentNode = this.findNodeById(nodeIndex);
            if (!currentNode) {
                continue;
            }

            for (const neighborIndex of currentNode.neighbors) {
                if (neighborIndex !== null && neighborIndex !== parentIndex) {
                    queue.push({
                        nodeIndex: neighborIndex,
                        stepsRemaining: stepsRemaining - 1,
                        parentIndex: nodeIndex
                    });
                }
            }
        }

        return Array.from(possibleMoves);
    }

    /**
     * Calculates the shortest path distance (number of edges) between two nodes.
     * @param {number} fromIndex 
     * @param {number} toIndex 
     * @returns {number} shortest distance (number of steps)
     */
    getShortestPathDistance(fromIndex, toIndex) {
        if (fromIndex === toIndex) return 0;

        const queue = [{ nodeIndex: fromIndex, distance: 0 }];
        const visited = new Set([fromIndex]);

        while (queue.length > 0) {
            const { nodeIndex, distance } = queue.shift();

            if (nodeIndex === toIndex) {
                return distance;
            }

            const currentNode = this.findNodeById(nodeIndex);
            if (currentNode) {
                for (const neighborIndex of currentNode.neighbors) {
                    if (neighborIndex !== null && !visited.has(neighborIndex)) {
                        visited.add(neighborIndex);
                        queue.push({ nodeIndex: neighborIndex, distance: distance + 1 });
                    }
                }
            }
        }
        return 999; // Fallback for unreachable
    }
}
