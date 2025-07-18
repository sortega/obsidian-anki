import * as yaml from 'js-yaml';
import { DEFAULT_NOTE_TYPE, DEFAULT_DECK, METADATA_FIELDS, ANKI_DECK_PROPERTY, ANKI_TAGS_PROPERTY } from './constants';
import { NoteMetadata } from './note-metadata';

// Note type definition for flashcard templates
export interface NoteType {
	name: string;
	fields: string[];
}

// Base interface for all flashcard-related objects
export interface FlashcardBlock {
	sourcePath: string;
	lineStart: number;
	lineEnd: number;
}

// Valid flashcard with Markdown content
export interface Flashcard extends FlashcardBlock {
	noteType: string;
	ankiId?: number;  // Missing for new, yet to be synced cards
	tags: string[];
	contentFields: Record<string, string>; // markdown content
	warnings: string[]; // Problems not so serious as making the flashcard invalid
	deck: string;
}

// HTML flashcard with rendered content and metadata tags (for display/comparison)
export interface HtmlFlashcard extends FlashcardBlock {
	noteType: string;
	ankiId?: number;
	tags: string[];
	htmlFields: Record<string, string>;
	warnings: string[];
	deck: string;
}

// Invalid flashcard with parsing error
export interface InvalidFlashcard extends FlashcardBlock {
	error: string;
}


export class BlockFlashcardParser {
	private static isValidFlashcardData(data: unknown): data is Record<string, unknown> {
		return typeof data === 'object' && data !== null && !Array.isArray(data);
	}

	static parseFlashcard(source: string, sourcePath: string, lineStart: number, lineEnd: number, defaultDeck: string, noteMetadata: NoteMetadata, availableNoteTypes?: NoteType[]): Flashcard | InvalidFlashcard {
		function invalidFlashcard(error: string): InvalidFlashcard {
			return { sourcePath, lineStart, lineEnd, error };
		}
		
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
			if ('Tags' in data && data.Tags !== undefined) {
				if (!Array.isArray(data.Tags)) {
					return invalidFlashcard('Tags field must be a YAML list of strings. Use:\nTags:\n  - tag1\n  - tag2');
				}
				
				// Ensure all tags are non-empty strings
				const tags = data.Tags;
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
						return invalidFlashcard(`Field '${key}' must be a string, number, boolean, or null. Arrays and objects are not supported for content fields.`);
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
				noteType: ('NoteType' in data && typeof data.NoteType === 'string') 
					? data.NoteType
					: DEFAULT_NOTE_TYPE,
				tags: this.parseTags(data, noteMetadata),
				contentFields: contentFields,
				warnings: [],
				deck: this.parseDeck(data, noteMetadata, defaultDeck)
			};
			
			// Check for warnings if availableNoteTypes is provided
			if (availableNoteTypes) {
				// Check for unknown note type
				const noteType = availableNoteTypes.find(nt => nt.name === flashcard.noteType);
				if (!noteType) {
					flashcard.warnings.push(`Unknown note type: '${flashcard.noteType}'. Available note types: ${availableNoteTypes.map(nt => nt.name).join(', ')}`);
				} else {
					// Check for unknown fields
					const availableFields = noteType.fields;
					const flashcardFields = Object.keys(flashcard.contentFields);
					const unknownFields = flashcardFields.filter(fieldName => !availableFields.includes(fieldName));
					
					if (unknownFields.length > 0) {
						if (unknownFields.length === 1) {
							flashcard.warnings.push(`Unknown field '${unknownFields[0]}' for note type '${flashcard.noteType}'. Available fields: ${availableFields.join(', ')}`);
						} else {
							flashcard.warnings.push(`Unknown fields '${unknownFields.join("', '")}' for note type '${flashcard.noteType}'. Available fields: ${availableFields.join(', ')}`);
						}
					}
				}
			}
			
			// Add optional metadata fields
			if ('AnkiId' in data && data.AnkiId !== undefined && data.AnkiId !== null) {
				// Handle AnkiId as number, string, or numeric string
				if (typeof data.AnkiId === 'number') {
					if (Number.isInteger(data.AnkiId) && data.AnkiId > 0) {
						flashcard.ankiId = data.AnkiId;
					} else {
						return invalidFlashcard(`AnkiId must be a positive integer, got: ${data.AnkiId}`);
					}
				} else if (typeof data.AnkiId === 'string') {
					const parsedId = Number(data.AnkiId);
					if (Number.isInteger(parsedId) && parsedId > 0) {
						flashcard.ankiId = parsedId;
					} else {
						return invalidFlashcard(`AnkiId must be a positive integer, got: ${data.AnkiId}`);
					}
				} else {
					return invalidFlashcard(`AnkiId must be a number or numeric string, got: ${typeof data.AnkiId}`);
				}
			}

			return flashcard;
		} catch (error) {
			if (error instanceof yaml.YAMLException) {
				return invalidFlashcard(`YAML parsing error: ${error.message}`);
			}
			return invalidFlashcard(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private static parseDeck(data: Record<string, unknown>, noteMetadata: NoteMetadata, defaultDeck: string): string {
		// Flashcard-level Deck field takes highest precedence
		if ('Deck' in data && typeof data.Deck === 'string' && data.Deck.trim().length > 0) {
			return data.Deck.trim();
		}
		// File-level AnkiDeck front-matter takes second precedence
		if (noteMetadata[ANKI_DECK_PROPERTY] && noteMetadata[ANKI_DECK_PROPERTY].trim().length > 0) {
			return noteMetadata[ANKI_DECK_PROPERTY].trim();
		}
		// Plugin default deck as fallback
		return defaultDeck;
	}

	private static parseTags(data: Record<string, unknown>, noteMetadata: NoteMetadata): string[] {
		const flashcardTags = ('Tags' in data && Array.isArray(data.Tags)) ? data.Tags as string[] : [];
		const frontMatterTags = noteMetadata[ANKI_TAGS_PROPERTY] || [];
		const allTags = [...frontMatterTags, ...flashcardTags];
		return [...new Set(allTags)].sort();
	}
}

