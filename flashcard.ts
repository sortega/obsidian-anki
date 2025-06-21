import * as yaml from 'js-yaml';

export interface FlashcardData {
	note_type?: string;
	anki_id?: string;
	tags?: string[] | string;
	[key: string]: any;
}

export interface FlashcardParseResult {
	data?: FlashcardData;
	error?: string;
}

export const METADATA_FIELDS = ['note_type', 'anki_id', 'tags'];

export class BlockFlashcardParser {
	static parseFlashcard(source: string): FlashcardParseResult {
		try {
			// Trim whitespace
			const trimmedSource = source.trim();
			
			// Check for empty content
			if (!trimmedSource) {
				return {
					error: 'No content found in flashcard block'
				};
			}

			// Parse YAML using js-yaml
			const parsed = yaml.load(trimmedSource);
			
			// Validate that we got an object
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return {
					error: 'Flashcard content must be a YAML object with key-value pairs'
				};
			}

			const data = parsed as FlashcardData;

			// Normalize tags field - ensure it's an array of strings
			if (data.tags) {
				if (typeof data.tags === 'string') {
					// Split comma-separated or newline-separated tags
					data.tags = data.tags
						.split(/[,\n]/)
						.map(tag => tag.trim())
						.filter(tag => tag.length > 0);
				} else if (Array.isArray(data.tags)) {
					// Ensure all tags are strings and filter out empty ones
					data.tags = data.tags
						.map(tag => String(tag).trim())
						.filter(tag => tag.length > 0);
				}
			}

			// Validate that we have at least some content fields
			const contentFields = Object.keys(data).filter(key => !METADATA_FIELDS.includes(key));
			
			if (contentFields.length === 0) {
				return {
					error: 'Flashcard must contain at least one content field (e.g., front, back, question, answer)'
				};
			}

			return { data };
		} catch (error) {
			if (error instanceof yaml.YAMLException) {
				return {
					error: `YAML parsing error: ${error.message}`
				};
			}
			
			return {
				error: `Parsing error: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
}