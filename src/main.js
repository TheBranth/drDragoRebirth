import IntroScene from './scenes/IntroScene.js';
import PlayerSelectScene from './scenes/PlayerSelectScene.js';
import MultiplayerSelectScene from './scenes/MultiplayerSelectScene.js';
import GameScene from './scenes/GameScene.js';

// This is the configuration for our game
const config = {
    type: Phaser.AUTO, // Automatically choose between WebGL or Canvas
    parent: 'phaser-container', // ID of the DOM element to attach the canvas to
    dom: {
        createContainer: true // This allows us to use HTML DOM elements within our scenes
    },
    width: 1280,       // Game width in pixels
    height: 720,      // Game height in pixels
    backgroundColor: '#353740', // A dark grey background color
    scene: [
        // An array of all scenes in our game
        // The first scene in the array is the one that starts
        IntroScene,
        PlayerSelectScene,
        MultiplayerSelectScene,
        GameScene
    ]
};

// Create a new Phaser game instance
const game = new Phaser.Game(config);
