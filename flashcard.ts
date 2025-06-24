import * as yaml from 'js-yaml';
import { DEFAULT_NOTE_TYPE, METADATA_FIELDS } from './constants';

// Base interface for all flashcard-related objects
export interface FlashcardBlock {
	sourcePath: string;
	lineStart: number;
	lineEnd: number;
}

// Valid flashcard with parsed content
export interface Flashcard extends FlashcardBlock {
	noteType: string;
	ankiId?: number;  // Missing for new, yet to be synced cards
	tags: string[];
	contentFields: Record<string, string>;
}

// Invalid flashcard with parsing error
export interface InvalidFlashcard extends FlashcardBlock {
	error: string;
}


export class BlockFlashcardParser {
	private static isValidFlashcardData(data: unknown): data is Record<string, unknown> {
		return typeof data === 'object' && data !== null && !Array.isArray(data);
	}

	static parseFlashcard(source: string, sourcePath: string, lineStart: number, lineEnd: number): Flashcard | InvalidFlashcard {
		try {
			// Trim whitespace
			const trimmedSource = source.trim();
			
			// Check for empty content
			if (!trimmedSource) {
				return {
					sourcePath,
					lineStart,
					lineEnd,
					error: 'No content found in flashcard block'
				};
			}

			// Parse YAML using js-yaml
			const rawData = yaml.load(trimmedSource);
			
			// Validate that we got an object
			if (!this.isValidFlashcardData(rawData)) {
				return {
					sourcePath,
					lineStart,
					lineEnd,
					error: 'Flashcard content must be a YAML object with key-value pairs'
				};
			}

			// Create a copy to safely modify
			const data: Record<string, unknown> = { ...rawData };

			// Validate tags field - must be an array of strings if present
			if ('tags' in data && data.tags !== undefined) {
				if (!Array.isArray(data.tags)) {
					return {
						sourcePath,
						lineStart,
						lineEnd,
						error: 'Tags field must be a YAML list of strings. Use:\ntags:\n  - tag1\n  - tag2'
					};
				}
				
				// Ensure all tags are non-empty strings
				const tags = data.tags;
				for (let i = 0; i < tags.length; i++) {
					const tag = tags[i];
					if (typeof tag !== 'string' || tag.trim().length === 0) {
						return {
							sourcePath,
							lineStart,
							lineEnd,
							error: `Tag at position ${i + 1} must be a non-empty string`
						};
					}
					tags[i] = tag.trim();
				}
			}

			// Separate metadata from content fields
			const contentFields: Record<string, string> = {};
			let hasContentFields = false;
			
			for (const [key, value] of Object.entries(data)) {
				if (!METADATA_FIELDS.includes(key)) {
					// Convert value to string (handling scalars, null, etc.)
					if (value === null || value === undefined) {
						contentFields[key] = '';
					} else if (typeof value === 'string') {
						contentFields[key] = value;
					} else if (typeof value === 'number' || typeof value === 'boolean') {
						contentFields[key] = String(value);
					} else {
						return {
							sourcePath,
							lineStart,
							lineEnd,
							error: `Field '${key}' must be a string, number, boolean, or null. Arrays and objects are not supported for content fields.`
						};
					}
					hasContentFields = true;
				}
			}
			
			if (!hasContentFields) {
				return {
					sourcePath,
					lineStart,
					lineEnd,
					error: 'Flashcard must contain at least one content field (e.g., front, back, question, answer)'
				};
			}

			// Construct Flashcard with proper structure and mandatory defaults
			const flashcard: Flashcard = {
				sourcePath,
				lineStart,
				lineEnd,
				noteType: ('note_type' in data && typeof data.note_type === 'string') 
					? data.note_type 
					: DEFAULT_NOTE_TYPE,
				tags: ('tags' in data && Array.isArray(data.tags)) 
					? data.tags as string[] 
					: [],
				contentFields: contentFields
			};
			
			// Add optional metadata fields
			if ('anki_id' in data && data.anki_id !== undefined && data.anki_id !== null) {
				// Handle anki_id as number, string, or numeric string
				if (typeof data.anki_id === 'number') {
					flashcard.ankiId = data.anki_id;
				} else if (typeof data.anki_id === 'string') {
					const parsedId = Number(data.anki_id);
					if (Number.isInteger(parsedId) && parsedId > 0) {
						flashcard.ankiId = parsedId;
					} else {
						return {
							sourcePath,
							lineStart,
							lineEnd,
							error: `anki_id must be a positive integer, got: ${data.anki_id}`
						};
					}
				} else {
					return {
						sourcePath,
						lineStart,
						lineEnd,
						error: `anki_id must be a number or numeric string, got: ${typeof data.anki_id}`
					};
				}
			}

			return flashcard;
		} catch (error) {
			if (error instanceof yaml.YAMLException) {
				return {
					sourcePath,
					lineStart,
					lineEnd,
					error: `YAML parsing error: ${error.message}`
				};
			}
			
			return {
				sourcePath,
				lineStart,
				lineEnd,
				error: `Parsing error: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
}
