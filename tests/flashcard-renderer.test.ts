// Mock Obsidian's modules
jest.mock('obsidian', () => ({
  MarkdownRenderChild: class {
    constructor() {}
    onload() {}
    onunload() {}
    register() {}
  },
  MarkdownView: class {},
}), { virtual: true });

import { FlashcardRenderer } from '../flashcard-renderer';
import { HtmlFlashcard } from '../flashcard';
import { createDocument, createMockHtmlFlashcard } from './test-helpers';

describe('FlashcardRenderer', () => {
  let renderer: FlashcardRenderer;
  let mockApp: any;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Create mock app with vault adapter
    mockApp = {
      vault: {
        getName: () => 'test-vault',
        adapter: {
          getResourcePath: jest.fn().mockImplementation((path: string) => `app://local/${path}`)
        }
      },
      workspace: {
        openLinkText: jest.fn().mockResolvedValue(undefined),
        getActiveViewOfType: jest.fn().mockReturnValue(null)
      }
    };

    // Create mock container element
    mockContainer = document.createElement('div');

    // Mock Obsidian-specific DOM methods
    (mockContainer as any).empty = jest.fn();
    (mockContainer as any).addClass = jest.fn();
    (mockContainer as any).createEl = jest.fn().mockImplementation((tag: string, options?: any) => {
      const element = document.createElement(tag);
      if (options?.cls) element.className = options.cls;
      if (options?.text) element.textContent = options.text;
      (element as any).createEl = jest.fn().mockImplementation((tag: string, options?: any) => {
        const child = document.createElement(tag);
        if (options?.cls) child.className = options.cls;
        if (options?.text) child.textContent = options.text;
        return child;
      });
      return element;
    });

    const htmlFlashcard = createMockHtmlFlashcard({
      Front: '<p>Question with image: <img src="relative/image.png" alt="test"></p>',
      Back: '<p>Answer</p>'
    });

    renderer = new FlashcardRenderer(mockContainer, htmlFlashcard, 'Default', mockApp);
  });

  describe('resolveImageSources', () => {
    it('should resolve relative image paths to absolute paths', () => {
      const doc = createDocument('<p>Test <img src="folder/image.png" alt="test"> content</p>');
      
      const result = renderer['resolveImageSources'](doc);
      
      // Should contain the resolved path
      expect(result).toContain('app://local/folder/image.png');
    });

    it('should return original content if parsing fails', () => {
      const doc = createDocument('<p>Test <img src="folder/image.png" alt="test"> content</p>');
      const expectedContent = doc.body.innerHTML;
      
      // Mock cloneNode to throw an error
      const originalCloneNode = doc.cloneNode;
      doc.cloneNode = jest.fn().mockImplementation(() => {
        throw new Error('cloneNode failed');
      });
      
      const result = renderer['resolveImageSources'](doc);
      
      // Should return original content unchanged
      expect(result).toBe(expectedContent);

      // Restore original cloneNode
      doc.cloneNode = originalCloneNode;
    });

    it('should not modify external URLs', () => {
      const doc = createDocument('<p>Test <img src="https://example.com/image.png" alt="test"> content</p>');
      
      const result = renderer['resolveImageSources'](doc);
      
      // Should keep external URLs unchanged
      expect(result).toContain('https://example.com/image.png');
    });

    it('should not modify data URLs', () => {
      const doc = createDocument('<p>Test <img src="data:image/png;base64,iVBORw0KGgo=" alt="test"> content</p>');
      
      const result = renderer['resolveImageSources'](doc);
      
      // Should keep data URLs unchanged
      expect(result).toContain('data:image/png;base64,iVBORw0KGgo=');
    });
  });

  describe('isRelativePath', () => {
    it('should identify relative paths correctly', () => {
      expect(renderer['isRelativePath']('folder/image.png')).toBe(true);
      expect(renderer['isRelativePath']('image.png')).toBe(true);
      expect(renderer['isRelativePath']('subfolder/another/image.jpg')).toBe(true);
    });

    it('should reject absolute URLs', () => {
      expect(renderer['isRelativePath']('https://example.com/image.png')).toBe(false);
      expect(renderer['isRelativePath']('http://example.com/image.png')).toBe(false);
      expect(renderer['isRelativePath']('file:///path/to/image.png')).toBe(false);
    });

    it('should reject data URLs', () => {
      expect(renderer['isRelativePath']('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(renderer['isRelativePath']('/absolute/path/image.png')).toBe(false);
    });
  });
});
