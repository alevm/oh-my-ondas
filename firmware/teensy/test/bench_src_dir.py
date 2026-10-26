# PlatformIO pre-script for [env:bench]: src_dir is global (teensy/) and
# .ino files are converted only at the top of src_dir, so point this
# environment's source folder at a sketch under teensy/test/.
# BENCH_SKETCH picks it (default bench_all), e.g. BENCH_SKETCH=demo_play.
import os
Import("env")
sketch = os.environ.get("BENCH_SKETCH", "bench_all")
if not sketch.replace("_", "").isalnum():
    raise SystemExit("BENCH_SKETCH must be a folder name under teensy/test/")
env.Replace(PROJECT_SRC_DIR="$PROJECT_DIR/teensy/test/" + sketch)
