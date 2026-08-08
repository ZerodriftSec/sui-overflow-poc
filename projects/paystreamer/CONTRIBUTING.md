# Contributing to PayStreamer

First off, thank you for considering contributing to PayStreamer! It's people like you that make decentralized tools great.

## How Can I Contribute?

### Reporting Bugs
If you find a bug in the smart contracts, the frontend, or the scheduler scripts, please open an issue! Be sure to include:
- A clear descriptive title.
- Exact steps to reproduce the issue.
- Details about your environment (OS, Node version, Sui CLI version).

### Suggesting Enhancements
Have an idea for a new feature? We'd love to hear it. Please open an issue outlining:
- The problem your feature solves.
- A proposed technical implementation.

### Pull Requests
1. Fork the repository and create your branch from `main`.
2. Ensure you have run `pnpm install` and that your local development environment works.
3. If you've added code that should be tested, add tests! (For both React frontend and Move modules).
4. Run formatting tools if configured.
5. Submit your Pull Request with a clear description of the changes.

## Development Setup

See the [README.md](README.md) for detailed setup instructions. 

### Move Smart Contracts
If you modify the smart contracts in `move/subscriptions/sources`, make sure you build and test them before submitting:

```bash
cd move/subscriptions
sui move build
sui move test
```

If you modify function signatures or struct fields, make sure to update the frontend components that rely on the JSON object structures.

### Styleguides
- **TypeScript/React**: Follow standard React functional component patterns. Prefer hooks.
- **Move**: Follow the [Sui Move Style Guide](https://docs.sui.io/concepts/sui-move-concepts/conventions).

## Code of Conduct
Please be respectful and constructive in issues and pull requests. Harassment of any kind will not be tolerated.
