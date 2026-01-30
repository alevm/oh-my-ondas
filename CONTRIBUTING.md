# Contributing to Oh My Ondas

Thank you for your interest in contributing. This document outlines the process for submitting bug reports, proposing features, setting up a development environment, and opening pull requests.

## Bug Reports

Please use [GitHub Issues](../../issues) to report bugs. Include the following in your report:

- Browser and version
- Operating system and version
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Any relevant logs or screenshots

## Feature Proposals

Before writing code for a new feature, open an issue first to discuss it. Describe the use case, the problem it solves, and how you envision the solution. This avoids duplicate work and ensures alignment with project goals.

## Development Setup

Clone the repository:

```
git clone https://github.com/<your-fork>/OhMyOndas.git
cd OhMyOndas
```

**Web** -- serve the front-end locally:

```
cd web && python3 -m http.server 8080
```

**Tests** -- install dependencies and run the test suite:

```
cd tests && npm install && npm test
```

**Firmware** -- build with PlatformIO:

```
cd firmware && pip install platformio && pio run
```

## Code Style

**JavaScript:** ES6+ syntax, 4-space indentation. Semicolons are optional -- follow the style already present in the file you are editing.

**C++:** PascalCase for class names, camelCase for functions and variables, UPPER_CASE for constants.

**Python:** Follow PEP 8. Use snake_case for functions, methods, and variables.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Keep commits focused -- one logical change per commit.
3. Ensure linting passes before pushing:
   - JavaScript: `eslint`
   - Python: `flake8`
4. Update documentation if your change affects usage or public APIs.
5. Open a pull request against `main` with a clear description of the change.

## License

By contributing to this project you agree that your contributions will be licensed under the [GPL-3.0](LICENSE) license.
