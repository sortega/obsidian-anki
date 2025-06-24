import { YankiConnect } from 'yanki-connect';
import { Flashcard } from './flashcard';

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
		const vaultTag = `obsidian-vault::${vaultName}`;
		const searchQuery = `tag:obsidian-synced AND tag:${vaultTag}`;
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
		const obsidianFileTag = (ankiNote.tags || []).find(tag => tag.startsWith('obsidian-file::'));
		const sourcePath = obsidianFileTag ? obsidianFileTag.replace('obsidian-file::', '') : '';
		
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
