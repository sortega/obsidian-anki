# Testing Guide

This project uses [Jest](https://jestjs.io/) with TypeScript support for unit testing.

## Setup

The testing framework is already configured. Dependencies are installed automatically with:

```bash
npm install
```

## Running Tests

### Run all tests once
```bash
npm test
```

### Run tests in watch mode (re-runs on file changes)
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

## Test Structure

- **Test files**: Located in `tests/` directory with `.test.ts` extension
- **Test configuration**: `jest.config.js`
- **Setup file**: `tests/setup.ts` for global test configuration

## Writing Tests

Tests follow the standard Jest pattern:

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      const result = component.method(input);
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

## Mocking

- External dependencies (like `yanki-connect`) are mocked to isolate unit tests
- Real libraries (like `turndown`) are used when possible to test actual behavior
- Selective mocking only when testing specific error scenarios

## Test Philosophy

Tests aim to:
- Verify correct functionality under normal conditions
- Handle edge cases gracefully
- Preserve data integrity when operations fail
- Serve as living documentation of expected behavior