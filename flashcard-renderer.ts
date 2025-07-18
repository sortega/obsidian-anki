import { MarkdownRenderChild, MarkdownPostProcessorContext, App } from 'obsidian';
import { Flashcard, HtmlFlashcard, InvalidFlashcard, BlockFlashcardParser, NoteType, NoteMetadata } from './flashcard';
import { MarkdownService } from './markdown-service';
import { ANKI_DECK_PROPERTY, ANKI_TAGS_PROPERTY } from './constants';

export class FlashcardRenderer extends MarkdownRenderChild {
	private htmlFlashcard: HtmlFlashcard;
	private defaultDeck: string;

	constructor(containerEl: HTMLElement, htmlFlashcard: HtmlFlashcard, defaultDeck: string) {
		super(containerEl);
		this.htmlFlashcard = htmlFlashcard;
		this.defaultDeck = defaultDeck;
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

		// Footer with tags and deck
		const visibleTags = this.htmlFlashcard.tags.filter((tag: string) => !tag.startsWith('obsidian-'));
		if (visibleTags.length > 0 || this.htmlFlashcard.deck !== this.defaultDeck) {
			const footer = containerEl.createEl('div', { cls: 'flashcard-footer' });
			
			// Left side: tags
			const tagsContainer = footer.createEl('div', { cls: 'flashcard-tags-container' });
			if (visibleTags.length > 0) {
				const tagsLabel = tagsContainer.createEl('span', { 
					text: 'Tags: ',
					cls: 'flashcard-tags-label'
				});
				const tagsContent = tagsContainer.createEl('span', { 
					text: visibleTags.join(', '),
					cls: 'flashcard-tags-content'
				});
			}
			
			// Right side: deck
			if (this.htmlFlashcard.deck !== this.defaultDeck) {
				const deckContainer = footer.createEl('div', { cls: 'flashcard-deck-container' });
				const deckLabel = deckContainer.createEl('span', { 
					text: 'Deck: ',
					cls: 'flashcard-deck-label'
				});
				const deckContent = deckContainer.createEl('span', { 
					text: this.htmlFlashcard.deck,
					cls: 'flashcard-deck-content'
				});
			}
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
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	render(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		defaultDeck: string,
		availableNoteTypes?: NoteType[]
	) {
		// Extract note metadata from the current file's front-matter
		const noteMetadata = this.extractNoteMetadataFromContext(ctx);
		
		// Parse flashcard with line positions - we don't have exact line positions here, so use 0
		const flashcard = BlockFlashcardParser.parseFlashcard(source, ctx.sourcePath, 0, 0, defaultDeck, noteMetadata, availableNoteTypes);
		
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
			this.setupHoverPopup(errorContainer, flashcard.error || 'Unknown parsing error', 'error');
			
			// Original code block content
			const codeEl = el.createEl('pre', { cls: 'flashcard-error-content' });
			const code = codeEl.createEl('code');
			code.textContent = source;
			code.className = 'language-yaml';
		} else {
			// Valid flashcard - convert to HTML and render it
			const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard, this.app.vault.getName());
			const renderer = new FlashcardRenderer(el, htmlFlashcard, defaultDeck);
			ctx.addChild(renderer);
		}
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
	
	private extractNoteMetadataFromContext(ctx: MarkdownPostProcessorContext): NoteMetadata {
		// Try to access the front-matter through the section info
		// In live preview mode, we need to get the file and extract front-matter
		if (!ctx.sourcePath) {
			return {};
		}
		
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!file || !('stat' in file)) {
			return {};
		}
		
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return {};
		}
		
		const metadata: NoteMetadata = {};

		// Extract AnkiDeck
		if (ANKI_DECK_PROPERTY in cache.frontmatter && typeof cache.frontmatter[ANKI_DECK_PROPERTY] === 'string') {
			metadata[ANKI_DECK_PROPERTY] = cache.frontmatter[ANKI_DECK_PROPERTY];
		}
		
		// Extract AnkiTags
		if (ANKI_TAGS_PROPERTY in cache.frontmatter && Array.isArray(cache.frontmatter[ANKI_TAGS_PROPERTY])) {
			const tags = cache.frontmatter[ANKI_TAGS_PROPERTY].filter((tag: any) => typeof tag === 'string');
			if (tags.length > 0) {
				metadata[ANKI_TAGS_PROPERTY] = tags;
			}
		}
		
		return metadata;
	}
}
