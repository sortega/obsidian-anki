import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { Flashcard, HtmlFlashcard, InvalidFlashcard, BlockFlashcardParser } from './flashcard';
import { MarkdownService } from './markdown-service';

export class FlashcardRenderer extends MarkdownRenderChild {
	private htmlFlashcard: HtmlFlashcard;

	constructor(containerEl: HTMLElement, htmlFlashcard: HtmlFlashcard) {
		super(containerEl);
		this.htmlFlashcard = htmlFlashcard;
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
		header.createEl('span', { 
			text: `Note Type: ${this.htmlFlashcard.noteType}`,
			cls: 'flashcard-note-type'
		});

		// Add NEW indicator if flashcard hasn't been synced yet
		if (!this.htmlFlashcard.ankiId) {
			header.createEl('span', { 
				text: 'NEW',
				cls: 'flashcard-new-indicator'
			});
		}

		// Content area
		const content = containerEl.createEl('div', { cls: 'flashcard-content' });

		// Render all HTML fields
		for (const [fieldName, htmlContent] of Object.entries(this.htmlFlashcard.htmlFields)) {
			const fieldContainer = content.createEl('div', { cls: 'flashcard-field' });
			
			// Field label
			const label = fieldContainer.createEl('div', { 
				cls: 'flashcard-field-label',
				text: `${this.capitalizeFirst(fieldName)}:`
			});

			// Field content - use HTML directly
			const fieldContentEl = fieldContainer.createEl('div', { cls: 'flashcard-field-content' });
			fieldContentEl.innerHTML = htmlContent;
		}

		// Footer with tags if present (filter out obsidian-* internal tags)
		const visibleTags = this.htmlFlashcard.tags.filter((tag: string) => !tag.startsWith('obsidian-'));
		if (visibleTags.length > 0) {
			const footer = containerEl.createEl('div', { cls: 'flashcard-footer' });
			const tagsLabel = footer.createEl('span', { 
				text: 'Tags: ',
				cls: 'flashcard-tags-label'
			});
			const tagsContent = footer.createEl('span', { 
				text: visibleTags.join(', '),
				cls: 'flashcard-tags-content'
			});
		}
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
}

export class FlashcardCodeBlockProcessor {
	static render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Parse flashcard with line positions - we don't have exact line positions here, so use 0
		const flashcard = BlockFlashcardParser.parseFlashcard(source, ctx.sourcePath, 0, 0);
		
		if ('error' in flashcard) {
			// If parsing fails, show error UI with original code block
			el.addClass('flashcard-error');
			
			// Error header with info icon
			const errorHeader = el.createEl('div', { cls: 'flashcard-error-header' });
			const errorIcon = errorHeader.createEl('span', { 
				cls: 'flashcard-error-icon',
				text: 'ⓘ'
			});
			
			const errorTitle = errorHeader.createEl('span', { 
				cls: 'flashcard-error-title',
				text: 'Invalid Flashcard'
			});
			
			// Create error message that appears inside the header on click
			const errorMessage = errorHeader.createEl('div', { 
				cls: 'flashcard-error-message',
				text: flashcard.error || 'Unknown parsing error'
			});
			
			errorIcon.addEventListener('click', () => {
				const isVisible = errorMessage.style.display !== 'none';
				errorMessage.style.display = isVisible ? 'none' : 'block';
			});
			
			// Original code block content
			const codeEl = el.createEl('pre', { cls: 'flashcard-error-content' });
			const code = codeEl.createEl('code');
			code.textContent = source;
			code.className = 'language-yaml';
		} else {
			// Valid flashcard - convert to HTML and render it
			const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard);
			const renderer = new FlashcardRenderer(el, htmlFlashcard);
			ctx.addChild(renderer);
		}
	}
}
