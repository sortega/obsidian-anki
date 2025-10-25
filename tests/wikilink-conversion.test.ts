import { MarkdownService } from '../markdown-service';

describe('Obsidian Wikilink Image Conversion', () => {
  beforeEach(() => {
    // Initialize the service
    MarkdownService.initialize();
  });

  describe('Basic image wikilink conversion', () => {
    it('should convert simple image wikilinks to img tags', () => {
      const markdown = 'Here is an image: ![[image.png]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="image.png">');
    });

    it('should handle different image extensions', () => {
      const testCases = [
        { input: '![[photo.jpg]]', expected: '<img src="photo.jpg">' },
        { input: '![[photo.jpeg]]', expected: '<img src="photo.jpeg">' },
        { input: '![[animation.gif]]', expected: '<img src="animation.gif">' },
        { input: '![[vector.svg]]', expected: '<img src="vector.svg">' },
        { input: '![[image.webp]]', expected: '<img src="image.webp">' },
        { input: '![[bitmap.bmp]]', expected: '<img src="bitmap.bmp">' }
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase.input);
        expect(result).toContain(testCase.expected);
      }
    });

    it('should be case-insensitive for extensions', () => {
      const testCases = [
        { input: '![[image.PNG]]', expected: '<img src="image.PNG">' },
        { input: '![[photo.JPG]]', expected: '<img src="photo.JPG">' },
        { input: '![[photo.JPEG]]', expected: '<img src="photo.JPEG">' },
        { input: '![[animation.GIF]]', expected: '<img src="animation.GIF">' }
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase.input);
        expect(result).toContain(testCase.expected);
      }
    });
  });

  describe('Display properties', () => {
    it('should convert width-only display properties', () => {
      const markdown = 'Image with width: ![[image.png|100]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="image.png" width="100">');
    });

    it('should convert width x height display properties', () => {
      const markdown = 'Image with dimensions: ![[image.png|150x200]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="image.png" width="150" height="200">');
    });

    it('should ignore invalid display properties', () => {
      const testCases = [
        '![[image.png|abc]]',
        '![[image.png|100x]]',
        '![[image.png|x200]]',
        '![[image.png|]]',
        '![[image.png| ]]'
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase);
        expect(result).toContain('<img src="image.png">');
        expect(result).not.toContain('width=');
        expect(result).not.toContain('height=');
      }
    });
  });

  describe('File paths and folders', () => {
    it('should handle nested folder paths', () => {
      const markdown = 'Nested image: ![[attachments/images/photo.jpg|100]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="attachments/images/photo.jpg" width="100">');
    });

    it('should handle file names with spaces', () => {
      const markdown = 'Image with spaces: ![[my vacation photo.jpg|200]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="my vacation photo.jpg" width="200">');
    });

    it('should handle file names with special characters', () => {
      const markdown = 'Special chars: ![[image-v2.1_final.png|150x100]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="image-v2.1_final.png" width="150" height="100">');
    });
  });

  describe('Non-image wikilinks', () => {
    it('should not convert non-image file types', () => {
      const testCases = [
        '![[document.pdf]]',
        '![[notes.md]]',
        '![[data.csv]]',
        '![[presentation.pptx]]',
        '![[script.js]]'
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase);
        expect(result).toContain(testCase); // Should remain unchanged
        expect(result).not.toContain('<img');
      }
    });

    it('should not convert text files that end with image-like names', () => {
      const testCases = [
        '![[notes about png format.txt]]',
        '![[jpg compression study.md]]'
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase);
        expect(result).toContain(testCase); // Should remain unchanged
        expect(result).not.toContain('<img');
      }
    });
  });

  describe('Mixed content', () => {
    it('should handle multiple image wikilinks in same content', () => {
      const markdown = 'Multiple images: ![[first.png|100]] and ![[second.jpg|200x150]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="first.png" width="100">');
      expect(result).toContain('<img src="second.jpg" width="200" height="150">');
    });

    it('should handle mix of image and non-image wikilinks', () => {
      const markdown = 'Mixed: ![[image.png|100]] and ![[document.pdf]] and ![[photo.jpg]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="image.png" width="100">');
      expect(result).toContain('<img src="photo.jpg">');
      expect(result).toContain('![[document.pdf]]'); // Unchanged
    });

    it('should work with regular markdown images alongside wikilinks', () => {
      const markdown = 'Regular: ![alt](regular.png) and wikilink: ![[wiki.png|150]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('<img src="regular.png" alt="alt"');
      expect(result).toContain('<img src="wiki.png" width="150">');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty wikilinks gracefully', () => {
      const markdown = 'Empty: ![[]]';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('![[]]'); // Should remain unchanged
      expect(result).not.toContain('<img');
    });

    it('should handle malformed wikilinks', () => {
      const testCases = [
        '![image.png]]',   // Missing opening bracket
        '![[image.png]',   // Missing closing bracket
        '![[image.png|',   // Incomplete display property
      ];

      for (const testCase of testCases) {
        const result = MarkdownService.renderToHtml(testCase);
        expect(result).not.toContain('<img src="image.png"');
      }
    });

    it('should preserve content around wikilinks', () => {
      const markdown = 'Before text ![[image.png|100]] after text';
      const result = MarkdownService.renderToHtml(markdown);
      
      expect(result).toContain('Before text');
      expect(result).toContain('after text');
      expect(result).toContain('<img src="image.png" width="100">');
    });
  });
});