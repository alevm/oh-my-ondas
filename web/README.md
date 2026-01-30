# Oh My Ondas - Web Prototype v2.0

A browser-based proof-of-concept for the Oh My Ondas portable music instrument.

## Features

- **Microphone Input** - Capture ambient audio
- **Sample Player** - 8 touch pads with synthesized percussion
- **Synthesizer** - Oscillator + noise generator with filter and ADSR
- **Internet Radio** - Stream from thousands of stations worldwide
- **5-Channel Mixer** - Volume, mute, and 3-band EQ per channel
- **8-Track Sequencer** - With P-locks and conditional triggers
- **Scene System** - A/B/C/D scenes with crossfader morphing
- **AI Generation** - Vibe-based pattern generation with GPS awareness
- **GPS Tracking** - Automatic location embedding and local radio discovery
- **Session Recording** - Export audio with metadata

## v2.0 Highlights

- **Bigger UI** - Larger text, buttons, and controls throughout
- **No Dropdowns** - All selectors replaced with button groups
- **8 CTRL Knobs** - FREQ, FILT, DLY, GRN, RES, DRV, PAN, VOL
- **Enlarged Header** - 96px with transport, tempo, mini map
- **Full-Width Scenes** - Large A/B/C/D buttons
- **Hover Tooltips** - Help text on all interactive elements

## Quick Start (Local)

```bash
cd oh-my-ondas-web

# Python 3
python -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

Then open http://localhost:8080

**Note:** GPS requires HTTPS. For local testing, audio features work but GPS will show an error.

## Deploy to GitHub Pages

1. Create a GitHub repository
2. Push this folder to the `main` branch
3. Go to Settings > Pages > Source: `main` branch
4. Your app will be at `https://yourusername.github.io/repo-name`

## Deploy to Netlify (Drag & Drop)

1. Go to https://app.netlify.com/drop
2. Drag the `oh-my-ondas-web` folder
3. Get your HTTPS URL instantly

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| SPACE | Play/Pause |
| R | Record |
| ESC | Stop All |
| 1-8 | Trigger Pads |
| Up/Down | Select Track |
| D | Toggle Dub Mode |
| F (hold) | Fill Mode |
| Q/W/E/T (hold) | Punch FX |
| G | Generate Pattern |
| ? | Show Help |

## File Structure

```
oh-my-ondas-web/
├── index.html          # Main HTML
├── VERSION             # Version number
├── css/
│   └── style.css       # Styling
├── js/
│   ├── app.js          # Main controller
│   ├── audio-engine.js # Core audio routing
│   ├── gps.js          # Location tracking
│   ├── mic-input.js    # Microphone capture
│   ├── sampler.js      # 8-pad sample player
│   ├── synth.js        # Oscillator + ADSR
│   ├── radio.js        # Internet radio
│   ├── recorder.js     # Session recording
│   ├── sequencer.js    # 8-track sequencer
│   ├── scenes.js       # Scene management
│   ├── mangle.js       # FX processing
│   ├── ai-composer.js  # AI pattern generation
│   └── arrangement.js  # Arrangement tools
└── samples/            # (Optional) Custom samples
```

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari/iOS: Works (tap to start audio required)

## Export Format

Recordings are saved as WebM/Opus with a JSON metadata sidecar:

```json
{
  "name": "ohmyondas_2025-01-15_14-30-00",
  "timestamp": "2025-01-15T14:30:00.000Z",
  "duration_ms": 45000,
  "gps": {
    "latitude": 40.4168,
    "longitude": -3.7038,
    "accuracy": 5,
    "formatted": "40.41680°N, 3.70380°W"
  },
  "app": "Oh My Ondas Web",
  "version": "2.0.0"
}
```

## License

Open source - part of the Oh My Ondas project.
