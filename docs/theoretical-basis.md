# Theoretical Basis

Oh My Ondas draws on a lineage of acoustic ecology, soundwalking, and psychogeographic practice. This document makes that lineage explicit and maps the project's internal taxonomy to established frameworks.

---

## 1. Lineage

### R. Murray Schafer — Soundscape Ecology (1977)

Schafer's *The Tuning of the World* (1977) introduced the vocabulary of soundscape studies: **keynote sounds** (background drones that define a place's acoustic character), **signals** (foreground sounds that demand attention), and **soundmarks** (community sounds unique to a locale, analogous to landmarks). Oh My Ondas operationalises this vocabulary: the `soundscape-analyzer.js` classification engine listens to a location and identifies its acoustic character, which then drives compositional decisions.

### Hildegard Westerkamp — Soundwalking (1974–present)

Westerkamp's soundwalking practice — attentive listening while moving through an environment — is the primary mode of interaction with Oh My Ondas. Her *Kits Beach Soundwalk* (1989) demonstrated that recorded environmental sound, when framed and processed, becomes compositional material rather than mere documentation. The Journey mode (`journey.js`) implements this: walking generates GPS breadcrumbs, and each waypoint captures a sonic snapshot that enters the compositional palette.

### Barry Truax — Hi-Fi / Lo-Fi Soundscapes

Truax extended Schafer's work with the hi-fi/lo-fi distinction: a **hi-fi soundscape** has low ambient noise and permits discrete sounds to be heard clearly (rural, dawn); a **lo-fi soundscape** is saturated with overlapping sound (urban, traffic). The `soundscape-analyzer.js` classification of `quiet` vs `chaotic` maps directly to this axis. When the analyzer detects a hi-fi environment, the instrument generates sparser, more transparent patterns; in lo-fi environments, denser textures emerge.

### Francisco Lopez — Blind Listening

Lopez's practice of profound listening — removing visual context to hear sound on its own terms — informs the instrument's non-representational approach. Captured sounds are not labelled or displayed as "bird" or "traffic"; they are treated as raw acoustic material with spectral properties (pitch, density, rhythm) that drive compositional roles.

### Akio Suzuki — Oto-Date (Sound Point, 1996–present)

Suzuki's *oto-date* marks — specific locations identified for their acoustic interest — parallel the Landmark feature (`landmark.js`). Both practices identify that certain places have sonic character worth attending to. The GPS-binding of compositions to coordinates makes each piece an oto-date: a sound that belongs to a place.

---

## 2. Soundscape Taxonomy Mapping

The `soundscape-analyzer.js` classifies environments into four categories. The following table maps each to Schafer's and Truax's established terminology and explains how the classification drives composition.

| Oh My Ondas category | Schafer equivalent | Truax equivalent | Compositional effect |
|---|---|---|---|
| `quiet` | Keynote-dominant (background hum, wind, distant traffic) | Hi-fi soundscape | Sparse patterns, long decays, low density. The instrument listens more than it speaks. |
| `rhythmic` | Signal-rich with periodic structure (footsteps, machinery, dripping) | — (rhythmic regularity is orthogonal to hi-fi/lo-fi) | Sequencer locks to detected tempo. Euclidean patterns align with environmental pulse. |
| `tonal` | Soundmark or signal with harmonic content (bells, engines at pitch, birdsong) | Hi-fi (discrete pitches audible) | `_tunePitchesToEnvironment` in `source-roles.js` detects dominant frequencies and tunes the synth and sampler pitch to match or harmonise. |
| `chaotic` | Lo-fi soundscape saturated with competing signals | Lo-fi soundscape | Dense patterns, high FX saturation, shorter decays. The instrument adds to the density rather than fighting it. |

### Divergences from Schafer

Schafer's taxonomy is descriptive (what *is* the sound?); the Oh My Ondas taxonomy is functional (what should the *instrument do* in response?). The `rhythmic` category has no direct Schafer equivalent — it describes a temporal property rather than a source-role property. This is intentional: the instrument needs to know whether to entrain to a pulse, not whether the sound is a keynote or signal.

---

## 3. "The Place Composes Itself"

`REQUIREMENTS.md` (section 2.1) states: "Captured sounds are not just layered on top of a beat. They ARE the beat, the melody, the texture." This principle derives from Westerkamp's compositional method: environmental sound is not illustration but material.

The implementation path:

1. **`_tunePitchesToEnvironment`** (in `source-roles.js`) — detects spectral peaks in the mic input and retunes melodic sources to match, so the instrument's pitch content is derived from the place.
2. **Source-role assignment** (`source-roles.js`) — maps each audio source (mic, radio, sampler, synth) to a compositional role (rhythm, texture, melody, modulation) based on the soundscape analysis. A droning environment promotes the mic to "texture"; a rhythmic environment promotes it to "rhythm".
3. **Modulation routing** — one source's amplitude can modulate another source's FX parameters, creating cross-dependencies that make the composition structurally shaped by the environment, not merely decorated.

---

## References

- Schafer, R. M. (1977). *The Tuning of the World*. McClelland and Stewart.
- Westerkamp, H. (1974). "Soundwalking." *Sound Heritage*, 3(4).
- Westerkamp, H. (1989). *Kits Beach Soundwalk* [electroacoustic composition].
- Truax, B. (2001). *Acoustic Communication* (2nd ed.). Ablex.
- Lopez, F. (1998). "Schizophonia vs. l'objet sonore." In *Soundscape: The Journal of Acoustic Ecology*.
- Suzuki, A. (1996–present). *Oto-date* [site-specific listening practice].
