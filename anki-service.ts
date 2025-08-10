import {YankiConnect} from 'yanki-connect';
import {Flashcard, HtmlFlashcard, NoteType} from './flashcard';
import {OBSIDIAN_FILE_TAG_PREFIX, OBSIDIAN_SYNC_TAG, OBSIDIAN_VAULT_TAG_PREFIX} from './constants';
import * as CryptoJS from 'crypto-js';

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

// Media item for syncing media files to Anki
export interface MediaItem {
	sourcePath: string;
	contents: Uint8Array;
}


// AnkiService interface defining operations needed by the application
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
	createNote(flashcard: HtmlFlashcard, mediaItems: MediaItem[]): Promise<number>;
	
	/**
	 * Update an existing note in Anki with new flashcard data
	 */
	updateNote(ankiId: number, flashcard: HtmlFlashcard, mediaItems: MediaItem[]): Promise<void>;
	
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
	
	/**
	 * Store a media file in Anki using the relative path from Obsidian vault
	 */
	storeMediaFile(mediaItem: MediaItem): Promise<string>;
	
	/**
	 * Check if a media file already exists in Anki
	 */
	hasMediaFile(mediaItem: MediaItem): Promise<boolean>;
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
	
	async createNote(flashcard: HtmlFlashcard, mediaItems: MediaItem[]): Promise<number> {
		// Transform HTML fields to use Anki media filenames
		const transformedFields: Record<string, string> = {};
		for (const [fieldName, doc] of Object.entries(flashcard.htmlFields)) {
			// Clone the document to avoid modifying the original
			const clonedDoc = doc.cloneNode(true) as Document;
			this.transformDocumentForAnki(clonedDoc, mediaItems);
			transformedFields[fieldName] = clonedDoc.body.innerHTML;
		}

		const noteId = await this.yankiConnect.note.addNote({
			note: {
				deckName: flashcard.deck,
				modelName: flashcard.noteType,
				fields: transformedFields,
				tags: flashcard.tags
			}
		});
		
		if (noteId === null) {
			throw new Error('Failed to create note in Anki - note already exists or invalid data');
		}
		
		return noteId;
	}
	
	async updateNote(ankiId: number, flashcard: HtmlFlashcard, mediaItems: MediaItem[]): Promise<void> {
		// Transform HTML fields to use Anki media filenames
		const transformedFields: Record<string, string> = {};
		for (const [fieldName, doc] of Object.entries(flashcard.htmlFields)) {
			// Clone the document to avoid modifying the original
			const clonedDoc = doc.cloneNode(true) as Document;
			this.transformDocumentForAnki(clonedDoc, mediaItems);
			transformedFields[fieldName] = clonedDoc.body.innerHTML;
		}

		await this.yankiConnect.note.updateNote({
			note: {
				id: ankiId,
				fields: transformedFields,
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
		const parser = new DOMParser();
		
		// Add field content (convert HTML to markdown, transforming media paths first)
		for (const [fieldName, fieldData] of Object.entries(ankiNote.htmlFields || {})) {
			let fieldValue = fieldData.value || '';
			
			if (fieldValue.trim()) {
				// Parse HTML into Document and transform Anki media filenames back to vault paths
				const doc = parser.parseFromString(fieldValue, 'text/html');
				this.transformDocumentFromAnki(doc);
				fieldValue = doc.body.innerHTML;
				
				// Use turndown to convert HTML to markdown
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
		const htmlFields: Record<string, Document> = {};
		const parser = new DOMParser();
		
		// Convert Anki htmlFields to Document objects and transform media paths back to vault paths
		for (const [fieldName, fieldData] of Object.entries(ankiNote.htmlFields || {})) {
			const htmlContent = fieldData.value || '';
			const doc = parser.parseFromString(htmlContent, 'text/html');
			// Transform Anki media filenames back to vault paths for display
			this.transformDocumentFromAnki(doc);
			htmlFields[fieldName] = doc;
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

	async storeMediaFile(mediaItem: MediaItem): Promise<string> {
		const ankiFilename = this.generateAnkiMediaFilename(mediaItem);
		const base64Data = this.arrayBufferToBase64(mediaItem.contents);
		return await this.yankiConnect.media.storeMediaFile({
			filename: ankiFilename,
			data: base64Data
		});
	}

	async hasMediaFile(mediaItem: MediaItem): Promise<boolean> {
		try {
			const ankiFilename = this.generateAnkiMediaFilename(mediaItem);
			const encodedContents = await this.yankiConnect.media.retrieveMediaFile({
				filename: ankiFilename
			});
			return encodedContents === this.arrayBufferToBase64(mediaItem.contents);
		} catch (error) {
			console.warn(`Failed to check if media file exists ${mediaItem.sourcePath}:`, error);
			return false;
		}
	}

	private arrayBufferToBase64(buffer: Uint8Array): string {
		return Buffer.from(buffer).toString('base64');
	}

	/**
	 * Generate Anki-compatible filename for media file
	 * Format: obsidian-synced-${base64EncodedPath}-${contentMd5Hash}.${extension}
	 */
	private generateAnkiMediaFilename(mediaItem: MediaItem): string {
		// Extract file extension
		const lastDotIndex = mediaItem.sourcePath.lastIndexOf('.');
		const extension = lastDotIndex !== -1 ? mediaItem.sourcePath.substring(lastDotIndex + 1) : '';
		
		// Base64 encode the path for safe filename usage
		const encodedPath = btoa(mediaItem.sourcePath);
		
		// Generate MD5 hash of the file contents
		// Convert Uint8Array to WordArray for CryptoJS
		const wordArray = CryptoJS.lib.WordArray.create(Array.from(mediaItem.contents));
		const contentHash = CryptoJS.MD5(wordArray).toString();
		
		// Construct the filename
		return `obsidian-synced-${encodedPath}-${contentHash}${extension ? '.' + extension : ''}`;
	}

	/**
	 * Extract the original source path from an Anki media filename
	 * Reverses the mangling done by generateAnkiMediaFilename
	 */
	private extractSourcePathFromAnkiFilename(ankiFilename: string): string | null {
		// Check if it matches our pattern: obsidian-synced-{base64EncodedPath}-{hash}.{ext}
		// Use non-greedy match for the path part and ensure we match the 32-char hash correctly
		const match = ankiFilename.match(/^obsidian-synced-(.+?)-([a-f0-9]{32})(\.[^.]+)?$/);
		if (!match) {
			return null;
		}
		
		const encodedPath = match[1];
		// Decode the base64-encoded path
		try {
			return atob(encodedPath);
		} catch (error) {
			console.warn(`Failed to decode path from Anki filename: ${ankiFilename}`, error);
			return null;
		}
	}

	/**
	 * Transform HTML Document for Anki by converting vault paths to mangled Anki filenames
	 */
	private transformDocumentForAnki(doc: Document, mediaItems: MediaItem[]): void {
		try {
			const images = doc.querySelectorAll('img');
			
			images.forEach(img => {
				const src = img.getAttribute('src');
				if (src && this.isRelativePath(src)) {
					// Find the corresponding media item
					const mediaItem = mediaItems.find(item => item.sourcePath === src);
					if (!mediaItem) {
						return;
					}
					img.setAttribute('src', this.generateAnkiMediaFilename(mediaItem));
				}
			});
		} catch (error) {
			console.warn('Failed to transform Document for Anki:', error);
		}
	}

	/**
	 * Transform HTML Document from Anki by converting mangled Anki filenames back to vault paths
	 */
	private transformDocumentFromAnki(doc: Document): void {
		try {
			const images = doc.querySelectorAll('img');
			
			images.forEach(img => {
				const src = img.getAttribute('src');
				if (src && src.startsWith('obsidian-synced-')) {
					// Extract original path from Anki filename
					const originalPath = this.extractSourcePathFromAnkiFilename(src);
					if (originalPath) {
						img.setAttribute('src', originalPath);
					}
				}
			});
		} catch (error) {
			console.warn('Failed to transform Document from Anki:', error);
		}
	}

	/**
	 * Check if a path is relative (not an absolute URL or data URL)
	 */
	private isRelativePath(src: string): boolean {
		return !src.startsWith('http://') && 
			   !src.startsWith('https://') && 
			   !src.startsWith('data:') && 
			   !src.startsWith('file://') &&
			   !src.startsWith('/');
	}
	
}
