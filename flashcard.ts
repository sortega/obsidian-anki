import * as yaml from 'js-yaml';

export interface FlashcardData {
	note_type?: string;
	anki_id?: string;
	tags?: string[];
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
			const data = yaml.load(trimmedSource);
			
			// Validate that we got an object
			if (!data || typeof data !== 'object' || Array.isArray(data)) {
				return {
					error: 'Flashcard content must be a YAML object with key-value pairs'
				};
			}

			// Validate tags field - must be an array of strings if present
			if ((data as any).tags !== undefined) {
				if (!Array.isArray((data as any).tags)) {
					return {
						error: 'Tags field must be a YAML list of strings. Use:\ntags:\n  - tag1\n  - tag2'
					};
				}
				
				// Ensure all tags are non-empty strings
				for (let i = 0; i < (data as any).tags.length; i++) {
					const tag = (data as any).tags[i];
					if (typeof tag !== 'string' || tag.trim().length === 0) {
						return {
							error: `Tag at position ${i + 1} must be a non-empty string`
						};
					}
					(data as any).tags[i] = tag.trim();
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