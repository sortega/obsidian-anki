import {App, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView} from 'obsidian';
import {BlockFlashcardParser, HtmlFlashcard, NoteType} from './flashcard';
import {MarkdownService} from './markdown-service';
import {parseNoteMetadata} from './note-metadata';
import {ClozeHighlighter} from './cloze-highlighting';

export class FlashcardRenderer extends MarkdownRenderChild {
	private readonly htmlFlashcard: HtmlFlashcard;
	private app: App;
	private readonly defaultDeck: string;

	constructor(containerEl: HTMLElement, htmlFlashcard: HtmlFlashcard, defaultDeck: string, app: App) {
		super(containerEl);
		this.htmlFlashcard = htmlFlashcard;
		this.app = app;
		this.defaultDeck = defaultDeck;
	}

	onload() {
		this.render();
	}

	private render() {
		if (this.htmlFlashcard.noteType === 'Cloze') {
			this.renderCloze();
		} else {
			this.renderRegular();
		}
	}

	private renderRegular() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('flashcard-container');
		containerEl.addClass('flashcard-clickable');

		// Add click handler to navigate to source
		containerEl.addEventListener('click', () => {
			this.navigateToSource();
		});

		// Add warning styling if warnings exist
		if (this.htmlFlashcard.warnings.length > 0) {
			containerEl.addClass('flashcard-warning');
		}

		// Header with the note type
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
			this.addWarningsIndicator(header);
		}

		// Content area
		const content = containerEl.createEl('div', { cls: 'flashcard-content' });

		// Render non-empty HTML fields
		for (const [fieldName, doc] of Object.entries(this.htmlFlashcard.htmlFields)) {
			const htmlContent = doc.body.innerHTML;
			if (!htmlContent.trim()) {
				continue;
			}

			const fieldContainer = content.createEl('div', { cls: 'flashcard-field' });
			
			// Field label
			fieldContainer.createEl('div', {
				cls: 'flashcard-field-label',
				text: `${this.capitalizeFirst(fieldName)}:`
			});

			// Field content - use HTML directly with image src resolution
			const fieldContentEl = fieldContainer.createEl('div', { cls: 'flashcard-field-content' });
			fieldContentEl.innerHTML = this.resolveImageSources(doc);
		}

		// Footer with tags and deck
		this.addFooter(containerEl);
	}

	private renderCloze() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('cloze-container');
		containerEl.addClass('flashcard-clickable');

		// Add click handler to navigate to source
		containerEl.addEventListener('click', () => {
			this.navigateToSource();
		});

		// Add warning styling if warnings exist
		if (this.htmlFlashcard.warnings.length > 0) {
			containerEl.addClass('flashcard-warning');
		}

		// Content area - direct paragraph-like rendering without header
		const content = containerEl.createEl('div', { cls: 'cloze-content' });

		// For cloze cards, we expect a single "Text" field
		const textField = this.htmlFlashcard.htmlFields['Text'];
		if (textField) {
			const textEl = content.createEl('div', { cls: 'cloze-text' });
			textEl.innerHTML = this.highlightClozes(this.resolveImageSources(textField));
		}

		// Render Extra field if present
		const extraField = this.htmlFlashcard.htmlFields['Extra'];
		if (extraField && extraField.body.innerHTML.trim()) {
			const extraEl = content.createEl('div', { cls: 'cloze-extra' });
			extraEl.innerHTML = this.resolveImageSources(extraField);
		}

		// Add hover popup for metadata
		this.addClozeHoverPopup(containerEl);
	}

	private addWarningsIndicator(header: HTMLElement) {
		const warningContainer = header.createEl('span', { 
			cls: 'flashcard-warning-container'
		});
		
		warningContainer.createEl('span', {
			cls: 'flashcard-warning-icon',
			text: 'ⓘ'
		});
		
		warningContainer.createEl('span', {
			cls: 'flashcard-warning-title',
			text: 'Warnings'
		});
		
		// Create hover popup for warnings
		this.setupHoverPopup(warningContainer, this.htmlFlashcard.warnings.join('\n'), 'warning');
	}

	private addClozeHoverPopup(element: HTMLElement) {
		const popupInfo: string[] = [];
		
		// Add warnings if any
		if (this.htmlFlashcard.warnings.length > 0) {
			popupInfo.push(`⚠️ Warnings:\n${this.htmlFlashcard.warnings.join('\n')}`);
		}
		
		// Always show deck info
		popupInfo.push(`📚 Deck: ${this.htmlFlashcard.deck}`);
		
		// Add tags if any (excluding obsidian- tags)
		const visibleTags = this.htmlFlashcard.tags.filter((tag: string) => !tag.startsWith('obsidian-'));
		if (visibleTags.length > 0) {
			popupInfo.push(`🏷️ Tags: ${visibleTags.join(', ')}`);
		}
		
		// Add sync status
		if (!this.htmlFlashcard.ankiId) {
			popupInfo.push('🆕 Not yet synced to Anki');
		}
		
		const popupMessage = popupInfo.join('\n\n');
		this.setupHoverPopup(element, popupMessage, 'info');
	}


	private addFooter(containerEl: HTMLElement) {
		const visibleTags = this.htmlFlashcard.tags.filter((tag: string) => !tag.startsWith('obsidian-'));
		if (visibleTags.length > 0 || this.htmlFlashcard.deck !== this.defaultDeck) {
			const footer = containerEl.createEl('div', { cls: 'flashcard-footer' });
			
			// Left side: tags
			const tagsContainer = footer.createEl('div', { cls: 'flashcard-tags-container' });
			if (visibleTags.length > 0) {
				tagsContainer.createEl('span', {
					text: 'Tags: ',
					cls: 'flashcard-tags-label'
				});
				tagsContainer.createEl('span', {
					text: visibleTags.join(', '),
					cls: 'flashcard-tags-content'
				});
			}
			
			// Right side: deck
			if (this.htmlFlashcard.deck !== this.defaultDeck) {
				const deckContainer = footer.createEl('div', { cls: 'flashcard-deck-container' });
				deckContainer.createEl('span', {
					text: 'Deck: ',
					cls: 'flashcard-deck-label'
				});
				deckContainer.createEl('span', {
					text: this.htmlFlashcard.deck,
					cls: 'flashcard-deck-content'
				});
			}
		}
	}

	private highlightClozes(html: string): string {
		return ClozeHighlighter.highlightClozes(html);
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private resolveImageSources(doc: Document): string {
		try {
			// Clone the document to avoid modifying the original
			const clonedDoc = doc.cloneNode(true) as Document;
			const images = clonedDoc.querySelectorAll('img');
			
			images.forEach(img => {
				const src = img.getAttribute('src');
				if (src && this.isRelativePath(src)) {
					// Resolve relative path to absolute vault path
					const absolutePath = this.app.vault.adapter.getResourcePath(src);
					img.setAttribute('src', absolutePath);
				}
			});
			
			// Return the modified HTML
			return clonedDoc.body.innerHTML;
		} catch (error) {
			console.warn('Failed to resolve image sources:', error);
			// Return original content if parsing fails
			return doc.body.innerHTML;
		}
	}

	private isRelativePath(src: string): boolean {
		// Check if it's a relative path (not absolute URL or data URL)
		return !src.startsWith('http://') && 
			   !src.startsWith('https://') && 
			   !src.startsWith('data:') && 
			   !src.startsWith('file://') &&
			   !src.startsWith('/');
	}

	private setupHoverPopup(triggerElement: HTMLElement, message: string, type: 'warning' | 'error' | 'info') {
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

	private navigateToSource() {
		const { sourcePath, lineStart } = this.htmlFlashcard;
		
		// Open the file and navigate to the second line (first editable field)
		this.app.workspace.openLinkText(sourcePath, sourcePath).then(() => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				const editor = activeView.editor;
				editor.setCursor(lineStart + 1, 0);
			}
		});
	}
}

export class FlashcardCodeBlockProcessor {
	private readonly app: App;

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
		const noteMetadata = parseNoteMetadata(ctx.frontmatter);
		
		// Get actual line positions from section info
		const sectionInfo = ctx.getSectionInfo(el);
		const lineStart = sectionInfo?.lineStart ?? 0;
		const lineEnd = sectionInfo?.lineEnd ?? 0;
		
		// Parse flashcard with real line positions
		const flashcard = BlockFlashcardParser.parseFlashcard(source, ctx.sourcePath, lineStart, lineEnd, defaultDeck, noteMetadata, availableNoteTypes);
		
		if ('error' in flashcard) {
			// If parsing fails, show error UI with original code block
			el.addClass('flashcard-error');
			
			// Error header with info icon
			const errorHeader = el.createEl('div', { cls: 'flashcard-error-header' });
			const errorContainer = errorHeader.createEl('span', { 
				cls: 'flashcard-error-container'
			});
			
			errorContainer.createEl('span', {
				cls: 'flashcard-error-icon',
				text: 'ⓘ'
			});
			
			errorContainer.createEl('span', {
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
			const renderer = new FlashcardRenderer(el, htmlFlashcard, defaultDeck, this.app);
			ctx.addChild(renderer);
		}
	}

	private setupHoverPopup(triggerElement: HTMLElement, message: string, type: 'warning' | 'error' | 'info') {
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
