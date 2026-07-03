export default class IntroScene extends Phaser.Scene {
    constructor() {
        super('IntroScene');
    }

    create() {
        this.add.gradient = this.add.graphics();
        this.add.gradient.fillGradientStyle(0x1e2a3e, 0x1e2a3e, 0x0a121e, 0x0a121e, 1);
        this.add.gradient.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // --- TITLE --- 
        this.add.text(centerX, centerY - 150, "Baron Blackwood's Crazy Races", {
            font: 'bold 44px Arial', // Slightly smaller font to fit the longer name
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(centerX, centerY - 95, "Inspired by a certain Madcap Chase", {
            font: 'italic 20px Arial',
            fill: '#dddddd',
            align: 'center'
        }).setOrigin(0.5);

        // --- BUTTONS --- 
        const createButton = this.add.text(centerX, centerY + 50, 'Create Session', {
            font: '32px Arial',
            fill: '#00ff00',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        const joinButton = this.add.text(centerX, centerY + 120, 'Join Session', {
            font: '32px Arial',
            fill: '#ffff00',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        // --- JOIN SESSION INPUT (initially hidden) ---
        const joinForm = this.add.dom(centerX, centerY + 200).createFromHTML(`
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <input type="text" id="session-code" placeholder="Enter Session Code" style="font-size: 20px; padding: 10px; width: 250px; text-align: center;">
                <button id="join-game-btn" style="font-size: 20px; padding: 10px 20px;">Join</button>
            </div>
        `);
        joinForm.setVisible(false);

        // --- BUTTON EVENTS --- 
        createButton.on('pointerdown', () => {
            this.scene.start('PlayerSelectScene');
        });

        joinButton.on('pointerdown', () => {
            createButton.setVisible(false);
            joinButton.setVisible(false);
            joinForm.setVisible(true);
        });

        const joinGameBtn = joinForm.getChildByID('join-game-btn');
        joinGameBtn.addEventListener('click', () => {
            const sessionCode = joinForm.getChildByID('session-code').value;
            if (sessionCode) { // For now, any code is valid
                console.log(`Joining session with code: ${sessionCode}`);
                this.scene.start('PlayerSelectScene');
            }
        });
    }
}
