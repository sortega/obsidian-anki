import {ANKI_DECK_PROPERTY, ANKI_TAGS_PROPERTY} from './constants';

// Note metadata interface for front-matter processing
export interface NoteMetadata {
	[ANKI_DECK_PROPERTY]?: string;
	[ANKI_TAGS_PROPERTY]?: string[];
}

/**
 * Parses note metadata from frontmatter object
 * @param frontmatter - The frontmatter object to parse
 * @returns Parsed NoteMetadata with AnkiDeck and AnkiTags if present
 */
export function parseNoteMetadata(frontmatter: any): NoteMetadata {
	const metadata: NoteMetadata = {};
	
	// Return empty metadata if frontmatter is not an object
	if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
		return metadata;
	}
	
	// Extract AnkiDeck
	if (ANKI_DECK_PROPERTY in frontmatter && typeof frontmatter[ANKI_DECK_PROPERTY] === 'string') {
		const deck = frontmatter[ANKI_DECK_PROPERTY].trim();
		if (deck.length > 0) {
			metadata[ANKI_DECK_PROPERTY] = deck;
		}
	}
	
	// Extract AnkiTags
	if (ANKI_TAGS_PROPERTY in frontmatter && Array.isArray(frontmatter[ANKI_TAGS_PROPERTY])) {
		const tags = frontmatter[ANKI_TAGS_PROPERTY]
			.filter((tag: any) => typeof tag === 'string')
			.map((tag: string) => tag.trim())
			.filter((tag: string) => tag.length > 0);
		
		if (tags.length > 0) {
			metadata[ANKI_TAGS_PROPERTY] = tags;
		}
	}
	
	return metadata;
}
