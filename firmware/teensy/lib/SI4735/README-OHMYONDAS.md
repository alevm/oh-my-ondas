# PU2CLR SI4735 2.1.8, patched for Oh My Ondas

Upstream: https://github.com/pu2clr/SI4735 (MIT, see license.txt).

The upstream library always uses the global `Wire` (223 calls in SI4735.cpp,
5 in SI4735.h). On Oh My Ondas the radio sits on `Wire2` with the other UI
parts, so this copy:

- replaces every `Wire.` with `wire->` (`sed 's/\bWire\./wire->/g'`);
- adds a protected member `TwoWire *wire = &Wire;`;
- adds `setI2CBus(TwoWire *bus)`, to call before `setup()`.

Nothing else changed. Note that `setup()` and `getDeviceI2CAddress()` call
`wire->begin()`, which resets the bus clock to 100 kHz on Teensy 4: set the
clock again afterwards.

To update: copy the new upstream `src/` here and repeat the three steps.

`library.json` silences two upstream warnings in SI4735.cpp
(misleading indentation at the SSB patch loop, `mjd` maybe-uninitialized in
the RDS date code) so the firmware build stays at its existing warnings.
