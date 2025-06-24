import { App, Modal, Notice, CachedMetadata, TFile, MarkdownView } from 'obsidian';
import { AnkiService, AnkiNote, AnkiDataConverter } from './anki-service';
import { FlashcardData, BlockFlashcardParser, FlashcardFieldRenderer } from './flashcard';
import { FlashcardRenderer } from 'flashcard-renderer';

export interface FlashcardBlock {
	sourcePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	data?: FlashcardData;
	error?: string;
}

export interface SyncAnalysis {
	totalFiles: number;
	scannedFiles: number;
	flashcardBlocks: FlashcardBlock[];
	newFlashcards: FlashcardBlock[];
	changedFlashcards: FlashcardBlock[];
	unchangedFlashcards: FlashcardBlock[];
	invalidFlashcards: FlashcardBlock[];
	deletedAnkiNotes: number[];
	ankiNotesData: Map<number, AnkiNote>;
}

export class SyncProgressModal extends Modal {
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;
	private analysis: SyncAnalysis;
	private onComplete: (analysis: SyncAnalysis) => void;
	private ankiService: AnkiService;
	private vaultName: string;

	constructor(app: App, ankiService: AnkiService, onComplete: (analysis: SyncAnalysis) => void) {
		super(app);
		this.onComplete = onComplete;
		this.ankiService = ankiService;
		this.vaultName = app.vault.getName();
		this.analysis = {
			totalFiles: 0,
			scannedFiles: 0,
			flashcardBlocks: [],
			newFlashcards: [],
			changedFlashcards: [],
			unchangedFlashcards: [],
			invalidFlashcards: [],
			deletedAnkiNotes: [],
			ankiNotesData: new Map()
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

		// Track which Anki notes we've seen
		const seenAnkiIds = new Set<number>();
		
		// Fetch Anki note data for comparison (batch fetch for performance)
		this.updateProgress(0.25, 'Fetching Anki note data for comparison...');
		this.analysis.ankiNotesData = await this.fetchAnkiNoteData(ankiNoteIds);

		for (let i = 0; i < markdownFiles.length; i++) {
			const file = markdownFiles[i];
			const progressPercent = 0.3 + (0.6 * i / markdownFiles.length); // 30% to 90%
			this.updateProgress(progressPercent, `Processing: ${file.path}`);

			try {
				// Use MetadataCache to get pre-parsed sections
				const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
				const blocks = await this.extractFlashcardBlocksFromCache(cache, file);
				this.analysis.flashcardBlocks.push(...blocks);

				// Process and categorize each block
				for (const block of blocks) {
					const parseResult = BlockFlashcardParser.parseFlashcard(block.content, file.path);
					if (parseResult.data) {
						block.data = parseResult.data;
						
						// Categorize based on anki_id and content comparison
						const ankiId = block.data.ankiId;
						if (ankiId) {
							// Flashcard has anki_id - check if it exists in Anki
							if (ankiNoteIds.includes(ankiId)) {
								// Compare with Anki data to determine if changed
								const ankiNoteData = this.analysis.ankiNotesData.get(ankiId);
								if (ankiNoteData && this.compareFlashcardWithAnki(block.data, ankiNoteData)) {
									this.analysis.unchangedFlashcards.push(block);
								} else {
									this.analysis.changedFlashcards.push(block);
								}
								seenAnkiIds.add(ankiId);
							} else {
								// Card was deleted from Anki, treat as new
								this.analysis.newFlashcards.push(block);
							}
						} else {
							// No anki_id - this is a new flashcard
							this.analysis.newFlashcards.push(block);
						}
					} else {
						block.error = parseResult.error;
						this.analysis.invalidFlashcards.push(block);
					}
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
		this.updateProgress(0.95, 'Identifying deleted notes...');
		for (const ankiId of ankiNoteIds) {
			if (!seenAnkiIds.has(ankiId)) {
				this.analysis.deletedAnkiNotes.push(ankiId);
			}
		}

		this.updateProgress(1, 'Analysis complete!');
	}

	private async extractFlashcardBlocksFromCache(cache: CachedMetadata | null, file: TFile): Promise<FlashcardBlock[]> {
		const blocks: FlashcardBlock[] = [];
		
		// If no cache, skip this file
		if (!cache) {
			return blocks;
		}
		
		// Get code blocks from sections (cache.blocks is for different purpose)
		// Use sections which contains code blocks with type information
		const codeBlocks = cache.sections?.filter(section => section.type === 'code') ?? [];
		
		if (codeBlocks.length === 0) {
			return blocks; // No code blocks, skip file entirely
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
			if (startLine < lines.length && lines[startLine].trim() === '```flashcard') {
				// Extract content between the code block markers
				let blockContent = '';
				for (let i = startLine + 1; i < endLine && i < lines.length; i++) {
					if (lines[i].trim() === '```') {
						break; // End of code block
					}
					blockContent += lines[i] + '\n';
				}
				
				if (blockContent.trim()) {
					blocks.push({
						sourcePath: file.path,
						lineStart: startLine + 1, // 1-indexed for user display
						lineEnd: endLine + 1,
						content: blockContent.trim()
					});
				}
			}
		}
		
		return blocks;
	}

	private async fetchAnkiNoteData(ankiNoteIds: number[]): Promise<Map<number, AnkiNote>> {
		const ankiNotesData = new Map<number, AnkiNote>();
		
		if (ankiNoteIds.length === 0) {
			return ankiNotesData;
		}
		
		try {
			// Fetch note info from Anki (batch operation for performance)
			const notesInfo = await this.ankiService.getNotes(ankiNoteIds);
			
			for (const noteInfo of notesInfo) {
				if (noteInfo && noteInfo.noteId) {
					ankiNotesData.set(noteInfo.noteId, noteInfo);
				}
			}
			
			console.log(`Fetched ${ankiNotesData.size} Anki notes for comparison`);
		} catch (error) {
			console.warn('Failed to fetch Anki note data:', error);
		}
		
		return ankiNotesData;
	}
	
	private compareFlashcardWithAnki(flashcardData: FlashcardData, ankiNoteData: AnkiNote): boolean {
		try {
			// Compare rendered fields
			const flashcardFields = FlashcardFieldRenderer.renderFlashcardFields(flashcardData);
			const ankiFields = ankiNoteData.fields || {};
			
			// Check if all flashcard fields match Anki fields
			for (const [fieldName, fieldValue] of Object.entries(flashcardFields)) {
				const ankiFieldValue = ankiFields[fieldName]?.value || '';
				// Remove HTML tags and normalize whitespace for comparison
				const normalizedAnkiValue = ankiFieldValue.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
				
				if (fieldValue !== normalizedAnkiValue) {
					console.log(`Field mismatch in ${fieldName}:`, {
						obsidian: fieldValue,
						anki: normalizedAnkiValue
					});
					return false;
				}
			}
			
			// Compare tags
			const flashcardTagsText = FlashcardFieldRenderer.renderTagsToText(flashcardData.tags);
			const ankiTagsText = FlashcardFieldRenderer.renderTagsToText(ankiNoteData.tags);
			
			if (flashcardTagsText !== ankiTagsText) {
				console.log('Tags mismatch:', {
					obsidian: flashcardTagsText,
					anki: ankiTagsText
				});
				return false;
			}
			
			// If we reach here, all fields and tags match
			return true;
			
		} catch (error) {
			console.warn('Error comparing flashcard with Anki note:', error);
			// If comparison fails, assume it's changed to be safe
			return false;
		}
	}

	private updateProgress(progress: number, statusText: string) {
		const percentage = Math.round(progress * 100);
		this.progressBar.style.width = `${percentage}%`;
		this.progressText.setText(`${percentage}% complete`);
		this.statusText.setText(statusText);
	}
}

export class SyncConfirmationModal extends Modal {
	private analysis: SyncAnalysis;

	constructor(app: App, analysis: SyncAnalysis) {
		super(app);
		this.analysis = analysis;
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
		
		// Create flashcard category section
		const flashcardHeader = statsContainer.createEl('div', { 
			cls: 'sync-stat-item',
			text: `📇 Flashcards:`
		});
		flashcardHeader.style.fontWeight = '600';
		flashcardHeader.style.marginTop = '10px';
		
		if (this.analysis.newFlashcards.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-new',
				text: `  ➕ New: ${this.analysis.newFlashcards.length}`
			});
		}
		
		if (this.analysis.changedFlashcards.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-changed',
				text: `  📝 Changed: ${this.analysis.changedFlashcards.length}`
			});
		}
		
		if (this.analysis.unchangedFlashcards.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-unchanged',
				text: `  ✅ Unchanged: ${this.analysis.unchangedFlashcards.length}`
			});
		}
		
		if (this.analysis.invalidFlashcards.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-invalid',
				text: `  ❌ Invalid: ${this.analysis.invalidFlashcards.length}`
			});
		}
		
		if (this.analysis.deletedAnkiNotes.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-deleted',
				text: `  🗑️ Deleted: ${this.analysis.deletedAnkiNotes.length}`
			});
		}

		// Log detailed analysis to console
		this.logAnalysisToConsole();

		// Action buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'sync-button-container' });
		
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

		// Show details section if there are any flashcards
		if (this.analysis.flashcardBlocks.length > 0) {
			this.createDetailsSection(summarySection);
		} else {
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

	private createDetailsSection(container: HTMLElement) {
		const detailsSection = container.createEl('details', { cls: 'sync-details' });
		const summary = detailsSection.createEl('summary', { text: 'View Details' });
		
		const detailsContent = detailsSection.createEl('div', { cls: 'sync-details-content' });
		
		// New flashcards
		if (this.analysis.newFlashcards.length > 0) {
			this.createNewFlashcardsSection(detailsContent);
		}
		
		// Changed flashcards
		if (this.analysis.changedFlashcards.length > 0) {
			this.createChangedFlashcardsSection(detailsContent);
		}
		
		// Unchanged flashcards
		if (this.analysis.unchangedFlashcards.length > 0) {
			this.createUnchangedFlashcardsSection(detailsContent);
		}
		
		// Deleted Anki notes
		if (this.analysis.deletedAnkiNotes.length > 0) {
			this.createDeletedNotesSection(detailsContent);
		}
		
		// Invalid flashcards
		if (this.analysis.invalidFlashcards.length > 0) {
			this.createInvalidFlashcardsSection(detailsContent);
		}
	}

	private logAnalysisToConsole() {
		console.group('🔄 Anki Sync Analysis');
		console.log('📊 Summary:', {
			totalFiles: this.analysis.totalFiles,
			scannedFiles: this.analysis.scannedFiles,
			totalBlocks: this.analysis.flashcardBlocks.length,
			newFlashcards: this.analysis.newFlashcards.length,
			changedFlashcards: this.analysis.changedFlashcards.length,
			unchangedFlashcards: this.analysis.unchangedFlashcards.length,
			invalidFlashcards: this.analysis.invalidFlashcards.length,
			deletedAnkiNotes: this.analysis.deletedAnkiNotes.length
		});

		if (this.analysis.newFlashcards.length > 0) {
			console.group('➕ New Flashcards');
			this.analysis.newFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.noteType,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.ankiId || 'none',
					fields: Object.keys(flashcard.data?.contentFields || {}),
					data: flashcard.data
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.changedFlashcards.length > 0) {
			console.group('📝 Changed Flashcards');
			this.analysis.changedFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.noteType,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.ankiId,
					fields: Object.keys(flashcard.data?.contentFields || {}),
					data: flashcard.data
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.unchangedFlashcards.length > 0) {
			console.group('✅ Unchanged Flashcards');
			this.analysis.unchangedFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.noteType,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.ankiId,
					fields: Object.keys(flashcard.data?.contentFields || {}),
					data: flashcard.data
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.deletedAnkiNotes.length > 0) {
			console.group('🗑️ Deleted Anki Notes');
			this.analysis.deletedAnkiNotes.forEach((ankiId, index) => {
				console.log(`${index + 1}. Anki Note ID: ${ankiId}`, {
					status: 'exists in Anki but not in vault',
					action: 'will be deleted from Anki'
				});
			});
			console.groupEnd();
		}

		if (this.analysis.invalidFlashcards.length > 0) {
			console.group('❌ Invalid Flashcards');
			this.analysis.invalidFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.sourcePath}:${flashcard.lineStart}`, {
					error: flashcard.error,
					content: flashcard.content
				});
			});
			console.groupEnd();
		}

		console.groupEnd();
	}

	private applyChanges() {
		console.log('🚀 Apply Changes clicked - would sync to Anki here');
		new Notice('Sync functionality not yet implemented - check console for analysis');
		this.close();
	}

	private createNewFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'New Flashcards');
		
		for (const flashcard of this.analysis.newFlashcards.slice(0, 3)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-new');
			this.addFileReference(item, flashcard);
			
			if (flashcard.data) {
				this.renderFlashcard(item, flashcard.data);
			}
		}
		
		this.addMoreItemsIndicator(section, this.analysis.newFlashcards.length, 3);
	}

	private createChangedFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'Changed Flashcards');
		
		for (const flashcard of this.analysis.changedFlashcards.slice(0, 3)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-changed');
			this.addFileReference(item, flashcard);
			
			if (flashcard.data && flashcard.data.ankiId) {
				const ankiNote = this.analysis.ankiNotesData.get(flashcard.data.ankiId);
				if (ankiNote) {
					this.renderFlashcardDiff(item, flashcard.data, ankiNote);
				}
			}
		}
		
		this.addMoreItemsIndicator(section, this.analysis.changedFlashcards.length, 3);
	}

	private createUnchangedFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'Unchanged Flashcards');
		
		for (const flashcard of this.analysis.unchangedFlashcards.slice(0, 2)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-unchanged');
			this.addFileReference(item, flashcard);
			
			// Show basic info
			const info = item.createEl('div', { cls: 'sync-flashcard-info' });
			info.createEl('span', { 
				cls: 'sync-flashcard-type',
				text: `${flashcard.data?.noteType || 'Basic'} • ${Object.keys(flashcard.data?.contentFields || {}).length} fields`
			});
		}
		
		this.addMoreItemsIndicator(section, this.analysis.unchangedFlashcards.length, 2);
	}

	private createDeletedNotesSection(container: HTMLElement) {
		const section = this.createSection(container, 'Deleted from Anki');
		
		for (const ankiId of this.analysis.deletedAnkiNotes.slice(0, 5)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-deleted');
			
			// Show Anki ID instead of file reference
			const idRef = item.createEl('div', { cls: 'sync-flashcard-file-ref' });
			idRef.createEl('span', { 
				cls: 'sync-flashcard-file',
				text: `Anki Note ID: ${ankiId}`
			});
			
			// Render the deleted flashcard if we have the data
			const ankiNote = this.analysis.ankiNotesData.get(ankiId);
			if (ankiNote) {
				const ankiAsFlashcard = AnkiDataConverter.toFlashcardData(ankiNote, ankiNote.modelName);
				this.renderFlashcard(item, ankiAsFlashcard);
			} else {
				item.createEl('span', { 
					cls: 'sync-flashcard-error',
					text: 'Will be deleted from Anki'
				});
			}
		}
		
		this.addMoreItemsIndicator(section, this.analysis.deletedAnkiNotes.length, 5);
	}

	private createInvalidFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'Invalid Flashcards');
		
		for (const flashcard of this.analysis.invalidFlashcards.slice(0, 3)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-invalid');
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
		
		this.addMoreItemsIndicator(section, this.analysis.invalidFlashcards.length, 3);
	}

	private createSection(container: HTMLElement, title: string): HTMLElement {
		const section = container.createEl('div', { cls: 'sync-section' });
		section.createEl('h4', { text: title });
		return section;
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

	private renderFlashcardContent(container: HTMLElement, flashcardData: FlashcardData) {
		const content = container.createEl('div', { cls: 'sync-flashcard-content' });
		
		// Note type
		const header = content.createEl('div', { cls: 'sync-flashcard-header' });
		header.createEl('span', { 
			cls: 'sync-note-type',
			text: flashcardData.noteType
		});
		
		// Fields
		const fields = content.createEl('div', { cls: 'sync-flashcard-fields' });
		for (const [fieldName, fieldValue] of Object.entries(flashcardData.contentFields)) {
			const field = fields.createEl('div', { cls: 'sync-field' });
			field.createEl('span', { 
				cls: 'sync-field-name',
				text: `${fieldName}:`
			});
			field.createEl('span', { 
				cls: 'sync-field-value',
				text: fieldValue.length > 100 ? fieldValue.substring(0, 100) + '...' : fieldValue
			});
		}
		
		// Tags
		if (flashcardData.tags.length > 0) {
			const tags = content.createEl('div', { cls: 'sync-flashcard-tags' });
			tags.createEl('span', { 
				cls: 'sync-tags-label',
				text: 'Tags:'
			});
			tags.createEl('span', { 
				cls: 'sync-tags-value',
				text: flashcardData.tags.join(', ')
			});
		}
	}

	private renderFlashcard(container: HTMLElement, flashcardData: FlashcardData) {
		const flashcardContainer = container.createEl('div');
		const renderer = new FlashcardRenderer(flashcardContainer, flashcardData);
		renderer.onload()
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private renderFlashcardDiff(container: HTMLElement, obsidianData: FlashcardData, ankiNote: AnkiNote) {
		const diffContainer = container.createEl('div', { cls: 'sync-diff-container' });
		
		// Header
		const header = diffContainer.createEl('div', { cls: 'sync-diff-header' });
		header.createEl('span', { 
			cls: 'sync-diff-title',
			text: `${obsidianData.noteType} (ID: ${obsidianData.ankiId})`
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
		
		// Convert Anki note to FlashcardData format
		const ankiAsFlashcard = AnkiDataConverter.toFlashcardData(ankiNote, obsidianData.noteType);
		
		// Render both versions using the existing FlashcardRenderer
		const ankiRenderer = new FlashcardRenderer(ankiContainer, ankiAsFlashcard);
		ankiRenderer.onload();
		
		const obsidianRenderer = new FlashcardRenderer(obsidianContainer, obsidianData);
		obsidianRenderer.onload();
	}
}
