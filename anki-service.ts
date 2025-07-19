import {YankiConnect} from 'yanki-connect';
import {Flashcard, HtmlFlashcard, NoteType} from './flashcard';
import {OBSIDIAN_FILE_TAG_PREFIX, OBSIDIAN_SYNC_TAG, OBSIDIAN_VAULT_TAG_PREFIX} from './constants';

const TurndownService = require('turndown');

// Turndown service interface for better typing
interface TurndownInstance {
	turndown(html: string): string;
	addRule(name: string, rule: any): void;
}

// Domain types for Anki data structures
export interface AnkiNoteField {
	value: string;
	order: number;
}

export interface AnkiNote {
	noteId: number;
	htmlFields: Record<string, AnkiNoteField>;
	tags: string[];
	modelName: string;
	cards: number[];
	deckNames: Set<string>;  // Multi-card notes might have cards in different decks
}


// Port - AnkiService interface defining operations needed by the application
export interface AnkiService {
	/**
	 * Get all available note types from Anki with their field information
	 */
	getNoteTypes(): Promise<NoteType[]>;
	
	/**
	 * Get all available deck names from Anki
	 */
	getDeckNames(): Promise<string[]>;
	
	/**
	 * Get IDs of notes managed by this plugin for a specific vault
	 */
	getManagedNoteIds(vaultName: string): Promise<number[]>;
	
	/**
	 * Get detailed information for multiple notes
	 */
	getNotes(noteIds: number[]): Promise<AnkiNote[]>;
	
	/**
	 * Create a new note in Anki from a flashcard
	 */
	createNote(flashcard: HtmlFlashcard): Promise<number>;
	
	/**
	 * Update an existing note in Anki with new flashcard data
	 */
	updateNote(ankiId: number, flashcard: HtmlFlashcard): Promise<void>;
	
	/**
	 * Delete notes from Anki by their IDs
	 */
	deleteNotes(noteIds: number[]): Promise<void>;
	
	/**
	 * Move cards to a different deck
	 */
	moveCard(ankiId: number, deckName: string): Promise<void>;
	
	/**
	 * Convert an orphaned AnkiNote to a Flashcard with markdown content
	 */
	convertOrphanedNoteToFlashcard(ankiNote: AnkiNote): Flashcard;
	
	/**
	 * Convert an AnkiNote to HtmlFlashcard format for display
	 */
	toHtmlFlashcard(ankiNote: AnkiNote): HtmlFlashcard;
	

	filterIgnoredTags(tags: string[]): string[];
	setIgnoredTags(ignoredTags: string[]): void;
}

// Adapter - YankiConnect implementation of AnkiService
export class YankiConnectAnkiService implements AnkiService {
	private yankiConnect: YankiConnect;
	private turndownService: TurndownInstance;
	private ignoredTags: string[];
	
	constructor(ignoredTags: string[] = []) {
		this.yankiConnect = new YankiConnect();
		this.ignoredTags = ignoredTags;
		
		// Initialize turndown service for HTML to markdown conversion
		this.turndownService = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
			bulletListMarker: '-',
			emDelimiter: '*',
			strongDelimiter: '**'
		});
	}
	
	async getNoteTypes(): Promise<NoteType[]> {
		const noteTypeNames = await this.yankiConnect.model.modelNames();
		const noteTypes: NoteType[] = [];
		
		for (const noteTypeName of noteTypeNames) {
			const fields = await this.yankiConnect.model.modelFieldNames({ modelName: noteTypeName });
			noteTypes.push({
				name: noteTypeName,
				fields: fields
			});
		}
		
		return noteTypes;
	}
	
	async getDeckNames(): Promise<string[]> {
		return await this.yankiConnect.deck.deckNames();
	}
	
	async getManagedNoteIds(vaultName: string): Promise<number[]> {
		const vaultTag = `${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`;
		const searchQuery = `tag:${OBSIDIAN_SYNC_TAG} AND tag:${vaultTag}`;
		return await this.yankiConnect.note.findNotes({ query: searchQuery });
	}
	
	async getNotes(noteIds: number[]): Promise<AnkiNote[]> {
		if (noteIds.length === 0) {
			return [];
		}
		
		const notes = await this.yankiConnect.note.notesInfo({ notes: noteIds });
		
		// Get deck information for all cards
		const allCardIds = notes.filter(note => note && note.cards)
			.flatMap(note => note.cards || []);
		
		let cardDecks: Record<number, string> = {};
		if (allCardIds.length > 0) {
			const cardsInfo = await this.yankiConnect.card.cardsInfo({ cards: allCardIds });
			cardsInfo.forEach((card: any) => {
				if (card && card.cardId && card.deckName) {
					cardDecks[card.cardId] = card.deckName;
				}
			});
		}
		
		// Convert notes from yanki-connect format to our AnkiNote format
		return notes.filter(note => 
			note !== null && note !== undefined && note.noteId !== undefined
		).map(note => {
			const deckNames = new Set((note.cards ?? []).map(cardId => cardDecks[cardId]));
			return {
				noteId: note.noteId,
				htmlFields: note.fields || {},
				tags: this.filterIgnoredTags(note.tags || []),
				modelName: note.modelName,
				cards: note.cards || [],
				deckNames: deckNames
			};
		});
	}
	
	async createNote(flashcard: HtmlFlashcard): Promise<number> {
		const noteId = await this.yankiConnect.note.addNote({
			note: {
				deckName: flashcard.deck,
				modelName: flashcard.noteType,
				fields: flashcard.htmlFields,
				tags: flashcard.tags
			}
		});
		
		if (noteId === null) {
			throw new Error('Failed to create note in Anki - note already exists or invalid data');
		}
		
		return noteId;
	}
	
	async updateNote(ankiId: number, flashcard: HtmlFlashcard): Promise<void> {
		await this.yankiConnect.note.updateNote({
			note: {
				id: ankiId,
				fields: flashcard.htmlFields,
				tags: flashcard.tags
			}
		});
	}
	
	async deleteNotes(noteIds: number[]): Promise<void> {
		if (noteIds.length === 0) {
			return;
		}
		
		await this.yankiConnect.note.deleteNotes({
			notes: noteIds
		});
	}
	
	async moveCard(ankiId: number, deckName: string): Promise<void> {
		// Get all cards for this note
		const noteInfo = await this.yankiConnect.note.notesInfo({ notes: [ankiId] });
		if (!noteInfo || noteInfo.length === 0 || !noteInfo[0].cards) {
			throw new Error(`Cannot find cards for note ${ankiId}`);
		}
		
		const cardIds = noteInfo[0].cards;
		
		// Move all cards to the target deck
		await this.yankiConnect.deck.changeDeck({
			cards: cardIds,
			deck: deckName
		});
	}
	
	/**
	 * Extract source path from AnkiNote using obsidian-file:: tag
	 */
	private extractSourcePath(ankiNote: AnkiNote): string {
		const fileTag = (ankiNote.tags || []).find(tag => tag.startsWith(OBSIDIAN_FILE_TAG_PREFIX));
		if (fileTag) {
			return decodeURI(fileTag.substring(OBSIDIAN_FILE_TAG_PREFIX.length));
		}

		return '';
	}

	filterIgnoredTags(tags: string[]): string[] {
		return (tags || []).filter(tag => 
			!this.ignoredTags.includes(tag)
		);
	}

	convertOrphanedNoteToFlashcard(ankiNote: AnkiNote): Flashcard {
		const contentFields: Record<string, string> = {};
		
		// Add field content (convert HTML to markdown)
		for (const [fieldName, fieldData] of Object.entries(ankiNote.htmlFields || {})) {
			let fieldValue = fieldData.value || '';
			
			// Use turndown to convert HTML to markdown
			if (fieldValue.trim()) {
				try {
					fieldValue = this.turndownService.turndown(fieldValue).trim();
				} catch (error) {
					console.warn(`Failed to convert HTML to markdown for field ${fieldName}:`, error);
					// Keep original HTML if conversion fails - better to preserve content than lose it
				}
			}
			
			contentFields[fieldName] = fieldValue;
		}
		
		return {
			sourcePath: this.extractSourcePath(ankiNote),
			lineStart: 0, // We don't have line info for orphaned notes
			lineEnd: 0,
			noteType: ankiNote.modelName,
			contentFields: contentFields,
			tags: this.filterIgnoredTags(ankiNote.tags),
			ankiId: ankiNote.noteId,
			warnings: [], // Orphaned notes don't have parsing warnings
			// Pick the deck of one of the cards when importing. After two syncs it will be normalized.
			deck: ankiNote.deckNames[Symbol.iterator]().next().value
		};
	}

	toHtmlFlashcard(ankiNote: AnkiNote): HtmlFlashcard {
		const htmlFields: Record<string, string> = {};
		
		// Convert Anki htmlFields to htmlFields (keep HTML for display)
		for (const [fieldName, fieldData] of Object.entries(ankiNote.htmlFields || {})) {
			// Keep HTML tags since FlashcardRenderer can handle them properly
			htmlFields[fieldName] = fieldData.value || '';
		}
		
		return {
			sourcePath: this.extractSourcePath(ankiNote),
			lineStart: 0, // We don't have line info for Anki notes
			lineEnd: 0,
			noteType: ankiNote.modelName,
			htmlFields: htmlFields,
			tags: this.filterIgnoredTags(ankiNote.tags),
			ankiId: ankiNote.noteId,
			warnings: [], // Anki notes don't have parsing warnings
			// Display all the deck names, this will be ironed out by the next sync
			deck: Array.from(ankiNote.deckNames).join(',')
		};
	}
	
	setIgnoredTags(ignoredTags: string[]): void {
		this.ignoredTags = ignoredTags;
	}
	
}
