import {DiffPart, FieldDiff, FlashcardDiff, StringDiff, TagsDiff} from './html-flashcard-differ';
import {App} from 'obsidian';
import {FlashcardRenderer} from './flashcard-renderer';
import {ChangedFlashcard} from './sync-analysis';

export class FlashcardDiffRenderer {
	private app: App;
	private defaultDeck: string;

	constructor(app: App, defaultDeck: string) {
		this.app = app;
		this.defaultDeck = defaultDeck;
	}

	/**
	 * Renders a compact diff view using pre-computed data to avoid redundant work
	 */
	render(container: HTMLElement, changedFlashcard: ChangedFlashcard): void {
		this.renderChangesList(container, changedFlashcard.diff);
		this.renderCollapsiblePreview(container, changedFlashcard);
	}

	private renderChangesList(container: HTMLElement, diff: FlashcardDiff): void {
		const changesList = container.createEl('div', {cls: 'flashcard-changes-list'});

		if (diff.deck) {
			this.renderSimpleChange(changesList, 'Deck', diff.deck);
		}

		if (diff.tags) {
			this.renderTagChanges(changesList, diff.tags);
		}

		if (diff.fieldDiffs) {
			for (const [fieldName, fieldDiff] of diff.fieldDiffs) {
				this.renderFieldChange(changesList, fieldName, fieldDiff);
			}
		}

		if (diff.noteType) {
			this.renderSimpleChange(changesList, 'Note Type', diff.noteType);
		}

		if (diff.sourcePath) {
			this.renderSimpleChange(changesList, 'File', diff.sourcePath);
		}
	}

	private renderTagChanges(container: HTMLElement, tagsDiff: TagsDiff): void {
		const changeItem = container.createEl('div', {cls: 'flashcard-change-item'});
		changeItem.createEl('span', {cls: 'change-label', text: 'Tags'});

		const tagsList = changeItem.createEl('span');

		for (const tag of tagsDiff.added) {
			tagsList.createEl('span', {cls: 'tag-added', text: `+${tag}`});
			tagsList.appendText(' ');
		}

		for (const tag of tagsDiff.removed) {
			tagsList.createEl('span', {cls: 'tag-removed', text: `-${tag}`});
			tagsList.appendText(' ');
		}
	}

	private renderFieldChange(container: HTMLElement, fieldName: string, fieldDiff: FieldDiff): void {
		const changeItem = container.createEl('div', {cls: 'flashcard-change-item'});
		changeItem.createEl('span', {cls: 'change-label', text: fieldName});

		// Render diff inline
		const diffContainer = changeItem.createEl('span', {cls: 'field-diff-inline'});
		diffContainer.innerHTML = this.renderDiffAsHtml(fieldDiff.parts);
	}

	private renderSimpleChange(container: HTMLElement, label: string, diff: StringDiff) {
		const changeItem = container.createEl('div', {cls: 'flashcard-change-item'});
		changeItem.createEl('span', {cls: 'change-label', text: label});
		changeItem.createEl('span', {cls: 'change-old', text: diff.old});
		changeItem.createEl('span', {cls: 'change-arrow', text: ' → '});
		changeItem.createEl('span', {cls: 'change-new', text: diff.new});
	}

	private renderCollapsiblePreview(container: HTMLElement, changedFlashcard: ChangedFlashcard): void {
		const details = container.createEl('details', {cls: 'flashcard-diff-preview'});
		details.createEl('summary', {text: 'Show full preview'});

		details.addEventListener('toggle', () => {
			if (details.open && !details.hasAttribute('data-loaded')) {
				// Lazy load the full preview using pre-computed HTML flashcards
				this.renderFullPreviewFromData(details, changedFlashcard);
				details.setAttribute('data-loaded', 'true');
			}
		});
	}

	private renderFullPreviewFromData(container: HTMLElement, changedFlashcard: ChangedFlashcard): void {
		// Use vertical layout for full preview
		const diffContent = container.createEl('div', {cls: 'sync-diff-content-vertical'});

		// Anki version (old - red border)
		diffContent.createEl('h5', {text: 'Anki Version (Current)', cls: 'sync-diff-version-header'});
		const ankiContainer = diffContent.createEl('div', {cls: 'sync-diff-flashcard-container sync-diff-old'});

		// Obsidian version (new - green border)  
		diffContent.createEl('h5', {text: 'Obsidian Version (New)', cls: 'sync-diff-version-header'});
		const obsidianContainer = diffContent.createEl('div', {cls: 'sync-diff-flashcard-container sync-diff-new'});

		// Use pre-computed HTML flashcards to avoid redundant conversion
		const ankiRenderer = new FlashcardRenderer(ankiContainer, changedFlashcard.ankiHtmlFlashcard, this.defaultDeck, this.app);
		ankiRenderer.onload();

		const obsidianRenderer = new FlashcardRenderer(obsidianContainer, changedFlashcard.htmlFlashcard, this.defaultDeck, this.app);
		obsidianRenderer.onload();
	}

	/**
	 * Renders diff parts as HTML with highlighted changes
	 */
	private renderDiffAsHtml(diffParts: DiffPart[]): string {
		return diffParts.map(part => {
			if (part.added) {
				return `<span class="diff-added">${this.escapeHtml(part.value)}</span>`;
			} else if (part.removed) {
				return `<span class="diff-removed">${this.escapeHtml(part.value)}</span>`;
			} else {
				return this.escapeHtml(part.value);
			}
		}).join('');
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

}
