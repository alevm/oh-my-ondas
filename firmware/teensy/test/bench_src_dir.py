# PlatformIO pre-script for [env:bench]: src_dir is global (teensy/) and
# .ino files are converted only at the top of src_dir, so point this
# environment's source folder at the bench sketch.
Import("env")
env.Replace(PROJECT_SRC_DIR="$PROJECT_DIR/teensy/test/bench_all")
