import {App, MarkdownView, SuggestModal} from 'obsidian';
import {NoteType} from './flashcard';

export interface FlashcardInsertModalProps {
	availableNoteTypes: NoteType[];
	lastUsedNoteType: string;
	onNoteTypeSelected: (noteType: string) => Promise<void>;
}

export class FlashcardInsertModal extends SuggestModal<string> {
	private props: FlashcardInsertModalProps;

	constructor(app: App, props: FlashcardInsertModalProps) {
		super(app);
		this.props = props;
		this.setPlaceholder('Select note type for flashcard...');
	}

	getSuggestions(query: string): string[] {
		const noteTypeNames = this.props.availableNoteTypes.map(nt => nt.name);

		// Sort by last used note type first, then by fuzzy match
		const lastUsed = this.props.lastUsedNoteType;
		return noteTypeNames.sort((a, b) => {
			if (a === lastUsed) return -1;
			if (b === lastUsed) return 1;
			
			// Simple fuzzy matching
			const aMatch = a.toLowerCase().includes(query.toLowerCase());
			const bMatch = b.toLowerCase().includes(query.toLowerCase());
			if (aMatch && !bMatch) return -1;
			if (!aMatch && bMatch) return 1;
			
			return a.localeCompare(b);
		});
	}

	renderSuggestion(noteTypeName: string, el: HTMLElement) {
		const noteType = this.props.availableNoteTypes.find(nt => nt.name === noteTypeName);
		const fields = noteType?.fields || [];
		el.createEl('div', { text: noteTypeName });
		if (fields.length > 0) {
			el.createEl('small', { text: `Fields: ${fields.join(', ')}` });
		}
	}

	async onChooseSuggestion(noteType: string, _evt: MouseEvent | KeyboardEvent) {
		// Save as last used note type
		await this.props.onNoteTypeSelected(noteType);

		// Generate and insert flashcard content
		const content = this.generateFlashcardContent(noteType);
		this.insertFlashcardContent(content);
	}

	private insertFlashcardContent(content: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			activeView.editor.replaceSelection(content);
		}
	}

	private generateFlashcardContent(noteTypeName: string): string {
		const noteType = this.props.availableNoteTypes.find(nt => nt.name === noteTypeName);
		const fields = noteType?.fields || [];
		const fieldLines = fields.map(field => `${field}: `).join('\n');
		return `\`\`\`flashcard\nNoteType: ${noteTypeName}\n${fieldLines}\n\`\`\``;
	}
}
