import { HtmlFlashcardDiffer } from '../html-flashcard-differ';
import { HtmlFlashcard } from '../flashcard';

describe('HtmlFlashcardDiffer', () => {
	let differ: HtmlFlashcardDiffer;
	let baseFlashcard: HtmlFlashcard;

	beforeEach(() => {
		differ = new HtmlFlashcardDiffer();
		
		// Create base flashcard for testing
		baseFlashcard = {
			noteType: 'Basic',
			deck: 'Default',
			tags: ['tag1', 'tag2'],
			htmlFields: {
				Front: { body: { innerHTML: '<p>Question</p>' } } as Document,
				Back: { body: { innerHTML: '<p>Answer</p>' } } as Document
			},
			sourcePath: '/path/to/note.md',
			lineStart: 1,
			lineEnd: 5,
			warnings: []
		};
	});

	describe('diff', () => {
		it('should return null when flashcards are identical', () => {
			const result = differ.diff(baseFlashcard, baseFlashcard);
			expect(result).toBeNull();
		});

		it('should detect deck changes', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				deck: 'New Deck'
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.deck).toEqual({
				old: 'Default',
				new: 'New Deck'
			});
		});

		it('should detect tag additions', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				tags: ['tag1', 'tag2', 'tag3']
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.tags).toEqual({
				added: ['tag3'],
				removed: []
			});
		});

		it('should detect tag removals', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				tags: ['tag1']
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.tags).toEqual({
				added: [],
				removed: ['tag2']
			});
		});

		it('should detect tag additions and removals', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				tags: ['tag1', 'tag3', 'tag4']
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.tags).toEqual({
				added: ['tag3', 'tag4'],
				removed: ['tag2']
			});
		});

		it('should detect field content changes', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				htmlFields: {
					Front: { body: { innerHTML: '<p>Modified Question</p>' } } as Document,
					Back: { body: { innerHTML: '<p>Answer</p>' } } as Document
				}
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.fieldDiffs!.has('Front')).toBe(true);
			expect(result!.fieldDiffs!.has('Back')).toBe(false);
		});

		it('should detect new fields', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				htmlFields: {
					...baseFlashcard.htmlFields,
					Extra: { body: { innerHTML: '<p>Extra content</p>' } } as Document
				}
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.fieldDiffs!.has('Extra')).toBe(true);
		});

		it('should detect removed fields', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				htmlFields: {
					Front: baseFlashcard.htmlFields.Front
				}
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.fieldDiffs!.has('Back')).toBe(true);
		});

		it('should detect note type changes', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				noteType: 'Cloze'
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.noteType).toEqual({
				old: 'Basic',
				new: 'Cloze'
			});
		});

		it('should detect source path changes', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				sourcePath: '/new/path/to/note.md'
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.sourcePath).toEqual({
				old: '/path/to/note.md',
				new: '/new/path/to/note.md'
			});
		});

		it('should detect multiple changes simultaneously', () => {
			const modifiedFlashcard = {
				...baseFlashcard,
				deck: 'New Deck',
				tags: ['tag1', 'tag3'],
				noteType: 'Cloze',
				htmlFields: {
					Front: { body: { innerHTML: '<p>Modified Question</p>' } } as Document,
					Back: { body: { innerHTML: '<p>Answer</p>' } } as Document
				}
			};

			const result = differ.diff(baseFlashcard, modifiedFlashcard);
			
			expect(result).not.toBeNull();
			expect(result!.deck).toBeDefined();
			expect(result!.tags).toBeDefined();
			expect(result!.noteType).toBeDefined();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.sourcePath).toBeUndefined();
		});
	});

	describe('edge cases', () => {
		it('should handle empty fields correctly', () => {
			const flashcardWithEmptyField = {
				...baseFlashcard,
				htmlFields: {
					Front: { body: { innerHTML: '' } } as Document,
					Back: { body: { innerHTML: '<p>Answer</p>' } } as Document
				}
			};

			const result = differ.diff(baseFlashcard, flashcardWithEmptyField);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.fieldDiffs!.has('Front')).toBe(true);
		});

		it('should handle missing htmlFields gracefully', () => {
			const flashcardWithMissingField = {
				...baseFlashcard,
				htmlFields: {
					Front: baseFlashcard.htmlFields.Front
				}
			};

			const result = differ.diff(baseFlashcard, flashcardWithMissingField);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
		});

		it('should return null when only whitespace differences exist in tags but no actual tag changes', () => {
			const result = differ.diff(baseFlashcard, baseFlashcard);
			expect(result).toBeNull();
		});

		it('should handle undefined/null document fields', () => {
			const flashcardWithNullField = {
				...baseFlashcard,
				htmlFields: {
					Front: null as any,
					Back: baseFlashcard.htmlFields.Back
				}
			};

			const result = differ.diff(baseFlashcard, flashcardWithNullField);
			
			expect(result).not.toBeNull();
			expect(result!.fieldDiffs).toBeDefined();
			expect(result!.fieldDiffs!.has('Front')).toBe(true);
		});
	});
});
