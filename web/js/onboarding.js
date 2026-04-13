// Oh My Ondas — First-time User Onboarding Walkthrough
// Guided tour of the 8-track interface

class Onboarding {
    constructor() {
        this.steps = [
            {
                target: '.seq-header',
                title: '1/8 — Sequencer',
                text: 'This is the step sequencer. Each row is a track, each column is a 16th note. Click cells to toggle steps on/off.',
                position: 'bottom'
            },
            {
                target: '.src-btns',
                title: '2/8 — Source Select',
                text: 'Each track plays one source: Sampler (SMP), Synth (SYN), Radio (RAD), or Microphone (MIC). Click to assign.',
                position: 'bottom'
            },
            {
                target: '.mixer-channels',
                title: '3/8 — Mixer',
                text: 'Four channels plus master output. Adjust volume faders, pan knobs, mute/solo, and per-channel gain.',
                position: 'top'
            },
            {
                target: '#panelTabs, .panel-tabs',
                title: '4/8 — Panel Tabs',
                text: 'Switch between panels: SEQ, MIX, PADS, CTRL, SYN, SCENES, AI, FX, RADIO, EQ, and JOURNEY.',
                position: 'bottom'
            },
            {
                target: '.transport-panel, .sidebar-transport',
                title: '5/8 — Transport',
                text: 'Play, stop, and record. Use Space to toggle playback. Adjust tempo with the BPM slider or TAP button.',
                position: 'bottom'
            },
            {
                target: '.pattern-btns',
                title: '6/8 — Pattern Banks',
                text: '8 pattern slots (A-H). Create different patterns and switch between them during performance.',
                position: 'bottom'
            },
            {
                target: '.synth-section, .panel.synth-panel',
                title: '7/8 — Synth Engine',
                text: 'Dual-oscillator synth with filter, ADSR envelope, and multiple waveforms. Route it to any track.',
                position: 'top'
            },
            {
                target: '#gpsBox, .gps-inline',
                title: '8/8 — GPS Location',
                text: 'Your GPS coordinates feed into the AI composer and journey recorder. Allow location access for full features.',
                position: 'bottom'
            }
        ];
        this.currentStep = 0;
        this.active = false;
        this.overlay = null;
        this.tooltip = null;
    }

    init() {
        // Check if user has already seen the tour
        if (localStorage.getItem('ohmyondas_onboarded')) return;

        // Add start button to help area
        this.injectStartButton();

        // Auto-start on first visit (with delay for app init)
        setTimeout(() => {
            if (!localStorage.getItem('ohmyondas_onboarded')) {
                this.start();
            }
        }, 1500);
    }

    injectStartButton() {
        const helpBtn = document.getElementById('btnHelp') || document.getElementById('btnHelpE');
        if (!helpBtn) return;
        const tourBtn = document.createElement('button');
        tourBtn.className = 'help-btn tour-btn';
        tourBtn.textContent = '?';
        tourBtn.title = 'Start guided tour';
        tourBtn.style.cssText = 'font-size:11px; padding:2px 6px; margin-left:4px; background:#278789; color:#fff; border:none; border-radius:4px; cursor:pointer;';
        tourBtn.textContent = 'TOUR';
        tourBtn.addEventListener('click', () => this.start());
        helpBtn.parentNode.insertBefore(tourBtn, helpBtn.nextSibling);
    }

    start() {
        this.active = true;
        this.currentStep = 0;
        this.createOverlay();
        this.showStep(0);
    }

    createOverlay() {
        // Remove existing
        if (this.overlay) this.overlay.remove();

        this.overlay = document.createElement('div');
        this.overlay.id = 'onboardingOverlay';
        this.overlay.innerHTML = `
            <div class="onboarding-backdrop"></div>
            <div class="onboarding-tooltip" id="onboardingTooltip">
                <div class="onboarding-title"></div>
                <div class="onboarding-text"></div>
                <div class="onboarding-nav">
                    <button class="onboarding-btn onboarding-skip">Skip Tour</button>
                    <div class="onboarding-dots"></div>
                    <button class="onboarding-btn onboarding-next">Next</button>
                </div>
            </div>
            <div class="onboarding-highlight" id="onboardingHighlight"></div>
        `;
        document.body.appendChild(this.overlay);

        // Style
        const style = document.createElement('style');
        style.id = 'onboardingStyle';
        style.textContent = `
            .onboarding-backdrop {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6); z-index: 9998;
            }
            .onboarding-highlight {
                position: absolute; z-index: 9999;
                border: 2px solid #278789;
                border-radius: 6px;
                box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 20px rgba(39,135,137,0.6);
                pointer-events: none;
                transition: all 0.3s ease;
            }
            .onboarding-tooltip {
                position: absolute; z-index: 10000;
                background: #1a3535; color: #fff;
                border-radius: 10px; padding: 16px 20px;
                max-width: 320px; min-width: 250px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                border: 1px solid #278789;
                transition: all 0.3s ease;
            }
            .onboarding-title {
                font-size: 14px; font-weight: 800;
                color: #278789; margin-bottom: 6px;
                letter-spacing: 1px; text-transform: uppercase;
            }
            .onboarding-text {
                font-size: 13px; line-height: 1.5;
                color: rgba(255,255,255,0.8);
            }
            .onboarding-nav {
                display: flex; align-items: center;
                justify-content: space-between;
                margin-top: 14px; gap: 8px;
            }
            .onboarding-btn {
                padding: 6px 14px; border-radius: 5px;
                font-size: 12px; font-weight: 700;
                cursor: pointer; border: none;
                letter-spacing: 0.5px; text-transform: uppercase;
            }
            .onboarding-next {
                background: #278789; color: #fff;
            }
            .onboarding-next:hover { background: #1e6d6f; }
            .onboarding-skip {
                background: transparent; color: rgba(255,255,255,0.4);
                border: 1px solid rgba(255,255,255,0.2);
            }
            .onboarding-skip:hover { color: #fff; border-color: #fff; }
            .onboarding-dots {
                display: flex; gap: 4px;
            }
            .onboarding-dot {
                width: 6px; height: 6px; border-radius: 50%;
                background: rgba(255,255,255,0.2);
            }
            .onboarding-dot.active { background: #278789; }
        `;
        document.head.appendChild(style);

        // Events
        this.overlay.querySelector('.onboarding-skip').addEventListener('click', () => this.finish());
        this.overlay.querySelector('.onboarding-next').addEventListener('click', () => this.next());
    }

    showStep(index) {
        if (index >= this.steps.length) { this.finish(); return; }

        const step = this.steps[index];
        const target = document.querySelector(step.target);
        const tooltip = this.overlay.querySelector('.onboarding-tooltip');
        const highlight = this.overlay.querySelector('.onboarding-highlight');

        // Update content
        tooltip.querySelector('.onboarding-title').textContent = step.title;
        tooltip.querySelector('.onboarding-text').textContent = step.text;

        // Update dots
        const dotsEl = tooltip.querySelector('.onboarding-dots');
        dotsEl.innerHTML = this.steps.map((_, i) =>
            `<div class="onboarding-dot ${i === index ? 'active' : ''}"></div>`
        ).join('');

        // Update button text
        const nextBtn = tooltip.querySelector('.onboarding-next');
        nextBtn.textContent = index === this.steps.length - 1 ? 'Finish' : 'Next';

        if (target) {
            const rect = target.getBoundingClientRect();
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

            // Position highlight
            highlight.style.top = (rect.top + scrollTop - 4) + 'px';
            highlight.style.left = (rect.left + scrollLeft - 4) + 'px';
            highlight.style.width = (rect.width + 8) + 'px';
            highlight.style.height = (rect.height + 8) + 'px';
            highlight.style.display = 'block';

            // Position tooltip
            if (step.position === 'bottom') {
                tooltip.style.top = (rect.bottom + scrollTop + 12) + 'px';
                tooltip.style.left = Math.max(10, rect.left + scrollLeft) + 'px';
            } else {
                tooltip.style.top = (rect.top + scrollTop - tooltip.offsetHeight - 12) + 'px';
                tooltip.style.left = Math.max(10, rect.left + scrollLeft) + 'px';
            }

            // Scroll into view
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            highlight.style.display = 'none';
            tooltip.style.top = '50%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }

    next() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.finish();
        } else {
            this.showStep(this.currentStep);
        }
    }

    finish() {
        this.active = false;
        localStorage.setItem('ohmyondas_onboarded', '1');
        if (this.overlay) this.overlay.remove();
        const style = document.getElementById('onboardingStyle');
        if (style) style.remove();
    }
}

window.onboarding = new Onboarding();
