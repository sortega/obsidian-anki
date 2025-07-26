import {HtmlFlashcard} from './flashcard';
import * as Diff from 'diff';

export interface DiffPart {
	value: string;
	added?: boolean;
	removed?: boolean;
}

export interface StringDiff {
	old: string;
	new: string;
}

export interface TagsDiff {
	added: string[];
	removed: string[];
}

export interface FieldDiff {
	parts: DiffPart[];
}

export interface FlashcardDiff {
	deck?: StringDiff;
	tags?: TagsDiff;
	fieldDiffs?: Map<string, FieldDiff>;
	noteType?: StringDiff;
	sourcePath?: StringDiff;
}

export class HtmlFlashcardDiffer {
	/**
	 * Analyzes differences between two flashcards and returns structured changes
	 * Returns null if there are no differences
	 */
	diff(anki: HtmlFlashcard, obsidian: HtmlFlashcard): FlashcardDiff | null {
		const diff: FlashcardDiff = {};

		const deckDiff = this.diffDeck(anki, obsidian);
		if (deckDiff) {
			diff.deck = deckDiff;
		}

		const tagsDiff = this.diffTags(anki, obsidian);
		if (tagsDiff) {
			diff.tags = tagsDiff;
		}

		const fieldDiffs = this.diffFields(anki, obsidian);
		if (fieldDiffs.size > 0) {
			diff.fieldDiffs = fieldDiffs;
		}

		const noteTypeDiff = this.diffNoteType(anki, obsidian);
		if (noteTypeDiff) {
			diff.noteType = noteTypeDiff;
		}

		const sourcePathDiff = this.diffSourcePath(anki, obsidian);
		if (sourcePathDiff) {
			diff.sourcePath = sourcePathDiff;
		}

		if (Object.keys(diff).length === 0) {
			return null;
		}

		return diff;
	}

	private diffDeck(anki: HtmlFlashcard, obsidian: HtmlFlashcard): StringDiff | null {
		if (anki.deck === obsidian.deck) {
			return null;
		}
		return {
			old: anki.deck,
			new: obsidian.deck
		};
	}

	private diffTags(anki: HtmlFlashcard, obsidian: HtmlFlashcard): TagsDiff | null {
		const ankiTags = new Set(anki.tags);
		const obsidianTags = new Set(obsidian.tags);

		const added = Array.from(obsidianTags).filter(tag => !ankiTags.has(tag));
		const removed = Array.from(ankiTags).filter(tag => !obsidianTags.has(tag));

		if (added.length == 0 && removed.length == 0) {
			return null;
		}
		return {added, removed};
	}

	private diffFields(anki: HtmlFlashcard, obsidian: HtmlFlashcard): Map<string, FieldDiff> {
		const fieldDiffs = new Map<string, FieldDiff>();

		// Get all field names from both flashcards
		const allFieldNames = new Set([
			...Object.keys(anki.htmlFields),
			...Object.keys(obsidian.htmlFields)
		]);

		for (const fieldName of allFieldNames) {
			const ankiDoc = anki.htmlFields[fieldName];
			const obsidianDoc = obsidian.htmlFields[fieldName];
			
			const ankiHtml = ankiDoc ? ankiDoc.body.innerHTML : '';
			const obsidianHtml = obsidianDoc ? obsidianDoc.body.innerHTML : '';

			if (ankiHtml !== obsidianHtml) {
				const parts = Diff.diffWords(ankiHtml, obsidianHtml);
				
				fieldDiffs.set(fieldName, {parts});
			}
		}

		return fieldDiffs;
	}

	private diffNoteType(anki: HtmlFlashcard, obsidian: HtmlFlashcard): StringDiff | null {
		if (anki.noteType === obsidian.noteType) {
			return null;
		}
		return {
			old: anki.noteType,
			new: obsidian.noteType
		};
	}

	private diffSourcePath(anki: HtmlFlashcard, obsidian: HtmlFlashcard): StringDiff | null {
		if (anki.sourcePath === obsidian.sourcePath) {
			return null;
		}
		return {
			old: anki.sourcePath,
			new: obsidian.sourcePath
		};
	}
}
