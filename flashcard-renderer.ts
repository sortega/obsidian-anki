import { MarkdownRenderChild, MarkdownRenderer } from 'obsidian';
import { FlashcardData, FlashcardParseResult, BlockFlashcardParser, METADATA_FIELDS } from './flashcard';

export class FlashcardRenderer extends MarkdownRenderChild {
	private flashcardData: FlashcardData;
	private sourcePath: string;

	constructor(containerEl: HTMLElement, flashcardData: FlashcardData, sourcePath: string) {
		super(containerEl);
		this.flashcardData = flashcardData;
		this.sourcePath = sourcePath;
	}

	onload() {
		this.render();
	}

	private render() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('flashcard-container');

		// Header with note type
		const header = containerEl.createEl('div', { cls: 'flashcard-header' });
		const noteType = this.flashcardData.note_type || 'Basic';
		header.createEl('span', { 
			text: `Note Type: ${noteType}`,
			cls: 'flashcard-note-type'
		});

		// Content area
		const content = containerEl.createEl('div', { cls: 'flashcard-content' });

		// Render all fields except metadata
		for (const [fieldName, fieldValue] of Object.entries(this.flashcardData)) {
			if (METADATA_FIELDS.includes(fieldName) || fieldValue == null) {
				continue;
			}

			const fieldContainer = content.createEl('div', { cls: 'flashcard-field' });
			
			// Field label
			const label = fieldContainer.createEl('div', { 
				cls: 'flashcard-field-label',
				text: `${this.capitalizeFirst(fieldName)}:`
			});

			// Field content
			const fieldContentEl = fieldContainer.createEl('div', { cls: 'flashcard-field-content' });
			
			// Render markdown content
			const fieldText = typeof fieldValue === 'string' ? fieldValue : String(fieldValue);
			MarkdownRenderer.renderMarkdown(fieldText, fieldContentEl, this.sourcePath, this);
		}

		// Footer with tags if present
		if (this.flashcardData.tags && this.flashcardData.tags.length > 0) {
			const footer = containerEl.createEl('div', { cls: 'flashcard-footer' });
			const tagsLabel = footer.createEl('span', { 
				text: 'Tags: ',
				cls: 'flashcard-tags-label'
			});
			const tagsText = Array.isArray(this.flashcardData.tags) 
				? this.flashcardData.tags.join(', ')
				: this.flashcardData.tags;
			const tagsContent = footer.createEl('span', { 
				text: tagsText,
				cls: 'flashcard-tags-content'
			});
		}
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
}

export class FlashcardProcessor {
	static render(source: string, el: HTMLElement, sourcePath: string, ctx: any) {
		const parseResult = BlockFlashcardParser.parseFlashcard(source);
		
		if (parseResult.data) {
			const renderer = new FlashcardRenderer(el, parseResult.data, sourcePath);
			ctx.addChild(renderer);
		} else {
			// If parsing fails, show error UI with original code block
			el.addClass('flashcard-error');
			
			// Error header with info icon
			const errorHeader = el.createEl('div', { cls: 'flashcard-error-header' });
			const errorIcon = errorHeader.createEl('span', { 
				cls: 'flashcard-error-icon',
				text: 'ⓘ'
			});
			errorIcon.setAttribute('title', parseResult.error || 'Unknown parsing error');
			
			const errorTitle = errorHeader.createEl('span', { 
				cls: 'flashcard-error-title',
				text: 'Invalid Flashcard'
			});
			
			// Original code block content
			const codeEl = el.createEl('pre', { cls: 'flashcard-error-content' });
			const code = codeEl.createEl('code');
			code.textContent = source;
			code.className = 'language-yaml';
		}
	}
}