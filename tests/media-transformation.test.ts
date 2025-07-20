/**
 * Test to verify our actual media transformation pipeline works correctly
 */

import { YankiConnectAnkiService, MediaItem } from '../anki-service';
import { createDocument } from './test-helpers';

// Mock yanki-connect for the tests
jest.mock('yanki-connect', () => ({
  YankiConnect: jest.fn().mockImplementation(() => ({
    media: {
      storeMediaFile: jest.fn().mockResolvedValue('stored-filename'),
      retrieveMediaFile: jest.fn().mockResolvedValue('base64-content'),
    }
  })),
}), { virtual: true });

describe('Media Transformation Pipeline', () => {
	let service: YankiConnectAnkiService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new YankiConnectAnkiService();
	});

	it('should correctly transform HTML with complex file paths', () => {
		// Test media items with various special characters
		const mediaItems: MediaItem[] = [
			{
				sourcePath: 'folder/subfolder/image.png',
				contents: new Uint8Array([1, 2, 3, 4])
			},
			{
				sourcePath: 'my folder/image with spaces.jpg',
				contents: new Uint8Array([5, 6, 7, 8])
			},
			{
				sourcePath: 'special&chars#test.gif',
				contents: new Uint8Array([9, 10, 11, 12])
			}
		];

		// Original HTML with relative paths
		const originalHtml = `
			<p>Test content with images:</p>
			<img src="folder/subfolder/image.png" alt="nested">
			<img src="my folder/image with spaces.jpg" alt="spaces">
			<img src="special&chars#test.gif" alt="special">
			<img src="https://external.com/image.png" alt="external">
		`;

		const doc = createDocument(originalHtml);

		// Use the actual transformation method from our service
		(service as any).transformDocumentForAnki(doc, mediaItems);

		const transformedHtml = doc.body.innerHTML;

		// Verify that relative paths are replaced with base64-encoded Anki filenames
		expect(transformedHtml).toContain('obsidian-synced-Zm9sZGVyL3N1YmZvbGRlci9pbWFnZS5wbmc=-'); // btoa('folder/subfolder/image.png')
		expect(transformedHtml).toContain('obsidian-synced-bXkgZm9sZGVyL2ltYWdlIHdpdGggc3BhY2VzLmpwZw==-'); // btoa('my folder/image with spaces.jpg')
		expect(transformedHtml).toContain('obsidian-synced-c3BlY2lhbCZjaGFycyN0ZXN0LmdpZg==-'); // btoa('special&chars#test.gif')
		
		// Verify that external URLs are NOT changed
		expect(transformedHtml).toContain('https://external.com/image.png');
		
		// Verify that original relative paths are completely replaced
		expect(transformedHtml).not.toContain('folder/subfolder/image.png');
		expect(transformedHtml).not.toContain('my folder/image with spaces.jpg');
		expect(transformedHtml).not.toContain('special&chars#test.gif');
	});

	it('should handle reverse transformation correctly', () => {
		// HTML with Anki filenames (as it would come from Anki)
		// Use realistic 32-character MD5 hashes (hex only: 0-9, a-f)
		const ankiHtml = `
			<p>Content from Anki:</p>
			<img src="obsidian-synced-Zm9sZGVyL3N1YmZvbGRlci9pbWFnZS5wbmc=-abcdef0123456789abcdef0123456789.png" alt="nested">
			<img src="obsidian-synced-bXkgZm9sZGVyL2ltYWdlIHdpdGggc3BhY2VzLmpwZw==-fedcba9876543210fedcba9876543210.jpg" alt="spaces">
		`;

		const doc = createDocument(ankiHtml);

		// Use the actual reverse transformation method
		(service as any).transformDocumentFromAnki(doc);

		const transformedHtml = doc.body.innerHTML;

		// Verify that Anki filenames are replaced with original paths
		expect(transformedHtml).toContain('folder/subfolder/image.png');
		expect(transformedHtml).toContain('my folder/image with spaces.jpg');
		
		// Verify that Anki filenames are completely replaced
		expect(transformedHtml).not.toContain('obsidian-synced-Zm9sZGVyL3N1YmZvbGRlci9pbWFnZS5wbmc=-abcdef0123456789abcdef0123456789.png');
		expect(transformedHtml).not.toContain('obsidian-synced-bXkgZm9sZGVyL2ltYWdlIHdpdGggc3BhY2VzLmpwZw==-fedcba9876543210fedcba9876543210.jpg');
	});

	it('should generate consistent filenames for the same content', () => {
		const mediaItem: MediaItem = {
			sourcePath: 'test/path/image.png',
			contents: new Uint8Array([1, 2, 3, 4, 5])
		};

		// Generate filename multiple times
		const filename1 = (service as any).generateAnkiMediaFilename(mediaItem);
		const filename2 = (service as any).generateAnkiMediaFilename(mediaItem);

		// Should be identical
		expect(filename1).toBe(filename2);
		
		// Should follow the expected pattern
		expect(filename1).toMatch(/^obsidian-synced-dGVzdC9wYXRoL2ltYWdlLnBuZw==-[a-f0-9]{32}\.png$/); // btoa('test/path/image.png')
	});

	it('should generate different filenames for different content', () => {
		const mediaItem1: MediaItem = {
			sourcePath: 'same/path/image.png',
			contents: new Uint8Array([1, 2, 3, 4])
		};

		const mediaItem2: MediaItem = {
			sourcePath: 'same/path/image.png', // Same path
			contents: new Uint8Array([5, 6, 7, 8]) // Different content
		};

		const filename1 = (service as any).generateAnkiMediaFilename(mediaItem1);
		const filename2 = (service as any).generateAnkiMediaFilename(mediaItem2);

		// Should be different due to different content hash
		expect(filename1).not.toBe(filename2);
		
		// But both should have the same encoded path part
		expect(filename1).toContain('c2FtZS9wYXRoL2ltYWdlLnBuZw=='); // btoa('same/path/image.png')
		expect(filename2).toContain('c2FtZS9wYXRoL2ltYWdlLnBuZw=='); // btoa('same/path/image.png')
	});

	it('should handle edge cases in file paths', () => {
		const edgeCases = [
			'simple.png',                    // No folder
			'folder/image.png',             // Simple folder
			'deep/nested/folder/image.png', // Deep nesting
			'no-extension',                 // No file extension
			'file.with.multiple.dots.png',  // Multiple dots
			'üñíçødé.png',                 // Unicode characters
		];

		edgeCases.forEach(sourcePath => {
			const mediaItem: MediaItem = {
				sourcePath,
				contents: new Uint8Array([1, 2, 3, 4])
			};

			// Should not throw an error
			expect(() => {
				const filename = (service as any).generateAnkiMediaFilename(mediaItem);
				expect(filename).toMatch(/^obsidian-synced-.*-[a-f0-9]{32}/);
			}).not.toThrow();
		});
	});
});
