import { BlockFlashcardParser, Flashcard, InvalidFlashcard, NoteType } from '../flashcard';
import { NoteMetadata } from '../note-metadata';
import { DEFAULT_DECK, DEFAULT_NOTE_TYPE, ANKI_DECK_PROPERTY, ANKI_TAGS_PROPERTY } from '../constants';

describe('BlockFlashcardParser', () => {
	const mockNoteTypes: NoteType[] = [
		{ name: 'Basic', fields: ['Front', 'Back'] },
		{ name: 'Cloze', fields: ['Text', 'Extra'] },
		{ name: 'Custom', fields: ['Question', 'Answer', 'Source'] }
	];
	
	const emptyMetadata: NoteMetadata = {};

	describe('parseFlashcard', () => {
		it('should parse a valid basic flashcard', () => {
			const source = `NoteType: Basic
Front: What is 2+2?
Back: 4
Tags:
  - math
  - basic`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 10, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
				expect(result.noteType).toBe('Basic');
				expect(result.contentFields).toEqual({
					Front: 'What is 2+2?',
					Back: '4'
				});
				expect(result.tags).toEqual(['basic', 'math']);
				expect(result.warnings).toEqual([]);
				expect(result.sourcePath).toBe('test.md');
				expect(result.lineStart).toBe(1);
				expect(result.lineEnd).toBe(10);
			}
		});

		it('should parse flashcard without note type (uses default)', () => {
			const source = `Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
				expect(result.noteType).toBe(DEFAULT_NOTE_TYPE);
				expect(result.contentFields).toEqual({
					Front: 'Question',
					Back: 'Answer'
				});
				expect(result.tags).toEqual([]);
				expect(result.warnings).toEqual([]);
			}
		});

		it('should parse flashcard without tags', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual([]);
				expect(result.warnings).toEqual([]);
			}
		});

		it('should parse flashcard with AnkiId', () => {
			const source = `NoteType: Basic
AnkiId: 1234567890
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.ankiId).toBe(1234567890);
			}
		});

		it('should parse flashcard with string AnkiId', () => {
			const source = `NoteType: Basic
AnkiId: "1234567890"
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.ankiId).toBe(1234567890);
			}
		});

		it('should handle multiline fields with pipe syntax', () => {
			const source = `NoteType: Basic
Front: |
  This is a multiline
  front field
Back: |
  This is a multiline
  back field`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 8, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.contentFields.Front.trim()).toBe('This is a multiline\nfront field');
				expect(result.contentFields.Back.trim()).toBe('This is a multiline\nback field');
			}
		});

		it('should detect unknown note type warning', () => {
			const source = `NoteType: UnknownType
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata, mockNoteTypes);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.warnings).toHaveLength(1);
				expect(result.warnings[0]).toContain('Unknown note type: \'UnknownType\'');
				expect(result.warnings[0]).toContain('Basic, Cloze, Custom');
			}
		});

		it('should detect unknown field warning', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer
InvalidField: Some content`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 6, DEFAULT_DECK, emptyMetadata, mockNoteTypes);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.warnings).toHaveLength(1);
				expect(result.warnings[0]).toContain('Unknown field \'InvalidField\'');
				expect(result.warnings[0]).toContain('Front, Back');
			}
		});

		it('should group multiple unknown fields into single warning', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer
InvalidField1: Content1
InvalidField2: Content2`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 7, DEFAULT_DECK, emptyMetadata, mockNoteTypes);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.warnings).toHaveLength(1);
				expect(result.warnings[0]).toContain('Unknown fields');
				expect(result.warnings[0]).toContain('InvalidField1');
				expect(result.warnings[0]).toContain('InvalidField2');
				expect(result.warnings[0]).toContain('Front, Back');
			}
		});

		it('should not detect warnings when note types are not provided', () => {
			const source = `NoteType: UnknownType
Front: Question
Back: Answer
InvalidField: Content`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 6, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.warnings).toEqual([]);
			}
		});

		it('should return error for empty content', () => {
			const result = BlockFlashcardParser.parseFlashcard('', 'test.md', 1, 1, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toBe('No content found in flashcard block');
			}
		});

		it('should return error for whitespace-only content', () => {
			const result = BlockFlashcardParser.parseFlashcard('   \n  \n  ', 'test.md', 1, 3, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toBe('No content found in flashcard block');
			}
		});

		it('should return error for invalid YAML', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer
[invalid yaml`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('YAML parsing error');
			}
		});

		it('should return error for non-object YAML', () => {
			const source = `- item1
- item2`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 3, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toBe('Flashcard content must be a YAML object with key-value pairs');
			}
		});

		it('should return error for invalid tags format', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags: "tag1, tag2"`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('Tags field must be a YAML list of strings');
			}
		});

		it('should return error for empty tag in list', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags:
  - tag1
  - ""
  - tag2`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 8, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('Tag at position 2 must be a non-empty string');
			}
		});

		it('should return error for no content fields', () => {
			const source = `NoteType: Basic
Tags:
  - tag1`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('Flashcard must contain at least one content field');
			}
		});

		it('should return error for invalid AnkiId', () => {
			const source = `NoteType: Basic
AnkiId: invalid
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('AnkiId must be a positive integer');
			}
		});

		it('should return error for negative AnkiId', () => {
			const source = `NoteType: Basic
AnkiId: -123
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('AnkiId must be a positive integer');
			}
		});

		it('should handle complex field values', () => {
			const source = `NoteType: Custom
Question: What is the answer?
Answer: 42
Source: Hitchhiker's Guide
Tags:
  - books
  - science-fiction`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 8, DEFAULT_DECK, emptyMetadata, mockNoteTypes);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.noteType).toBe('Custom');
				expect(result.contentFields).toEqual({
					Question: 'What is the answer?',
					Answer: '42',
					Source: 'Hitchhiker\'s Guide'
				});
				expect(result.tags).toEqual(['books', 'science-fiction']);
				expect(result.warnings).toEqual([]);
			}
		});

		it('should convert non-string field values to strings', () => {
			const source = `NoteType: Basic
Front: 123
Back: true`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.contentFields).toEqual({
					Front: '123',
					Back: 'true'
				});
			}
		});

		it('should handle null field values', () => {
			const source = `NoteType: Basic
Front: Question
Back: null`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.contentFields).toEqual({
					Front: 'Question',
					Back: ''
				});
			}
		});

		it('should return error for array field values', () => {
			const source = `NoteType: Basic
Front: Question
Back: 
  - item1
  - item2`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 6, DEFAULT_DECK, emptyMetadata);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error).toContain('Field \'Back\' must be a string, number, boolean, or null');
			}
		});
		
		describe('Deck field parsing', () => {
			it('should use default deck when no Deck field is provided', () => {
				const source = `NoteType: Basic
Front: Question
Back: Answer`;
				
				const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, emptyMetadata);
				
				expect('error' in result).toBe(false);
				if (!('error' in result)) {
					expect(result.deck).toBe(DEFAULT_DECK);
				}
			});
			
			it('should use specified deck when Deck field is provided', () => {
				const source = `NoteType: Basic
Deck: Math::Algebra
Front: Question
Back: Answer`;
				
				const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);
				
				expect('error' in result).toBe(false);
				if (!('error' in result)) {
					expect(result.deck).toBe('Math::Algebra');
				}
			});
			
			it('should trim whitespace from deck field', () => {
				const source = `NoteType: Basic
Deck: "  Science::Biology  "
Front: Question
Back: Answer`;
				
				const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);
				
				expect('error' in result).toBe(false);
				if (!('error' in result)) {
					expect(result.deck).toBe('Science::Biology');
				}
			});
			
			it('should use default deck when Deck field is empty', () => {
				const source = `NoteType: Basic
Deck: ""
Front: Question
Back: Answer`;
				
				const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);
				
				expect('error' in result).toBe(false);
				if (!('error' in result)) {
					expect(result.deck).toBe(DEFAULT_DECK);
				}
			});
			
			it('should use default deck when Deck field is only whitespace', () => {
				const source = `NoteType: Basic
Deck: "   "
Front: Question
Back: Answer`;
				
				const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, emptyMetadata);
				
				expect('error' in result).toBe(false);
				if (!('error' in result)) {
					expect(result.deck).toBe(DEFAULT_DECK);
				}
			});
		});
	});

	describe('Front-matter metadata processing', () => {
		it('should use front-matter AnkiDeck when no flashcard Deck field', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: 'Math::Algebra'
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Math::Algebra');
			}
		});

		it('should prioritize flashcard Deck over front-matter AnkiDeck', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: 'Math::Algebra'
			};
			const source = `NoteType: Basic
Deck: Science::Biology
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Science::Biology');
			}
		});

		it('should merge front-matter AnkiTags with flashcard Tags', () => {
			const metadata: NoteMetadata = {
				[ANKI_TAGS_PROPERTY]: ['frontmatter', 'global']
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags:
  - local
  - specific`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 7, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual(['frontmatter', 'global', 'local', 'specific']);
			}
		});

		it('should deduplicate merged tags from front-matter and flashcard', () => {
			const metadata: NoteMetadata = {
				[ANKI_TAGS_PROPERTY]: ['math', 'shared', 'global']
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags:
  - shared
  - local
  - math`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 7, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual(['global', 'local', 'math', 'shared']);
			}
		});

		it('should use only front-matter tags when no flashcard Tags field', () => {
			const metadata: NoteMetadata = {
				[ANKI_TAGS_PROPERTY]: ['frontmatter', 'only']
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual(['frontmatter', 'only']);
			}
		});

		it('should use only flashcard tags when no front-matter AnkiTags', () => {
			const metadata: NoteMetadata = {};
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags:
  - flashcard
  - only`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 6, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual(['flashcard', 'only']);
			}
		});

		it('should handle empty front-matter metadata', () => {
			const metadata: NoteMetadata = {};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
				expect(result.tags).toEqual([]);
			}
		});

		it('should handle both front-matter deck and tags together', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: 'Science::Physics',
				[ANKI_TAGS_PROPERTY]: ['physics', 'formula']
			};
			const source = `NoteType: Basic
Front: What is E=mc²?
Back: Einstein's mass-energy equivalence
Tags:
  - einstein
  - relativity`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 7, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Science::Physics');
				expect(result.tags).toEqual(['einstein', 'formula', 'physics', 'relativity']);
			}
		});

		it('should ignore empty AnkiDeck string', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: ''
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
			}
		});

		it('should ignore whitespace-only AnkiDeck string', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: '   '
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
			}
		});

		it('should trim whitespace from front-matter AnkiDeck', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: '  Science::Chemistry  '
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Science::Chemistry');
			}
		});

		it('should handle empty AnkiTags array', () => {
			const metadata: NoteMetadata = {
				[ANKI_TAGS_PROPERTY]: []
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer
Tags:
  - local`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 6, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.tags).toEqual(['local']);
			}
		});

		it('should handle undefined fields in metadata gracefully', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: undefined,
				[ANKI_TAGS_PROPERTY]: undefined
			};
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
				expect(result.tags).toEqual([]);
			}
		});

		it('should handle null metadata object', () => {
			const source = `NoteType: Basic
Front: Question
Back: Answer`;

			// TypeScript won't allow null, but test runtime safety
			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 4, DEFAULT_DECK, {} as NoteMetadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe(DEFAULT_DECK);
				expect(result.tags).toEqual([]);
			}
		});

		it('should fall back to front-matter when flashcard Deck is empty', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: 'Math::Algebra'
			};
			const source = `NoteType: Basic
Deck: ""
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Math::Algebra'); // Empty deck falls back to front-matter
			}
		});

		it('should fall back to front-matter when flashcard Deck is whitespace-only', () => {
			const metadata: NoteMetadata = {
				[ANKI_DECK_PROPERTY]: 'Math::Algebra'
			};
			const source = `NoteType: Basic
Deck: "   "
Front: Question
Back: Answer`;

			const result = BlockFlashcardParser.parseFlashcard(source, 'test.md', 1, 5, DEFAULT_DECK, metadata);

			expect('error' in result).toBe(false);
			if (!('error' in result)) {
				expect(result.deck).toBe('Math::Algebra'); // Whitespace-only deck falls back to front-matter
			}
		});
	});
});
