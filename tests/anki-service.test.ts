// Mock yanki-connect module only
jest.mock('yanki-connect', () => ({
  YankiConnect: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

import { YankiConnectAnkiService, AnkiNote } from '../anki-service';
import { Flashcard } from '../flashcard';

describe('YankiConnectAnkiService', () => {
  let service: YankiConnectAnkiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new YankiConnectAnkiService(['marked', 'leech']);
  });

  describe('convertOrphanedNoteToFlashcard', () => {
    const createMockAnkiNote = (overrides: Partial<AnkiNote> = {}): AnkiNote => ({
      noteId: 12345,
      modelName: 'Basic',
      fields: {
        Front: { value: '<p>What is <strong>2+2</strong>?</p>', order: 0 },
        Back: { value: '<p>The answer is <em>4</em></p>', order: 1 },
      },
      tags: ['math', 'basic', 'obsidian-synced', 'obsidian-vault::test-vault', 'obsidian-file::notes/file.md'],
      cards: [67890],
      ...overrides,
    });

    it('should convert basic AnkiNote to Flashcard with HTML-to-markdown conversion', () => {
      const ankiNote = createMockAnkiNote();

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result).toEqual({
        sourcePath: 'notes/file.md', // From obsidian-file:: tag
        lineStart: 0,
        lineEnd: 0,
        noteType: 'Basic',
        contentFields: {
          Front: 'What is **2+2**?',
          Back: 'The answer is *4*',
        },
        tags: ['math', 'basic'], // obsidian-* tags filtered out
        ankiId: 12345,
      });
    });

    it('should extract source path from ObsidianNote field when no file tag exists', () => {
      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: 'Question', order: 0 },
          Back: { value: 'Answer', order: 1 },
          ObsidianNote: { value: 'Notes/My Note.md', order: 2 },
        },
        tags: ['math', 'basic', 'obsidian-synced', 'obsidian-vault::test-vault'], // No file tag
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.sourcePath).toBe('Notes/My Note.md');
      expect(result.contentFields).not.toHaveProperty('ObsidianNote');
    });

    it('should prioritize obsidian-file:: tag over ObsidianNote field for source path', () => {
      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: 'Question', order: 0 },
          Back: { value: 'Answer', order: 1 },
          ObsidianNote: { value: 'Notes/Old Path.md', order: 2 },
        },
        tags: [
          'user-tag',
          'obsidian-file::Notes/New Path.md',
          'obsidian-synced',
        ],
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.sourcePath).toBe('Notes/New Path.md'); // Should use file tag
      expect(result.tags).toEqual(['user-tag']); // Should filter out obsidian-* tags
    });

    it('should filter out obsidian-* tags but keep user tags', () => {
      const ankiNote = createMockAnkiNote({
        tags: [
          'user-tag-1',
          'obsidian-synced',
          'custom-tag',
          'obsidian-vault::my-vault',
          'another-user-tag',
          'obsidian-something-else',
        ],
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.tags).toEqual(['user-tag-1', 'custom-tag', 'another-user-tag']);
    });

    it('should handle empty or missing fields gracefully', () => {
      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: '', order: 0 },
          Back: { value: '   ', order: 1 }, // whitespace only
          Empty: { value: '', order: 2 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields).toEqual({
        Front: '',
        Back: '   ',
        Empty: '',
      });
    });

    it('should preserve original HTML when turndown throws an exception', () => {
      // Mock only the turndown method for this specific test
      const originalTurndown = (service as any).turndownService.turndown;
      const mockTurndown = jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('Turndown parsing failed');
        })
        .mockReturnValueOnce('Normal content');
      
      (service as any).turndownService.turndown = mockTurndown;

      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: '<malformed><tag>Problematic HTML</malformed>', order: 0 },
          Back: { value: '<p>Normal content</p>', order: 1 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields).toEqual({
        Front: '<malformed><tag>Problematic HTML</malformed>', // Original HTML preserved
        Back: 'Normal content', // Successfully converted
      });

      expect(console.warn).toHaveBeenCalledWith(
        'Failed to convert HTML to markdown for field Front:',
        expect.any(Error)
      );

      // Restore original function
      (service as any).turndownService.turndown = originalTurndown;
    });

    it('should handle notes with no fields', () => {
      const ankiNote = createMockAnkiNote({
        fields: {},
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields).toEqual({});
    });

    it('should handle notes with undefined/null field values', () => {
      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: '<strong>Good content</strong>', order: 0 },
          Back: { value: null as any, order: 1 },
          Extra: { value: undefined as any, order: 2 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields).toEqual({
        Front: '**Good content**',
        Back: '',
        Extra: '',
      });
    });

    it('should handle notes with no tags', () => {
      const ankiNote = createMockAnkiNote({
        tags: [],
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.tags).toEqual([]);
    });

    it('should handle notes with only obsidian tags', () => {
      const ankiNote = createMockAnkiNote({
        tags: ['obsidian-synced', 'obsidian-vault::test'],
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.tags).toEqual([]);
    });

    it('should preserve complex HTML structures in content fields', () => {
      const ankiNote = createMockAnkiNote({
        fields: {
          Front: { value: '<div><h3>Complex</h3><ul><li>List <strong>item</strong></li></ul></div>', order: 0 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields.Front).toBe('### Complex\n\n-   List **item**');
    });

    it('should handle complex note types and field names', () => {
      const ankiNote = createMockAnkiNote({
        modelName: 'Cloze (Custom)',
        fields: {
          'Text': { value: 'Some text', order: 0 },
          'Extra Field Name': { value: 'Extra content', order: 1 },
          'Field-With-Dashes': { value: 'Dash content', order: 2 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.noteType).toBe('Cloze (Custom)');
      expect(result.contentFields).toHaveProperty('Text');
      expect(result.contentFields).toHaveProperty('Extra Field Name');
      expect(result.contentFields).toHaveProperty('Field-With-Dashes');
    });

    it('should preserve cloze deletion syntax', () => {
      const ankiNote = createMockAnkiNote({
        modelName: 'Cloze',
        fields: {
          Text: { value: 'The capital of {{c1::France}} is {{c2::Paris}}.', order: 0 },
          'Back Extra': { value: '', order: 1 },
        },
      });

      const result = service.convertOrphanedNoteToFlashcard(ankiNote);

      expect(result.contentFields).toEqual({
        Text: 'The capital of {{c1::France}} is {{c2::Paris}}.',
        'Back Extra': '',
      });
      expect(result.noteType).toBe('Cloze');
    });

    describe('toFlashcard integration', () => {
      it('should prioritize obsidian-file:: tag over ObsidianNote field', () => {
        const ankiNote = createMockAnkiNote({
          fields: {
            Front: { value: 'Question', order: 0 },
            Back: { value: 'Answer', order: 1 },
            ObsidianNote: { value: 'Notes/Old Path.md', order: 2 },
          },
          tags: [
            'user-tag',
            'obsidian-file::Notes/New Path.md',
            'obsidian-synced',
          ],
        });

        const result = service.toFlashcard(ankiNote, 'Basic');

        expect(result.sourcePath).toBe('Notes/New Path.md'); // Should use file tag
        expect(result.noteType).toBe('Basic');
      });

      it('should fallback to ObsidianNote field when no file tag exists', () => {
        const ankiNote = createMockAnkiNote({
          fields: {
            Front: { value: 'Question', order: 0 },
            Back: { value: 'Answer', order: 1 },
            ObsidianNote: { value: 'Notes/My Note.md', order: 2 },
          },
          tags: ['user-tag', 'obsidian-synced'], // No file tag
        });

        const result = service.toFlashcard(ankiNote, 'Basic');

        expect(result.sourcePath).toBe('Notes/My Note.md');
      });

      it('should filter out ignored tags', () => {
        const ankiNote = createMockAnkiNote({
          tags: [
            'user-tag',
            'marked',
            'leech',
            'obsidian-synced',
            'another-user-tag',
            'custom-ignored'
          ],
        });

        const serviceWithCustomIgnored = new YankiConnectAnkiService(['marked', 'leech', 'custom-ignored']);
        const result = serviceWithCustomIgnored.toFlashcard(ankiNote, 'Basic');

        expect(result.tags).toEqual(['user-tag', 'another-user-tag']); // Should filter out obsidian-* and ignored tags
      });
    });

    describe('ignored tags functionality', () => {
      it('should filter ignored tags in convertOrphanedNoteToFlashcard', () => {
        const ankiNote = createMockAnkiNote({
          tags: [
            'user-tag',
            'marked',
            'leech',
            'obsidian-synced',
            'study-tag'
          ],
        });

        const result = service.convertOrphanedNoteToFlashcard(ankiNote);

        expect(result.tags).toEqual(['user-tag', 'study-tag']); // Should exclude obsidian-* and ignored tags
      });

      it('should handle empty ignored tags array', () => {
        const ankiNote = createMockAnkiNote({
          tags: [
            'user-tag',
            'marked',
            'leech',
            'obsidian-synced'
          ],
        });

        // Test with service that has no ignored tags
        const serviceWithNoIgnored = new YankiConnectAnkiService([]);
        const result = serviceWithNoIgnored.convertOrphanedNoteToFlashcard(ankiNote);

        expect(result.tags).toEqual(['user-tag', 'marked', 'leech']); // Should only exclude obsidian-* tags
      });

      it('should handle notes with no tags to ignore', () => {
        const ankiNote = createMockAnkiNote({
          tags: [
            'user-tag',
            'study-tag',
            'obsidian-synced'
          ],
        });

        const result = service.convertOrphanedNoteToFlashcard(ankiNote);

        expect(result.tags).toEqual(['user-tag', 'study-tag']); // Should only exclude obsidian-* tags
      });
    });

    describe('filterUserTags', () => {
      it('should filter out obsidian tags and ignored tags', () => {
        const tags = [
          'user-tag',
          'marked',
          'leech',
          'obsidian-synced',
          'obsidian-vault::test',
          'study-tag'
        ];

        const result = service.filterUserTags(tags);

        expect(result).toEqual(['user-tag', 'study-tag']); // Should exclude obsidian-* and ignored tags
      });

      it('should handle empty tags array', () => {
        const result = service.filterUserTags([]);
        expect(result).toEqual([]);
      });

      it('should handle null/undefined tags', () => {
        const result = service.filterUserTags(null as any);
        expect(result).toEqual([]);
      });
    });

    describe('setIgnoredTags', () => {
      it('should update ignored tags and affect tag filtering', () => {
        const tags = ['user-tag', 'marked', 'leech', 'new-ignored-tag'];

        // Initial filtering with default ignored tags
        const initialResult = service.filterUserTags(tags);
        expect(initialResult).toEqual(['user-tag', 'new-ignored-tag']);

        // Update ignored tags
        service.setIgnoredTags(['marked', 'leech', 'new-ignored-tag']);

        // Should now filter out the new ignored tag
        const updatedResult = service.filterUserTags(tags);
        expect(updatedResult).toEqual(['user-tag']);
      });

      it('should work with empty ignored tags', () => {
        const tags = ['user-tag', 'marked', 'leech', 'obsidian-synced'];

        // Update to empty ignored tags
        service.setIgnoredTags([]);

        // Should only filter obsidian-* tags
        const result = service.filterUserTags(tags);
        expect(result).toEqual(['user-tag', 'marked', 'leech']);
      });
    });
  });
});