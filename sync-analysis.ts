import {App, CachedMetadata, MarkdownView, Modal, Notice, TFile} from 'obsidian';
import {AnkiNote, AnkiService, MediaItem} from './anki-service';
import {BlockFlashcardParser, Flashcard, FlashcardBlock, HtmlFlashcard, InvalidFlashcard, NoteType} from './flashcard';
import {MarkdownService} from './markdown-service';
import {FlashcardRenderer} from './flashcard-renderer';
import {SyncExecutionModal} from './sync-execution';
import {NoteMetadata, parseNoteMetadata} from './note-metadata';

export interface SyncAnalysis {
	totalFiles: number;
	scannedFiles: number;
	newFlashcards: Flashcard[];
	changedFlashcards: [AnkiNote, Flashcard][];
	unchangedFlashcards: number;
	invalidFlashcards: InvalidFlashcard[];
	deletedAnkiNotes: AnkiNote[];
	ankiNotes: Map<number, AnkiNote>;
	discoveredMediaPaths: Set<string>;
	mediaItems: MediaItem[];
	unsyncedMediaItems: MediaItem[];
}

export class SyncProgressModal extends Modal {
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;
	private analysis: SyncAnalysis;
	private onComplete: (analysis: SyncAnalysis) => void;
	private ankiService: AnkiService;
	private vaultName: string;
	private availableNoteTypes: NoteType[];
	private settings: { defaultDeck: string };

	constructor(app: App, ankiService: AnkiService, availableNoteTypes: NoteType[], settings: { defaultDeck: string }, onComplete: (analysis: SyncAnalysis) => void) {
		super(app);
		this.onComplete = onComplete;
		this.ankiService = ankiService;
		this.availableNoteTypes = availableNoteTypes;
		this.settings = settings;
		this.vaultName = app.vault.getName();
		this.analysis = {
			totalFiles: 0,
			scannedFiles: 0,
			newFlashcards: [],
			changedFlashcards: [],
			unchangedFlashcards: 0,
			invalidFlashcards: [],
			deletedAnkiNotes: [],
			ankiNotes: new Map(),
			discoveredMediaPaths: new Set(),
			mediaItems: [],
			unsyncedMediaItems: [],
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', { text: 'Scanning Vault for Flashcards' });

		// Progress section
		const progressSection = contentEl.createEl('div', { cls: 'sync-progress-section' });
		
		// Progress text
		this.progressText = progressSection.createEl('div', { 
			cls: 'sync-progress-text',
			text: 'Initializing...'
		});

		// Progress bar container
		const progressContainer = progressSection.createEl('div', { cls: 'sync-progress-container' });
		this.progressBar = progressContainer.createEl('div', { cls: 'sync-progress-bar' });

		// Status text
		this.statusText = progressSection.createEl('div', { 
			cls: 'sync-status-text',
			text: 'Preparing to scan vault...'
		});

		// Start scanning
		this.startScanning();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async startScanning() {
		try {
			// First, search Anki for existing notes
			const ankiNoteIds = await this.searchAnki();
			
			// Then scan vault and categorize in one go
			await this.scanVaultAndCategorize(ankiNoteIds);
			
			// Finally, load media content for discovered media files
			await this.loadMediaContent();
			
			this.onComplete(this.analysis);
			this.close();
		} catch (error) {
			console.error('Vault scanning failed:', error);
			new Notice('Failed to scan vault for flashcards');
			this.close();
		}
	}

	private async searchAnki(): Promise<number[]> {
		try {
			this.updateProgress(0.1, 'Searching Anki for managed notes...');
			
			const ankiNoteIds = await this.ankiService.getManagedNoteIds(this.vaultName);
			
			this.updateProgress(0.2, `Found ${ankiNoteIds.length} managed notes in Anki`);
			return ankiNoteIds;
			
		} catch (error) {
			console.warn('Failed to search Anki:', error);
			this.updateProgress(0.2, 'Anki search failed - treating all as new');
			return [];
		}
	}

	private async scanVaultAndCategorize(ankiNoteIds: number[]) {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		this.analysis.totalFiles = markdownFiles.length;

		// Track which Anki notes we've seen and unique media paths
		const seenAnkiIds = new Set<number>();

		// Fetch Anki note data for comparison (fetch in batch for performance)
		this.updateProgress(0.25, 'Fetching Anki note data for comparison...');
		this.analysis.ankiNotes = await this.fetchAnkiNotes(ankiNoteIds);

		for (let i = 0; i < markdownFiles.length; i++) {
			const file = markdownFiles[i];
			const progressPercent = 0.3 + (0.5 * i / markdownFiles.length); // 30% to 80%
			this.updateProgress(progressPercent, `Processing: ${file.path}`);

			try {
				// Use MetadataCache to get pre-parsed sections
				const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
				const flashcards = await this.extractFlashcardsFromCache(cache, file);

				// Process and categorize each flashcard
				for (const flashcard of flashcards) {
					// Invalid flashcard
					if ('error' in flashcard) {
						this.analysis.invalidFlashcards.push(flashcard);
						continue;
					}

					// Convert flashcard to HTML version for comparison
					const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard, this.vaultName);

					// Extract media paths from valid flashcards
					const mediaPaths = this.extractMediaPaths(htmlFlashcard);
					mediaPaths.forEach(path => this.analysis.discoveredMediaPaths.add(path));

					// Valid flashcard - categorize based on ankiId and content comparison
					const ankiId = flashcard.ankiId;

					// No ankiId or card was deleted from Anki - treat as new
					if (!ankiId || !ankiNoteIds.includes(ankiId)) {
						this.analysis.newFlashcards.push(flashcard);
						continue;
					}

					// Compare with Anki data to determine if changed
					const ankiNote = this.analysis.ankiNotes.get(ankiId);
					if (ankiNote) {
						const ankiHtmlFlashcard = this.ankiService.toHtmlFlashcard(ankiNote);
						if (this.compareHtmlFlashcards(htmlFlashcard, ankiHtmlFlashcard)) {
							this.analysis.unchangedFlashcards++;
						} else {
							this.analysis.changedFlashcards.push([ankiNote, flashcard]);
						}
					}
					seenAnkiIds.add(ankiId);
				}
			} catch (error) {
				console.warn(`Failed to read file ${file.path}:`, error);
			}

			this.analysis.scannedFiles = i + 1;

			// Small delay to allow UI updates (less frequent since we're faster now)
			if (i % 10 === 0) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
		}

		// Find deleted notes (exist in Anki but not in vault)
		this.updateProgress(0.85, 'Identifying deleted notes...');
		for (const ankiId of ankiNoteIds) {
			if (!seenAnkiIds.has(ankiId)) {
				const ankiNote = this.analysis.ankiNotes.get(ankiId);
				if (ankiNote) {
					this.analysis.deletedAnkiNotes.push(ankiNote);
				}
			}
		}

		this.updateProgress(0.9, 'Flashcard analysis complete!');
	}

	private async extractFlashcardsFromCache(cache: CachedMetadata | null, file: TFile): Promise<(Flashcard | InvalidFlashcard)[]> {
		const flashcards: (Flashcard | InvalidFlashcard)[] = [];
		
		// If no cache, skip this file
		if (!cache) {
			return flashcards;
		}
		
		// Extract note metadata from front-matter
		const noteMetadata: NoteMetadata = parseNoteMetadata(cache.frontmatter);
		
		// Get code blocks from sections (cache.blocks is for different purpose)
		// Use sections which contains code blocks with type information
		const codeBlocks = cache.sections?.filter(section => section.type === 'code') ?? [];
		
		if (codeBlocks.length === 0) {
			return flashcards; // No code blocks, skip file entirely
		}
		
		// Read file content only when needed
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');
		
		// Process each code block using cached position data
		for (const block of codeBlocks) {
			// Handle both blocks and sections structure
			const position = block.position;
			const startLine = position.start.line;
			const endLine = position.end.line;
			
			// Check if this is a flashcard block
			if (startLine >= lines.length || lines[startLine].trim() !== '```flashcard') {
				continue;
			}

			// Extract content between the code block markers
			let blockContent = '';
			for (let i = startLine + 1; i < endLine && i < lines.length; i++) {
				if (lines[i].trim() === '```') {
					break; // End of code block
				}
				blockContent += lines[i] + '\n';
			}
			blockContent = blockContent.trim();
			
			// Parse the flashcard with line range information
			const flashcard = BlockFlashcardParser.parseFlashcard(
				blockContent, 
				file.path, 
				startLine + 1, // 1-indexed for user display
				endLine + 1,
				this.settings.defaultDeck,
				noteMetadata,
				this.availableNoteTypes
			);
			
			// No need to validate invalid flashcards
			if ('error' in flashcard) {
				flashcards.push(flashcard);
				continue;
			}

			// Validate flashcard if it parsed successfully
			const validationError = this.validateFlashcard(flashcard);
			if (validationError) {
				// Convert to invalid flashcard
				const invalidFlashcard: InvalidFlashcard = {
					sourcePath: flashcard.sourcePath,
					lineStart: flashcard.lineStart,
					lineEnd: flashcard.lineEnd,
					error: validationError
				};
				flashcards.push(invalidFlashcard);
			} else {
				flashcards.push(flashcard);
			}
		}
		
		return flashcards;
	}

	private async fetchAnkiNotes(ankiNoteIds: number[]): Promise<Map<number, AnkiNote>> {
		const ankiNotes = new Map<number, AnkiNote>();

		if (ankiNoteIds.length === 0) {
			return ankiNotes;
		}
		
		try {
			// Fetch note info from Anki (batch operation for performance)
			const notes = await this.ankiService.getNotes(ankiNoteIds);
			
			for (const note of notes) {
				if (note && note.noteId) {
					ankiNotes.set(note.noteId, note);
				}
			}
			
			console.log(`Fetched ${ankiNotes.size} Anki notes for comparison`);
		} catch (error) {
			console.warn('Failed to fetch Anki note:', error);
		}
		
		return ankiNotes;
	}
	
	private compareHtmlFlashcards(flashcard1: HtmlFlashcard, flashcard2: HtmlFlashcard): boolean {
		try {
			// Get all field names from both flashcards
			const allFieldNames = new Set([
				...Object.keys(flashcard1.htmlFields),
				...Object.keys(flashcard2.htmlFields)
			]);
			
			// Check all fields (catch missing fields in either flashcard)
			for (const fieldName of allFieldNames) {
				const doc1 = flashcard1.htmlFields[fieldName];
				const doc2 = flashcard2.htmlFields[fieldName];
				const html1 = doc1 ? doc1.body.innerHTML : '';
				const html2 = doc2 ? doc2.body.innerHTML : '';
				
				// Direct HTML comparison
				if (html1 !== html2) {
					console.log(`Field mismatch in ${fieldName}:`, {
						flashcard1: html1,
						flashcard2: html2
					});
					return false;
				}
			}
			
			// Compare tags as sets, ignoring order and ignored tags
			const tags1 = new Set(this.ankiService.filterIgnoredTags(flashcard1.tags));
			const tags2 = new Set(this.ankiService.filterIgnoredTags(flashcard2.tags));
			
			// Check if sets are equal (same tags, ignore order)
			if (tags1.size !== tags2.size) {
				console.log('Tags mismatch (different count):', {
					flashcard1: Array.from(tags1),
					flashcard2: Array.from(tags2)
				});
				return false;
			}
			
			for (const tag of tags1) {
				if (!tags2.has(tag)) {
					console.log('Tags mismatch (missing tag):', {
						flashcard1: Array.from(tags1),
						flashcard2: Array.from(tags2),
						missingTag: tag
					});
					return false;
				}
			}
			
			// Compare deck names
			if (flashcard1.deck !== flashcard2.deck) {
				console.log('Deck mismatch:', {
					flashcard1: flashcard1.deck,
					flashcard2: flashcard2.deck
				});
				return false;
			}
			
			// If we reach here, all fields, tags, and deck match
			return true;
			
		} catch (error) {
			console.warn('Error comparing HtmlFlashcards:', error);
			// If comparison fails, assume it's changed to be safe
			return false;
		}
	}


	private validateFlashcard(flashcard: Flashcard): string | null {
		// Check if note type exists in available note types
		const noteType = this.availableNoteTypes.find(nt => nt.name === flashcard.noteType);
		if (!noteType) {
			return `Unknown note type: '${flashcard.noteType}'. Available note types: ${this.availableNoteTypes.map(nt => nt.name).join(', ')}`;
		}
		
		// Check if all flashcard fields exist in the note type
		const availableFields = noteType.fields;
		const flashcardFields = Object.keys(flashcard.contentFields);
		
		for (const fieldName of flashcardFields) {
			if (!availableFields.includes(fieldName)) {
				return `Unknown field '${fieldName}' for note type '${flashcard.noteType}'. Available fields: ${availableFields.join(', ')}`;
			}
		}
		
		// Check if note type has required fields and we have content for at least one
		if (flashcardFields.length === 0) {
			return `No content fields found. Note type '${flashcard.noteType}' has fields: ${availableFields.join(', ')}`;
		}
		
		return null; // Valid flashcard
	}

	private updateProgress(progress: number, statusText: string) {
		const percentage = Math.round(progress * 100);
		this.progressBar.style.width = `${percentage}%`;
		this.progressText.setText(`${percentage}% complete`);
		this.statusText.setText(statusText);
	}

	private extractMediaPaths(flashcard: HtmlFlashcard): string[] {
		const mediaPaths: string[] = [];
		
		// Check all content fields for media references
		for (const [_fieldName, doc] of Object.entries(flashcard.htmlFields)) {
			try {
				const images = doc.querySelectorAll('img');
				
				images.forEach(img => {
					const src = img.getAttribute('src');
					if (src && this.isInternalLink(src) && this.isMediaFile(src)) {
						mediaPaths.push(src);
					}
				});
			} catch (error) {
				console.warn(`Failed to extract media paths from ${_fieldName}'s HTML contents:`, error);
			}
		}
		
		return mediaPaths;
	}

	private isMediaFile(path: string): boolean {
		const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', 
								'.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.webm', '.ogv'];
		const lowercasePath = path.toLowerCase();
		return mediaExtensions.some(ext => lowercasePath.endsWith(ext));
	}

	private isInternalLink(src: string): boolean {
		// Filter out data URLs
		if (src.startsWith('data:')) {
			return false;
		}

		// Filter out external URLs (http://, https://, ftp://, etc.)
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) {
			return false;
		}

		// Filter out absolute paths that might not be in the vault
		// Accept relative paths and paths that look like vault-internal paths
		return !src.startsWith("/");
	}

	private async loadMediaContent() {
		if (this.analysis.discoveredMediaPaths.size === 0) {
			this.updateProgress(1, 'Analysis complete!');
			return;
		}

		const pathsArray = Array.from(this.analysis.discoveredMediaPaths);
		this.updateProgress(0.92, `Loading ${pathsArray.length} media files...`);

		for (let i = 0; i < pathsArray.length; i++) {
			const mediaPath = pathsArray[i];
			const progressPercent = 0.92 + (0.08 * i / pathsArray.length); // 92% to 100%
			this.updateProgress(progressPercent, `Loading media: ${mediaPath}`);

			try {
				const file = this.app.vault.getAbstractFileByPath(mediaPath);
				if (file && file instanceof TFile) {
					const arrayBuffer = await this.app.vault.readBinary(file);

					const mediaItem: MediaItem = {
						sourcePath: mediaPath,
						contents: new Uint8Array(arrayBuffer)
					};
					this.analysis.mediaItems.push(mediaItem);
					if (!await this.ankiService.hasMediaFile(mediaItem)) {
						this.analysis.unsyncedMediaItems.push(mediaItem);
					}
				} else {
					console.warn(`Media file not found: ${mediaPath}`);
				}
			} catch (error) {
				console.warn(`Failed to load media file ${mediaPath}:`, error);
			}

			// Small delay for UI updates
			if (i % 5 === 0) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
		}

		this.updateProgress(1, 'Analysis complete!');
	}
	
}

export class SyncConfirmationModal extends Modal {
	private analysis: SyncAnalysis;
	private ankiService: AnkiService;
	private settings: { defaultDeck: string };
	private vaultName: string;
	private orphanedCardAction: 'delete' | 'import' = 'delete';

	constructor(app: App, analysis: SyncAnalysis, ankiService: AnkiService, settings: { defaultDeck: string }) {
		super(app);
		this.analysis = analysis;
		this.ankiService = ankiService;
		this.settings = settings;
		this.vaultName = app.vault.getName();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', { text: 'Sync Confirmation' });

		// Summary section
		const summarySection = contentEl.createEl('div', { cls: 'sync-summary-section' });
		
		// Summary statistics
		const statsContainer = summarySection.createEl('div', { cls: 'sync-stats' });
		
		statsContainer.createEl('div', { 
			cls: 'sync-stat-item',
			text: `📁 Files scanned: ${this.analysis.scannedFiles}`
		});
		
		// Create expandable statistics sections directly in the stats container
		if (this.analysis.newFlashcards.length > 0) {
			this.createExpandableStatSection(statsContainer, '➕ New', this.analysis.newFlashcards.length, 'cards will be created', 'sync-stat-new', () => {
				return this.createNewFlashcardsContent();
			});
		}
		
		if (this.analysis.changedFlashcards.length > 0) {
			this.createExpandableStatSection(statsContainer, '📝 Changed', this.analysis.changedFlashcards.length, 'cards will be updated', 'sync-stat-changed', () => {
				return this.createChangedFlashcardsContent();
			});
		}
		
		if (this.analysis.invalidFlashcards.length > 0) {
			this.createExpandableStatSection(statsContainer, '❌ Invalid', this.analysis.invalidFlashcards.length, 'cards have errors', 'sync-stat-invalid', () => {
				return this.createInvalidFlashcardsContent();
			});
		}
		
		if (this.analysis.deletedAnkiNotes.length > 0) {
			this.createOrphanedCardsSection(statsContainer);
		}
		
		if (this.analysis.unsyncedMediaItems.length > 0) {
			this.createExpandableStatSection(statsContainer, '📁 Media', this.analysis.unsyncedMediaItems.length, 'files will be synced', 'sync-stat-media', () => {
				return this.createMediaChangesContent();
			});
		}
		
		if (this.analysis.unchangedFlashcards > 0) {
			this.createExpandableStatSection(statsContainer, '✅ Unchanged', this.analysis.unchangedFlashcards, 'cards are up to date', 'sync-stat-unchanged', () => {
				return this.createUnchangedFlashcardsContent();
			});
		}

		// Log detailed analysis to console
		this.logAnalysisToConsole();

		// Action buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'sync-button-container' });
		
		// Check if there are any changes to apply
		const hasChanges = this.analysis.newFlashcards.length > 0 || 
			this.analysis.changedFlashcards.length > 0 || 
			this.analysis.deletedAnkiNotes.length > 0 ||
			this.analysis.unsyncedMediaItems.length > 0;
		
		if (hasChanges) {
			// Show Cancel and Apply Changes buttons when there are changes
			const cancelButton = buttonContainer.createEl('button', { 
				text: 'Cancel',
				cls: 'mod-cta sync-button-cancel'
			});
			cancelButton.onclick = () => this.close();
			
			const applyButton = buttonContainer.createEl('button', { 
				text: 'Apply Changes',
				cls: 'mod-cta sync-button-apply'
			});
			applyButton.onclick = () => this.applyChanges();
		} else {
			// Show only Close button when there are no changes
			const closeButton = buttonContainer.createEl('button', { 
				text: 'Close',
				cls: 'mod-cta sync-button-close'
			});
			closeButton.onclick = () => this.close();
		}

		// Show message if no flashcards found
		const totalFlashcards = this.analysis.newFlashcards.length + this.analysis.changedFlashcards.length + 
			this.analysis.unchangedFlashcards + this.analysis.invalidFlashcards.length;
		if (totalFlashcards === 0) {
			summarySection.createEl('p', { 
				cls: 'sync-no-flashcards',
				text: 'No flashcard blocks found in your vault.'
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createExpandableStatSection(container: HTMLElement, label: string, count: number, description: string, cssClass: string, contentCreator: () => HTMLElement) {
		const details = container.createEl('details', { cls: `sync-stat-item ${cssClass} sync-expandable-stat` });
		const summary = details.createEl('summary', { cls: 'sync-expandable-stat-summary' });
		
		summary.createEl('span', { 
			cls: 'sync-stat-label',
			text: `  ${label}: ${count}`
		});
		
		// Lazy load content when expanded
		details.addEventListener('toggle', () => {
			if (details.open && !details.querySelector('.sync-expandable-content')) {
				const content = details.createEl('div', { cls: 'sync-expandable-content' });
				const sectionContent = contentCreator();
				content.appendChild(sectionContent);
			}
		});
	}


	private createOrphanedCardsSection(container: HTMLElement) {
		const details = container.createEl('details', { cls: 'sync-stat-item sync-stat-deleted sync-expandable-stat' });
		const summary = details.createEl('summary', { cls: 'sync-expandable-stat-summary' });
		
		// Create a flex container for the label and dropdown
		const summaryContent = summary.createEl('div', { cls: 'sync-orphaned-summary-content' });
		
		summaryContent.createEl('span', { 
			cls: 'sync-stat-label',
			text: `📋 Orphaned: ${this.analysis.deletedAnkiNotes.length}`
		});
		
		// Add dropdown for action selection
		const actionContainer = summaryContent.createEl('div', { cls: 'sync-orphaned-action-container' });
		actionContainer.createEl('span', { text: ' → ' });
		
		const dropdown = actionContainer.createEl('select', { cls: 'sync-orphaned-action-dropdown' });
		dropdown.createEl('option', { value: 'delete', text: 'Delete from Anki' });
		dropdown.createEl('option', { value: 'import', text: 'Import into Obsidian' });
		
		dropdown.value = this.orphanedCardAction;
		dropdown.addEventListener('change', (e) => {
			this.orphanedCardAction = (e.target as HTMLSelectElement).value as 'delete' | 'import';
			this.updateOrphanedActionDescription();
		});
		
		// Lazy load content when expanded
		details.addEventListener('toggle', () => {
			if (details.open && !details.querySelector('.sync-expandable-content')) {
				const content = details.createEl('div', { cls: 'sync-expandable-content' });
				const sectionContent = this.createDeletedNotesContent();
				content.appendChild(sectionContent);
			}
		});
		
		// Store reference for updating description
		(details as any)._actionContainer = actionContainer;
	}
	
	private updateOrphanedActionDescription() {
		// This will be called when dropdown changes - for now just update text if needed
		// The description update could be implemented if we want dynamic text changes
	}

	private logAnalysisToConsole() {
		console.group('🔄 Anki Sync Analysis');
		console.log('📊 Summary:', {
			totalFiles: this.analysis.totalFiles,
			scannedFiles: this.analysis.scannedFiles,
			newFlashcards: this.analysis.newFlashcards.length,
			changedFlashcards: this.analysis.changedFlashcards.length,
			unchangedFlashcards: this.analysis.unchangedFlashcards,
			invalidFlashcards: this.analysis.invalidFlashcards.length,
			deletedAnkiNotes: this.analysis.deletedAnkiNotes.length,
			unsyncedMediaItems: this.analysis.unsyncedMediaItems.length
		});

		if (this.analysis.newFlashcards.length > 0) {
			console.group('➕ New Flashcards');
			this.analysis.newFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					noteType: flashcard.noteType,
					tags: flashcard.tags,
					ankiId: flashcard.ankiId || 'none',
					fields: Object.keys(flashcard.contentFields || {}),
					data: flashcard
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.changedFlashcards.length > 0) {
			console.group('📝 Changed Flashcards');
			this.analysis.changedFlashcards.forEach(([ankiNote, flashcard], index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					noteType: flashcard.noteType,
					tags: flashcard.tags,
					ankiId: flashcard.ankiId,
					fields: Object.keys(flashcard.contentFields || {}),
					obsidianData: flashcard,
					ankiData: ankiNote
				});
			});
			console.groupEnd();
		}
		
		// Unchanged flashcards is now just a count, no detailed logging needed
		
		if (this.analysis.deletedAnkiNotes.length > 0) {
			console.group('🗑️ Deleted Anki Notes');
			this.analysis.deletedAnkiNotes.forEach((ankiNote, index) => {
				console.log(`${index + 1}. Anki Note ID: ${ankiNote.noteId}`, {
					noteType: ankiNote.modelName,
					tags: ankiNote.tags,
					htmlFields: Object.keys(ankiNote.htmlFields),
					status: 'exists in Anki but not in vault',
					action: 'will be deleted from Anki',
					data: ankiNote
				});
			});
			console.groupEnd();
		}

		if (this.analysis.invalidFlashcards.length > 0) {
			console.group('❌ Invalid Flashcards');
			this.analysis.invalidFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					error: flashcard.error
				});
			});
			console.groupEnd();
		}

		if (this.analysis.unsyncedMediaItems.length > 0) {
			console.group('📁 Media Files');
			this.analysis.unsyncedMediaItems.forEach((mediaItem, index) => {
				console.log(`${index + 1}. ${mediaItem.sourcePath}`, {
					sizeKB: Math.round(mediaItem.contents.length * 0.75 / 1024),
					base64Length: mediaItem.contents.length
				});
			});
			console.groupEnd();
		}

		console.groupEnd();
	}

	private async applyChanges() {
		console.log('🚀 Apply Changes clicked - starting sync to Anki');
		
		// Show sync execution modal with orphaned card action
		const syncExecutionModal = new SyncExecutionModal(this.app, this.analysis, this.ankiService, this.vaultName, this.orphanedCardAction);
		
		this.close();
		syncExecutionModal.open();
	}

	private createNewFlashcardsContent(): HTMLElement {
		const content = document.createElement('div');
		
		for (const flashcard of this.analysis.newFlashcards.slice(0, 5)) {
			const item = this.createFlashcardItem(content, 'sync-flashcard-new');
			this.addFileReference(item, flashcard);
			
			this.renderFlashcard(item, flashcard);
		}
		
		this.addMoreItemsIndicator(content, this.analysis.newFlashcards.length, 5);
		return content;
	}

	private createChangedFlashcardsContent(): HTMLElement {
		const content = document.createElement('div');
		
		for (const [ankiNote, flashcard] of this.analysis.changedFlashcards.slice(0, 3)) {
			const item = this.createFlashcardItem(content, 'sync-flashcard-changed');
			this.addFileReference(item, flashcard);
			
			this.renderFlashcardDiff(item, flashcard, ankiNote);
		}
		
		this.addMoreItemsIndicator(content, this.analysis.changedFlashcards.length, 3);
		return content;
	}

	private createInvalidFlashcardsContent(): HTMLElement {
		const content = document.createElement('div');
		
		for (const flashcard of this.analysis.invalidFlashcards.slice(0, 5)) {
			const item = this.createFlashcardItem(content, 'sync-flashcard-invalid');
			this.addFileReference(item, flashcard);
			
			// Show error
			const error = item.createEl('div', { cls: 'sync-flashcard-error' });
			error.createEl('span', { 
				cls: 'sync-error-icon',
				text: '⚠️'
			});
			error.createEl('span', { 
				text: flashcard.error || 'Unknown error'
			});
		}
		
		this.addMoreItemsIndicator(content, this.analysis.invalidFlashcards.length, 5);
		return content;
	}

	private createDeletedNotesContent(): HTMLElement {
		const content = document.createElement('div');
		
		for (const ankiNote of this.analysis.deletedAnkiNotes.slice(0, 5)) {
			const item = this.createFlashcardItem(content, 'sync-flashcard-deleted');
			const ankiAsHtmlFlashcard = this.ankiService.toHtmlFlashcard(ankiNote);
			
			// Show source path and Anki ID
			const idRef = item.createEl('div', { cls: 'sync-flashcard-file-ref' });
			
			if (ankiAsHtmlFlashcard.sourcePath) {
				const fileLink = idRef.createEl('a', { 
					cls: 'sync-flashcard-file sync-flashcard-file-link',
					text: ankiAsHtmlFlashcard.sourcePath,
					href: '#'
				});
				fileLink.addEventListener('click', (e) => {
					e.preventDefault();
					this.app.workspace.openLinkText(ankiAsHtmlFlashcard.sourcePath, '', false);
				});
				idRef.createEl('span', { 
					cls: 'sync-flashcard-anki-id',
					text: ` (Anki ID: ${ankiNote.noteId})`
				});
			} else {
				idRef.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `Anki Note ID: ${ankiNote.noteId}`
				});
			}
			
			// Render the deleted flashcard using FlashcardRenderer directly
			const flashcardContainer = item.createEl('div');
			const renderer = new FlashcardRenderer(flashcardContainer, ankiAsHtmlFlashcard, this.settings.defaultDeck, this.app);
			renderer.onload();
		}
		
		this.addMoreItemsIndicator(content, this.analysis.deletedAnkiNotes.length, 5);
		return content;
	}

	private createMediaChangesContent(): HTMLElement {
		const content = document.createElement('div');
		
		for (const mediaItem of this.analysis.unsyncedMediaItems.slice(0, 10)) {
			const item = this.createFlashcardItem(content, 'sync-flashcard-media');
			
			// Create clickable file link
			const fileRef = item.createEl('div', { cls: 'sync-flashcard-file-ref' });
			const fileLink = fileRef.createEl('a', { 
				cls: 'sync-media-file-link',
				text: mediaItem.sourcePath,
				href: '#'
			});
			
			fileLink.addEventListener('click', (e) => {
				e.preventDefault();
				// Navigate to the media file and close modal
				const file = this.app.vault.getAbstractFileByPath(mediaItem.sourcePath);
				if (file) {
					// For media files, we'll try to open them or navigate to their location
					this.app.workspace.openLinkText(mediaItem.sourcePath, '', false);
				}
				this.close();
			});
			
			// Show file size info
			const fileSize = Math.round(mediaItem.contents.length * 0.75 / 1024); // Rough base64 to KB conversion
			const sizeInfo = item.createEl('div', { 
				cls: 'sync-media-info',
				text: `${fileSize} KB`
			});
		}
		
		this.addMoreItemsIndicator(content, this.analysis.unsyncedMediaItems.length, 10);
		return content;
	}

	private createUnchangedFlashcardsContent(): HTMLElement {
		const content = document.createElement('div');
		
		const summary = content.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-unchanged' });
		summary.createEl('div', { 
			cls: 'sync-flashcard-info',
			text: `${this.analysis.unchangedFlashcards} flashcards are unchanged and will not be synced.`
		});
		
		return content;
	}


	private createFlashcardItem(section: HTMLElement, extraClass: string): HTMLElement {
		return section.createEl('div', { cls: `sync-flashcard-item ${extraClass}` });
	}

	private addFileReference(item: HTMLElement, flashcard: FlashcardBlock) {
		const fileRef = item.createEl('div', { cls: 'sync-flashcard-file-ref' });
		this.createFileReference(fileRef, flashcard);
	}

	private addMoreItemsIndicator(section: HTMLElement, totalCount: number, displayCount: number) {
		if (totalCount > displayCount) {
			section.createEl('div', { 
				cls: 'sync-more-items',
				text: `... and ${totalCount - displayCount} more`
			});
		}
	}

	private createFileReference(container: HTMLElement, flashcard: FlashcardBlock) {
		const fileLink = container.createEl('a', { 
			cls: 'sync-file-link',
			text: `${flashcard.sourcePath}:${flashcard.lineStart}`
		});
		
		fileLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.navigateToFile(flashcard.sourcePath, flashcard.lineStart);
		});
	}

	private navigateToFile(filePath: string, lineNumber: number) {
		// Use Obsidian's workspace to open the file at specific line
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file) {
			this.app.workspace.openLinkText(filePath, '', true).then(() => {
				// Try to navigate to the specific line
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					const editor = activeView.editor;
					// Convert to 0-based line number for editor
					const targetLine = Math.max(0, lineNumber - 1);
					editor.setCursor(targetLine, 0);
					editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
				}
			});
		}
		
		// Close the modal after navigation
		this.close();
	}

	private renderFlashcard(container: HTMLElement, flashcard: Flashcard) {
		const flashcardContainer = container.createEl('div');
		const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard, this.vaultName);
		const renderer = new FlashcardRenderer(flashcardContainer, htmlFlashcard, this.settings.defaultDeck, this.app);
		renderer.onload()
	}

	private renderFlashcardDiff(container: HTMLElement, obsidian: Flashcard, ankiNote: AnkiNote) {
		const diffContainer = container.createEl('div', { cls: 'sync-diff-container' });
		
		// Header
		const header = diffContainer.createEl('div', { cls: 'sync-diff-header' });
		header.createEl('span', { 
			cls: 'sync-diff-title',
			text: `${obsidian.noteType} (ID: ${obsidian.ankiId})`
		});
		
		// Side-by-side diff
		const diffContent = diffContainer.createEl('div', { cls: 'sync-diff-content' });
		
		// Anki version (old - red border)
		const ankiSide = diffContent.createEl('div', { cls: 'sync-diff-side sync-diff-anki' });
		ankiSide.createEl('h5', { text: 'Anki Version (Current)' });
		const ankiContainer = ankiSide.createEl('div', { cls: 'sync-diff-flashcard-container sync-diff-old' });
		
		// Obsidian version (new - green border)  
		const obsidianSide = diffContent.createEl('div', { cls: 'sync-diff-side sync-diff-obsidian' });
		obsidianSide.createEl('h5', { text: 'Obsidian Version (New)' });
		const obsidianContainer = obsidianSide.createEl('div', { cls: 'sync-diff-flashcard-container sync-diff-new' });
		
		// Convert Anki note to HtmlFlashcard format (already HTML)
		const ankiAsHtmlFlashcard = this.ankiService.toHtmlFlashcard(ankiNote);
		
		// Convert Obsidian flashcard to HTML format
		const obsidianAsHtmlFlashcard = MarkdownService.toHtmlFlashcard(obsidian, this.vaultName);
		
		// Render both versions using the existing FlashcardRenderer
		const ankiRenderer = new FlashcardRenderer(ankiContainer, ankiAsHtmlFlashcard, this.settings.defaultDeck, this.app);
		ankiRenderer.onload();
		
		const obsidianRenderer = new FlashcardRenderer(obsidianContainer, obsidianAsHtmlFlashcard, this.settings.defaultDeck, this.app);
		obsidianRenderer.onload();
	}
}
