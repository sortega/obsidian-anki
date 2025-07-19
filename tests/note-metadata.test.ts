import {parseNoteMetadata} from '../note-metadata';

describe('parseNoteMetadata', () => {
	describe('valid inputs', () => {
		it('should parse AnkiDeck from object', () => {
			const input = { AnkiDeck: 'MyDeck' };
			const result = parseNoteMetadata(input);
			expect(result.AnkiDeck).toBe('MyDeck');
		});

		it('should parse AnkiTags from object', () => {
			const input = { AnkiTags: ['tag1', 'tag2'] };
			const result = parseNoteMetadata(input);
			expect(result.AnkiTags).toEqual(['tag1', 'tag2']);
		});

		it('should parse both AnkiDeck and AnkiTags', () => {
			const input = { 
				AnkiDeck: 'MyDeck',
				AnkiTags: ['tag1', 'tag2']
			};
			const result = parseNoteMetadata(input);
			expect(result.AnkiDeck).toBe('MyDeck');
			expect(result.AnkiTags).toEqual(['tag1', 'tag2']);
		});

		it('should trim whitespace from deck name', () => {
			const input = { AnkiDeck: '  MyDeck  ' };
			const result = parseNoteMetadata(input);
			expect(result.AnkiDeck).toBe('MyDeck');
		});

		it('should trim whitespace from tags', () => {
			const input = { AnkiTags: ['  tag1  ', '  tag2  '] };
			const result = parseNoteMetadata(input);
			expect(result.AnkiTags).toEqual(['tag1', 'tag2']);
		});

		it('should filter out empty tags after trimming', () => {
			const input = { AnkiTags: ['tag1', '  ', '', 'tag2'] };
			const result = parseNoteMetadata(input);
			expect(result.AnkiTags).toEqual(['tag1', 'tag2']);
		});

		it('should filter out non-string tags', () => {
			const input = { AnkiTags: ['tag1', 123, null, 'tag2', true] };
			const result = parseNoteMetadata(input);
			expect(result.AnkiTags).toEqual(['tag1', 'tag2']);
		});

		it('should ignore other properties', () => {
			const input = { 
				AnkiDeck: 'MyDeck',
				otherProperty: 'ignored',
				anotherProperty: 123
			};
			const result = parseNoteMetadata(input);
			expect(result.AnkiDeck).toBe('MyDeck');
			expect('otherProperty' in result).toBe(false);
			expect('anotherProperty' in result).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should return empty object for null frontmatter', () => {
			const result = parseNoteMetadata(null);
			expect(result).toEqual({});
		});

		it('should return empty object for undefined frontmatter', () => {
			const result = parseNoteMetadata(undefined);
			expect(result).toEqual({});
		});

		it('should return empty object for array frontmatter', () => {
			const result = parseNoteMetadata(['not', 'an', 'object']);
			expect(result).toEqual({});
		});

		it('should return empty object for string frontmatter', () => {
			const result = parseNoteMetadata('not an object');
			expect(result).toEqual({});
		});

		it('should return empty object for number frontmatter', () => {
			const result = parseNoteMetadata(123);
			expect(result).toEqual({});
		});

		it('should ignore empty string deck', () => {
			const input = { AnkiDeck: '' };
			const result = parseNoteMetadata(input);
			expect('AnkiDeck' in result).toBe(false);
		});

		it('should ignore whitespace-only deck', () => {
			const input = { AnkiDeck: '   ' };
			const result = parseNoteMetadata(input);
			expect('AnkiDeck' in result).toBe(false);
		});

		it('should ignore non-string deck', () => {
			const input = { AnkiDeck: 123 };
			const result = parseNoteMetadata(input);
			expect('AnkiDeck' in result).toBe(false);
		});

		it('should ignore non-array tags', () => {
			const input = { AnkiTags: 'not an array' };
			const result = parseNoteMetadata(input);
			expect('AnkiTags' in result).toBe(false);
		});

		it('should ignore empty tags array after filtering', () => {
			const input = { AnkiTags: ['', '  ', 123, null] };
			const result = parseNoteMetadata(input);
			expect('AnkiTags' in result).toBe(false);
		});

		it('should handle empty object', () => {
			const result = parseNoteMetadata({});
			expect(result).toEqual({});
		});
	});

	describe('real-world scenarios', () => {
		it('should parse typical front-matter object', () => {
			const frontmatter = {
				title: 'My Note',
				date: '2023-01-01',
				AnkiDeck: 'History',
				AnkiTags: ['ancient', 'rome'],
				tags: ['other', 'tags']
			};
			const result = parseNoteMetadata(frontmatter);
			expect(result).toEqual({
				AnkiDeck: 'History',
				AnkiTags: ['ancient', 'rome']
			});
		});

		it('should handle mixed valid and invalid data', () => {
			const input = {
				AnkiDeck: 'ValidDeck',
				AnkiTags: ['valid1', '', 123, 'valid2', null, '  valid3  ']
			};
			const result = parseNoteMetadata(input);
			expect(result).toEqual({
				AnkiDeck: 'ValidDeck',
				AnkiTags: ['valid1', 'valid2', 'valid3']
			});
		});
	});
});
