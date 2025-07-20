// Mock the required dependencies for SyncProgressModal
jest.mock('yanki-connect', () => ({
  YankiConnect: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

// Mock Obsidian's modules
jest.mock('obsidian', () => ({
  Modal: class {
    constructor() {}
    open() {}
    close() {}
  },
  Notice: jest.fn(),
  MarkdownRenderChild: class {
    constructor() {}
    onload() {}
    onunload() {}
  },
  MarkdownView: class {},
  TFile: class {},
}), { virtual: true });

import { SyncProgressModal } from '../sync-analysis';
import { HtmlFlashcard } from '../flashcard';
import { createDocument, createMockHtmlFlashcard } from './test-helpers';

// Mock DOMParser for Jest environment
global.DOMParser = jest.fn().mockImplementation(() => ({
  parseFromString: jest.fn().mockImplementation((htmlString: string) => ({
    querySelectorAll: jest.fn().mockImplementation((selector: string) => {
      if (selector === 'img') {
        // Simple regex-based implementation for testing
        const imgRegex = /<img[^>]+>/g;
        const matches = [];
        let match;
        while ((match = imgRegex.exec(htmlString)) !== null) {
          const srcMatch = match[0].match(/src\s*=\s*["']([^"']+)["']/);
          if (srcMatch) {
            matches.push({
              getAttribute: () => srcMatch[1]
            });
          }
        }
        return matches;
      }
      return [];
    })
  }))
}));

describe('Media Extraction from HTML', () => {
  let modal: any;

  beforeEach(() => {
    // Create a mock app object
    const mockApp = {
      vault: { getName: () => 'test-vault' },
      metadataCache: {},
      workspace: {}
    } as any;
    
    const mockAnkiService = {} as any;
    const mockNoteTypes = [] as any;
    const mockSettings = { defaultDeck: 'Default' };
    const mockOnComplete = jest.fn();

    modal = new SyncProgressModal(mockApp, mockAnkiService, mockNoteTypes, mockSettings, mockOnComplete);
  });

  it('should extract src attributes from img tags in HTML content', () => {
    const htmlFlashcard = createMockHtmlFlashcard({
      Front: '<p>Question with image: <img src="image.png" alt="test"> and another <img src="photo.jpg"></p>',
      Back: '<p>Answer</p>'
    });

    const mediaPaths = (modal as any).extractMediaPaths(htmlFlashcard);
    
    expect(mediaPaths).toEqual(['image.png', 'photo.jpg']);
  });

  it('should filter out external URLs', () => {
    const htmlFlashcard = createMockHtmlFlashcard({
      Front: '<img src="https://example.com/external.png"> <img src="internal.png">',
      Back: '<img src="http://another.com/image.jpg">'
    });

    const mediaPaths = (modal as any).extractMediaPaths(htmlFlashcard);
    
    expect(mediaPaths).toEqual(['internal.png']);
  });

  it('should filter out data URLs', () => {
    const htmlFlashcard = createMockHtmlFlashcard({
      Front: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="> <img src="valid.png">',
      Back: '<p>Answer</p>'
    });

    const mediaPaths = (modal as any).extractMediaPaths(htmlFlashcard);
    
    expect(mediaPaths).toEqual(['valid.png']);
  });

  it('should filter by media file extensions', () => {
    const htmlFlashcard = createMockHtmlFlashcard({
      Front: '<img src="image.png"> <img src="document.pdf"> <img src="video.mp4">',
      Back: '<img src="not-media.txt">'
    });

    const mediaPaths = (modal as any).extractMediaPaths(htmlFlashcard);
    
    expect(mediaPaths).toEqual(['image.png', 'video.mp4']);
  });
});
