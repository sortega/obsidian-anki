import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { Flashcard, HtmlFlashcard, InvalidFlashcard, BlockFlashcardParser, NoteType } from './flashcard';
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

		// Add warning styling if warnings exist
		if (this.htmlFlashcard.warnings.length > 0) {
			containerEl.addClass('flashcard-warning');
		}

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

		// Add warnings indicator if warnings exist
		if (this.htmlFlashcard.warnings.length > 0) {
			const warningContainer = header.createEl('span', { 
				cls: 'flashcard-warning-container'
			});
			
			const warningIcon = warningContainer.createEl('span', { 
				cls: 'flashcard-warning-icon',
				text: 'ⓘ'
			});
			
			const warningTitle = warningContainer.createEl('span', { 
				cls: 'flashcard-warning-title',
				text: 'Warnings'
			});
			
			// Create hover popup for warnings
			this.setupHoverPopup(warningContainer, this.htmlFlashcard.warnings.join('\n'), 'warning');
		}

		// Content area
		const content = containerEl.createEl('div', { cls: 'flashcard-content' });

		// Render non-empty HTML fields
		for (const [fieldName, htmlContent] of Object.entries(this.htmlFlashcard.htmlFields)) {
			if (!htmlContent.trim()) {
				continue;
			}

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

	private setupHoverPopup(triggerElement: HTMLElement, message: string, type: 'warning' | 'error') {
		let popup: HTMLElement | null = null;
		let hideTimeout: NodeJS.Timeout | null = null;

		const showPopup = () => {
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			if (popup) return; // Already showing

			popup = document.body.createEl('div', {
				cls: `flashcard-popup flashcard-popup-${type}`,
				text: message
			});

			// Position the popup relative to the trigger element
			const rect = triggerElement.getBoundingClientRect();
			popup.style.position = 'fixed';
			popup.style.left = `${rect.left}px`;
			popup.style.top = `${rect.bottom + 5}px`;
			popup.style.zIndex = '1000';
		};

		const hidePopup = () => {
			if (popup) {
				popup.remove();
				popup = null;
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		};

		const scheduleHide = () => {
			hideTimeout = setTimeout(hidePopup, 500); // 500ms delay
		};

		// Show popup on hover
		triggerElement.addEventListener('mouseenter', showPopup);
		
		// Hide popup when leaving trigger (with delay)
		triggerElement.addEventListener('mouseleave', scheduleHide);

		// Cancel hide if re-entering trigger quickly
		triggerElement.addEventListener('mouseenter', () => {
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		});

		// Clean up popup when component is unloaded
		this.register(() => hidePopup());
	}
}

export class FlashcardCodeBlockProcessor {
	static render(
		vaultName: string,
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		availableNoteTypes?: NoteType[]
	) {
		// Parse flashcard with line positions - we don't have exact line positions here, so use 0
		const flashcard = BlockFlashcardParser.parseFlashcard(source, ctx.sourcePath, 0, 0, availableNoteTypes);
		
		if ('error' in flashcard) {
			// If parsing fails, show error UI with original code block
			el.addClass('flashcard-error');
			
			// Error header with info icon
			const errorHeader = el.createEl('div', { cls: 'flashcard-error-header' });
			const errorContainer = errorHeader.createEl('span', { 
				cls: 'flashcard-error-container'
			});
			
			const errorIcon = errorContainer.createEl('span', { 
				cls: 'flashcard-error-icon',
				text: 'ⓘ'
			});
			
			const errorTitle = errorContainer.createEl('span', { 
				cls: 'flashcard-error-title',
				text: 'Invalid Flashcard'
			});
			
			// Create hover popup for error
			FlashcardCodeBlockProcessor.setupHoverPopup(errorContainer, flashcard.error || 'Unknown parsing error', 'error');
			
			// Original code block content
			const codeEl = el.createEl('pre', { cls: 'flashcard-error-content' });
			const code = codeEl.createEl('code');
			code.textContent = source;
			code.className = 'language-yaml';
		} else {
			// Valid flashcard - convert to HTML and render it
			const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard, vaultName);
			const renderer = new FlashcardRenderer(el, htmlFlashcard);
			ctx.addChild(renderer);
		}
	}

	static setupHoverPopup(triggerElement: HTMLElement, message: string, type: 'warning' | 'error') {
		let popup: HTMLElement | null = null;
		let hideTimeout: NodeJS.Timeout | null = null;

		const showPopup = () => {
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			if (popup) return; // Already showing

			popup = document.body.createEl('div', {
				cls: `flashcard-popup flashcard-popup-${type}`,
				text: message
			});

			// Position the popup relative to the trigger element
			const rect = triggerElement.getBoundingClientRect();
			popup.style.position = 'fixed';
			popup.style.left = `${rect.left}px`;
			popup.style.top = `${rect.bottom + 5}px`;
			popup.style.zIndex = '1000';
		};

		const hidePopup = () => {
			if (popup) {
				popup.remove();
				popup = null;
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		};

		const scheduleHide = () => {
			hideTimeout = setTimeout(hidePopup, 300); // 300ms delay
		};

		// Show popup on hover
		triggerElement.addEventListener('mouseenter', showPopup);
		
		// Hide popup when leaving trigger (with delay)
		triggerElement.addEventListener('mouseleave', scheduleHide);

		// Cancel hide if re-entering trigger quickly
		triggerElement.addEventListener('mouseenter', () => {
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		});

		// Clean up on page unload
		window.addEventListener('beforeunload', hidePopup);
	}
}
