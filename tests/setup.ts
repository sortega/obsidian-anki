// Jest setup file for global test configuration

// Mock console.warn to avoid noise in test output
global.console = {
  ...console,
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

// Mock global objects that might be needed by Obsidian modules
global.window = global.window || {};
global.document = global.document || {};

// Make this a module
export {};