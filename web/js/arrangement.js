// Oh My Ondas - Arrangement System (Scene Sequencing)
// Allows sequencing scenes in ORCHESTRATE mode for playback in PERFORM mode

class Arrangement {
    constructor() {
        // Arrangement is a list of blocks, each referencing a scene
        // Each block: { scene: 0-3, bars: number, repeat: number }
        this.blocks = [];
        this.currentBlockIndex = 0;
        this.currentBar = 0;
        this.playing = false;
        this.barCounter = 0;
        this.beatsPerBar = 4;
        this.stepsPerBeat = 4; // 16th notes
    }

    init() {
        // Default arrangement: just scene A for 4 bars
        this.blocks = [
            { scene: 0, bars: 4, label: 'A' }
        ];
        console.log('Arrangement initialized');
        return true;
    }

    // Add a block to the arrangement
    addBlock(sceneIndex, bars = 4) {
        if (sceneIndex < 0 || sceneIndex > 3) return;
        this.blocks.push({
            scene: sceneIndex,
            bars: bars,
            label: ['A', 'B', 'C', 'D'][sceneIndex]
        });
        this.updateUI();
    }

    // Remove a block
    removeBlock(blockIndex) {
        if (blockIndex >= 0 && blockIndex < this.blocks.length) {
            this.blocks.splice(blockIndex, 1);
            this.updateUI();
        }
    }

    // Move block up/down
    moveBlock(blockIndex, direction) {
        const newIndex = blockIndex + direction;
        if (newIndex >= 0 && newIndex < this.blocks.length) {
            const temp = this.blocks[blockIndex];
            this.blocks[blockIndex] = this.blocks[newIndex];
            this.blocks[newIndex] = temp;
            this.updateUI();
        }
    }

    // Set block duration
    setBlockBars(blockIndex, bars) {
        if (blockIndex >= 0 && blockIndex < this.blocks.length) {
            this.blocks[blockIndex].bars = Math.max(1, Math.min(32, bars));
            this.updateUI();
        }
    }

    // Clear arrangement
    clear() {
        this.blocks = [];
        this.currentBlockIndex = 0;
        this.currentBar = 0;
        this.updateUI();
    }

    // Get total bars
    getTotalBars() {
        return this.blocks.reduce((sum, b) => sum + b.bars, 0);
    }

    // Start arrangement playback
    play() {
        if (this.blocks.length === 0) {
            console.log('Arrangement empty - add some blocks');
            return;
        }

        this.playing = true;
        this.currentBlockIndex = 0;
        this.currentBar = 0;
        this.barCounter = 0;

        // Load first scene
        this.loadCurrentScene();

        // Subscribe to sequencer steps to count bars
        this.originalStepCallback = window.sequencer.stepCallback;
        window.sequencer.onStep((step) => {
            // Call original callback
            if (this.originalStepCallback) {
                this.originalStepCallback(step);
            }

            // Count steps to track bars
            if (step === 0) {
                this.barCounter++;
                if (this.barCounter >= this.beatsPerBar) {
                    this.barCounter = 0;
                    this.onBarComplete();
                }
            }
        });

        // Start sequencer if not already playing
        if (!window.sequencer.isPlaying()) {
            window.sequencer.play();
        }

        this.updateUI();
        console.log('Arrangement started');
    }

    // Stop arrangement
    stop() {
        this.playing = false;

        // Restore original step callback
        if (this.originalStepCallback) {
            window.sequencer.onStep(this.originalStepCallback);
        }

        this.updateUI();
        console.log('Arrangement stopped');
    }

    // Called when a bar completes
    onBarComplete() {
        if (!this.playing) return;

        this.currentBar++;
        const currentBlock = this.blocks[this.currentBlockIndex];

        if (this.currentBar >= currentBlock.bars) {
            // Move to next block
            this.currentBlockIndex++;
            this.currentBar = 0;

            if (this.currentBlockIndex >= this.blocks.length) {
                // Arrangement complete - loop or stop
                this.currentBlockIndex = 0; // Loop
                console.log('Arrangement looped');
            }

            // Load the new scene
            this.loadCurrentScene();
        }

        this.updateUI();
    }

    // Load the scene for current block
    loadCurrentScene() {
        const block = this.blocks[this.currentBlockIndex];
        if (block && window.sceneManager.hasScene(block.scene)) {
            window.sceneManager.recallScene(block.scene);
            console.log(`Arrangement: Playing scene ${block.label}, bar ${this.currentBar + 1}/${block.bars}`);
        }
    }

    // Get current position info
    getPosition() {
        const block = this.blocks[this.currentBlockIndex];
        return {
            blockIndex: this.currentBlockIndex,
            blockLabel: block?.label || '-',
            bar: this.currentBar + 1,
            totalBars: block?.bars || 0,
            totalBlocks: this.blocks.length
        };
    }

    // Update arrangement UI
    updateUI() {
        const container = document.getElementById('arrangementBlocks');
        const posDisplay = document.getElementById('arrangementPosition');

        if (container) {
            if (this.blocks.length === 0) {
                container.innerHTML = '<div class="arr-empty">Add scenes to build arrangement</div>';
            } else {
                container.innerHTML = this.blocks.map((block, idx) => `
                    <div class="arr-block ${idx === this.currentBlockIndex && this.playing ? 'active' : ''}"
                         data-index="${idx}">
                        <div class="arr-block-scene">${block.label}</div>
                        <div class="arr-block-bars">${block.bars} bars</div>
                        <button class="arr-block-remove" data-index="${idx}">&times;</button>
                    </div>
                `).join('');

                // Add click handlers
                container.querySelectorAll('.arr-block-remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeBlock(parseInt(btn.dataset.index));
                    });
                });
            }
        }

        if (posDisplay && this.playing) {
            const pos = this.getPosition();
            posDisplay.textContent = `${pos.blockLabel} ${pos.bar}/${pos.totalBars}`;
        } else if (posDisplay) {
            posDisplay.textContent = `${this.blocks.length} blocks, ${this.getTotalBars()} bars`;
        }
    }

    // Get arrangement data for AI
    getStructure() {
        return {
            blocks: this.blocks.map(b => ({
                scene: b.scene,
                label: b.label,
                bars: b.bars,
                // Include scene data if available
                sceneData: window.sceneManager.getScene(b.scene)
            })),
            totalBars: this.getTotalBars()
        };
    }
}

// Global instance
window.arrangement = new Arrangement();
