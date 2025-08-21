# Testing Guide

This project uses Jest for unit and integration testing.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests in CI mode (for continuous integration)
npm run test:ci
```

## Test Structure

Tests are located alongside the source files they test:
- `src/entities/__tests__/` - Entity class tests
- `src/combat/__tests__/` - Combat system tests
- `src/world/__tests__/` - World generation tests
- `src/networking/__tests__/` - Networking tests

## Writing Tests

Tests follow this naming convention:
- Unit tests: `<ClassName>.test.ts`
- Integration tests: `<Feature>.integration.test.ts`

Example test structure:

```typescript
describe('ClassName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const instance = new ClassName();
      
      // Act
      const result = instance.method();
      
      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

## Coverage

Coverage reports are generated in the `coverage/` directory.
View the HTML report by opening `coverage/index.html` in a browser.

## CI/CD

Tests are configured to run automatically on:
- Every commit (via pre-commit hooks)
- Pull requests
- Main branch pushes

## Mocking

Three.js and WebGL are mocked for testing. See:
- `src/test/setup.ts` - Test environment setup
- `src/test/mocks/` - Mock implementations

## Best Practices

1. Write tests before or alongside new features
2. Maintain at least 80% code coverage
3. Test both happy paths and edge cases
4. Use descriptive test names
5. Keep tests isolated and independent
6. Mock external dependencies