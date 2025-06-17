import { App, MarkdownView, SuggestModal } from 'obsidian';

export interface FlashcardInsertModalProps {
	availableNoteTypes: Record<string, string[]>;
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
		const noteTypes = Object.keys(this.props.availableNoteTypes);
		if (noteTypes.length === 0) {
			return ['Basic'];
		}

		// Sort by last used note type first, then by fuzzy match
		const lastUsed = this.props.lastUsedNoteType;
		return noteTypes.sort((a, b) => {
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

	renderSuggestion(noteType: string, el: HTMLElement) {
		const fields = this.props.availableNoteTypes[noteType] || [];
		el.createEl('div', { text: noteType });
		if (fields.length > 0) {
			el.createEl('small', { text: `Fields: ${fields.join(', ')}` });
		}
	}

	async onChooseSuggestion(noteType: string, evt: MouseEvent | KeyboardEvent) {
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

	private generateFlashcardContent(noteType: string): string {
		const fields = this.props.availableNoteTypes[noteType] || [];
		const fieldLines = fields.map(field => `${field.toLowerCase()}: `).join('\n');
		return `\`\`\`flashcard\nnote_type: ${noteType}\n${fieldLines}\n\`\`\``;
	}
}
