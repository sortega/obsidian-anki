/**
 * Test to verify DOM setAttribute and innerHTML behavior with URL-encoded strings
 */

// Make this a module
export {};

describe('DOM URL Encoding Behavior', () => {
	let parser: DOMParser;

	beforeEach(() => {
		parser = new DOMParser();
	});

	it('should preserve URL-encoded characters in setAttribute and innerHTML', () => {
		// Create a test HTML document
		const doc = parser.parseFromString('<div><img src="original.png"></div>', 'text/html');
		const img = doc.querySelector('img');
		
		// Test filename with URL-encoded characters (like folder%2Fsubfolder)
		const encodedFilename = 'obsidian-synced-folder%2Fsubfolder%2Fimage.png-abc123def456.png';
		
		// Set the src attribute
		img?.setAttribute('src', encodedFilename);
		
		// Check what getAttribute returns
		const retrievedSrc = img?.getAttribute('src');
		console.log('Set:', encodedFilename);
		console.log('Retrieved via getAttribute:', retrievedSrc);
		
		// Check what innerHTML produces
		const htmlOutput = doc.body.innerHTML;
		console.log('HTML output:', htmlOutput);
		
		// The critical test: does innerHTML preserve the encoded characters?
		expect(retrievedSrc).toBe(encodedFilename);
		expect(htmlOutput).toContain(encodedFilename);
	});

	it('should test with various special characters that need encoding', () => {
		const testCases = [
			{
				original: 'folder/subfolder/image.png',
				encoded: 'obsidian-synced-folder%2Fsubfolder%2Fimage.png-abc123.png'
			},
			{
				original: 'my folder/image with spaces.png', 
				encoded: 'obsidian-synced-my%20folder%2Fimage%20with%20spaces.png-def456.png'
			},
			{
				original: 'special&chars#test.png',
				encoded: 'obsidian-synced-special%26chars%23test.png-ghi789.png'
			}
		];

		testCases.forEach(({ original, encoded }) => {
			const doc = parser.parseFromString('<div><img src="test.png"></div>', 'text/html');
			const img = doc.querySelector('img');
			
			img?.setAttribute('src', encoded);
			const htmlOutput = doc.body.innerHTML;
			
			// The filename should be preserved exactly in the HTML output
			expect(htmlOutput).toContain(encoded);
			expect(img?.getAttribute('src')).toBe(encoded);
		});
	});

	it('should verify the exact transformation pipeline we use', () => {
		// Simulate our exact transformation process
		const originalHtml = '<p>Test <img src="folder/subfolder/image.png" alt="test"> content</p>';
		const doc = parser.parseFromString(originalHtml, 'text/html');
		
		// Find the image and replace its src (like our transformDocumentForAnki does)
		const img = doc.querySelector('img');
		const originalSrc = img?.getAttribute('src');
		const encodedFilename = `obsidian-synced-${encodeURIComponent(originalSrc || '')}-abc123.png`;
		
		// Debug: let's see what the encoded filename looks like
		expect(originalSrc).toBe('folder/subfolder/image.png');
		expect(encodedFilename).toBe('obsidian-synced-folder%2Fsubfolder%2Fimage.png-abc123.png');
		
		// This is the critical operation from our code
		img?.setAttribute('src', encodedFilename);
		
		// Check what getAttribute returns immediately after setting
		const retrievedSrc = img?.getAttribute('src');
		expect(retrievedSrc).toBe(encodedFilename); // Should be identical
		
		// This is how we extract the final HTML
		const clonedDoc = doc.cloneNode(true) as Document;
		const finalHtml = clonedDoc.body.innerHTML;
		
		// The final HTML should contain the encoded filename exactly
		expect(finalHtml).toContain(encodedFilename);
		expect(finalHtml).toContain('folder%2Fsubfolder%2Fimage.png'); // The encoded part specifically
		
		// Additional check: make sure it doesn't contain the decoded version
		expect(finalHtml).not.toContain('folder/subfolder/image.png'); // Should NOT contain the original
	});
});