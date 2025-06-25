import { YankiConnect } from 'yanki-connect';
import { Flashcard, NoteType } from './flashcard';
import { OBSIDIAN_VAULT_TAG_PREFIX } from './constants';

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
		const searchQuery = `tag:${vaultTag}`;
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
		// Build Anki tags including Obsidian vault tag
		const ankiTags = [
			...flashcard.tags,
			`${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`
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
		// Build Anki tags including Obsidian vault tag
		const ankiTags = [
			...flashcard.tags,
			`${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`
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
		
		// Extract source path from ObsidianNote field
		const sourcePath = (ankiNote.fields && ankiNote.fields['ObsidianNote']) 
			? ankiNote.fields['ObsidianNote'].value 
			: '';
		
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
