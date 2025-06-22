import * as yaml from 'js-yaml';

export interface FlashcardData {
	sourcePath: string;
	note_type: string;
	anki_id?: number;  // Missing for new, yet to be synced cards
	tags: string[];
	content_fields: Record<string, string>;
}


export interface FlashcardParseResult {
	data?: FlashcardData;
	error?: string;
}

export const METADATA_FIELDS = ['note_type', 'anki_id', 'tags'];
export const DEFAULT_NOTE_TYPE = 'Basic';

export class FlashcardFieldRenderer {
	static renderFieldToText(fieldValue: string): string {
		// For comparison purposes, we normalize whitespace and remove markdown formatting
		// This is a simplified version - in a full implementation we might want to render markdown to plain text
		return fieldValue.trim().replace(/\s+/g, ' ');
	}
	
	static renderTagsToText(tags: string[]): string {
		// Sort tags for consistent comparison
		return tags.slice().sort().join(',');
	}
	
	static renderFlashcardFields(flashcardData: FlashcardData): Record<string, string> {
		const renderedFields: Record<string, string> = {};
		
		// Render all content fields
		for (const [fieldName, fieldValue] of Object.entries(flashcardData.content_fields)) {
			renderedFields[fieldName] = this.renderFieldToText(fieldValue);
		}
		
		return renderedFields;
	}
}

export class BlockFlashcardParser {
	private static isValidFlashcardData(data: unknown): data is Record<string, unknown> {
		return typeof data === 'object' && data !== null && !Array.isArray(data);
	}

	static parseFlashcard(source: string, sourcePath: string): FlashcardParseResult {
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
			const rawData = yaml.load(trimmedSource);
			
			// Validate that we got an object
			if (!this.isValidFlashcardData(rawData)) {
				return {
					error: 'Flashcard content must be a YAML object with key-value pairs'
				};
			}

			// Create a copy to safely modify
			const data: Record<string, unknown> = { ...rawData };

			// Validate tags field - must be an array of strings if present
			if ('tags' in data && data.tags !== undefined) {
				if (!Array.isArray(data.tags)) {
					return {
						error: 'Tags field must be a YAML list of strings. Use:\ntags:\n  - tag1\n  - tag2'
					};
				}
				
				// Ensure all tags are non-empty strings
				const tags = data.tags;
				for (let i = 0; i < tags.length; i++) {
					const tag = tags[i];
					if (typeof tag !== 'string' || tag.trim().length === 0) {
						return {
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
							error: `Field '${key}' must be a string, number, boolean, or null. Arrays and objects are not supported for content fields.`
						};
					}
					hasContentFields = true;
				}
			}
			
			if (!hasContentFields) {
				return {
					error: 'Flashcard must contain at least one content field (e.g., front, back, question, answer)'
				};
			}

			// Construct FlashcardData with proper structure and mandatory defaults
			const flashcardData: FlashcardData = {
				sourcePath,
				note_type: ('note_type' in data && typeof data.note_type === 'string') 
					? data.note_type 
					: DEFAULT_NOTE_TYPE,
				tags: ('tags' in data && Array.isArray(data.tags)) 
					? data.tags as string[] 
					: [],
				content_fields: contentFields
			};
			
			// Add optional metadata fields
			if ('anki_id' in data && data.anki_id !== undefined && data.anki_id !== null) {
				// Handle anki_id as number, string, or numeric string
				if (typeof data.anki_id === 'number') {
					flashcardData.anki_id = data.anki_id;
				} else if (typeof data.anki_id === 'string') {
					const parsedId = Number(data.anki_id);
					if (Number.isInteger(parsedId) && parsedId > 0) {
						flashcardData.anki_id = parsedId;
					} else {
						return {
							error: `anki_id must be a positive integer, got: ${data.anki_id}`
						};
					}
				} else {
					return {
						error: `anki_id must be a number or numeric string, got: ${typeof data.anki_id}`
					};
				}
			}

			return { data: flashcardData };
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
