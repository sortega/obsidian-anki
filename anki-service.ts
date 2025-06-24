import { YankiConnect } from 'yanki-connect';
import { Flashcard } from './flashcard';
import { OBSIDIAN_SYNC_TAG, OBSIDIAN_VAULT_TAG_PREFIX, OBSIDIAN_FILE_TAG_PREFIX } from './constants';

// Domain types for Anki data structures
export interface AnkiNoteField {
	value: string;
	order: number;
}

export interface AnkiNote {
	noteId: number;
	fields: Record<string, AnkiNoteField>;
	tags: string[];
	modelName: string;
	cards: number[];
}

export interface AnkiNoteType {
	name: string;
	fields: string[];
}

// Port - AnkiService interface defining operations needed by the application
export interface AnkiService {
	/**
	 * Get all available note types from Anki with their field information
	 */
	getNoteTypes(): Promise<AnkiNoteType[]>;
	
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
	createNote(flashcard: Flashcard, deckName: string, vaultName: string): Promise<number>;
	
	/**
	 * Update an existing note in Anki with new flashcard data
	 */
	updateNote(ankiId: number, flashcard: Flashcard, vaultName: string): Promise<void>;
	
	/**
	 * Delete notes from Anki by their IDs
	 */
	deleteNotes(noteIds: number[]): Promise<void>;
}

// Adapter - YankiConnect implementation of AnkiService
export class YankiConnectAnkiService implements AnkiService {
	private yankiConnect: YankiConnect;
	
	constructor() {
		this.yankiConnect = new YankiConnect();
	}
	
	async getNoteTypes(): Promise<AnkiNoteType[]> {
		const noteTypeNames = await this.yankiConnect.model.modelNames();
		const noteTypes: AnkiNoteType[] = [];
		
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
		
		// Filter out any null/undefined responses and ensure proper typing
		return notes.filter((note): note is AnkiNote => 
			note !== null && note !== undefined && note.noteId !== undefined
		) as AnkiNote[];
	}
	
	async createNote(flashcard: Flashcard, deckName: string, vaultName: string): Promise<number> {
		// Build Anki tags including Obsidian tracking tags
		const ankiTags = [
			...flashcard.tags,
			OBSIDIAN_SYNC_TAG,
			`${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`,
			`${OBSIDIAN_FILE_TAG_PREFIX}${flashcard.sourcePath}`
		];
		
		const noteId = await this.yankiConnect.note.addNote({
			note: {
				deckName: deckName,
				modelName: flashcard.noteType,
				fields: flashcard.contentFields,
				tags: ankiTags
			}
		});
		
		if (noteId === null) {
			throw new Error('Failed to create note in Anki - note already exists or invalid data');
		}
		
		return noteId;
	}
	
	async updateNote(ankiId: number, flashcard: Flashcard, vaultName: string): Promise<void> {
		// Build Anki tags including Obsidian tracking tags
		const ankiTags = [
			...flashcard.tags,
			OBSIDIAN_SYNC_TAG,
			`${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`,
			`${OBSIDIAN_FILE_TAG_PREFIX}${flashcard.sourcePath}`
		];
		
		await this.yankiConnect.note.updateNote({
			note: {
				id: ankiId,
				fields: flashcard.contentFields,
				tags: ankiTags
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
}

// Utility functions for converting between Anki and Obsidian data formats
export class AnkiDataConverter {
	/**
	 * Converts an AnkiNote to Flashcard format
	 */
	static toFlashcard(ankiNote: AnkiNote, noteType: string): Flashcard {
		const contentFields: Record<string, string> = {};
		
		// Convert Anki fields to content fields
		for (const [fieldName, fieldData] of Object.entries(ankiNote.fields || {})) {
			// Keep HTML tags since FlashcardRenderer can handle them properly
			contentFields[fieldName] = fieldData.value || '';
		}
		
		// Extract source path from obsidian-file tag
		const obsidianFileTag = (ankiNote.tags || []).find(tag => tag.startsWith(OBSIDIAN_FILE_TAG_PREFIX));
		const sourcePath = obsidianFileTag ? obsidianFileTag.replace(OBSIDIAN_FILE_TAG_PREFIX, '') : '';
		
		return {
			sourcePath: sourcePath,
			lineStart: 0, // We don't have line info for Anki notes
			lineEnd: 0,
			noteType: noteType,
			contentFields: contentFields,
			tags: ankiNote.tags || [],
			ankiId: ankiNote.noteId
		};
	}
}
