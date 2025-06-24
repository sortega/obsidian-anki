import { App, Modal, Notice, CachedMetadata, TFile, MarkdownView } from 'obsidian';
import { AnkiService, AnkiNote, AnkiDataConverter } from './anki-service';
import { Flashcard, InvalidFlashcard, FlashcardBlock, BlockFlashcardParser, FlashcardFieldRenderer } from './flashcard';
import { FlashcardRenderer } from 'flashcard-renderer';

export interface SyncAnalysis {
	totalFiles: number;
	scannedFiles: number;
	newFlashcards: Flashcard[];
	changedFlashcards: [AnkiNote, Flashcard][];
	unchangedFlashcards: number;
	invalidFlashcards: InvalidFlashcard[];
	deletedAnkiNotes: AnkiNote[];
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
			newFlashcards: [],
			changedFlashcards: [],
			unchangedFlashcards: 0,
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
				const flashcards = await this.extractFlashcardsFromCache(cache, file);

				// Process and categorize each flashcard
				for (const flashcard of flashcards) {
					if ('error' in flashcard) {
						// Invalid flashcard
						this.analysis.invalidFlashcards.push(flashcard);
					} else {
						// Valid flashcard - categorize based on anki_id and content comparison
						const ankiId = flashcard.ankiId;
						if (ankiId) {
							// Flashcard has anki_id - check if it exists in Anki
							if (ankiNoteIds.includes(ankiId)) {
								// Compare with Anki data to determine if changed
								const ankiNoteData = this.analysis.ankiNotesData.get(ankiId);
								if (ankiNoteData && this.compareFlashcardWithAnki(flashcard, ankiNoteData)) {
									this.analysis.unchangedFlashcards++;
								} else if (ankiNoteData) {
									this.analysis.changedFlashcards.push([ankiNoteData, flashcard]);
								}
								seenAnkiIds.add(ankiId);
							} else {
								// Card was deleted from Anki, treat as new
								this.analysis.newFlashcards.push(flashcard);
							}
						} else {
							// No anki_id - this is a new flashcard
							this.analysis.newFlashcards.push(flashcard);
						}
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
				const ankiNote = this.analysis.ankiNotesData.get(ankiId);
				if (ankiNote) {
					this.analysis.deletedAnkiNotes.push(ankiNote);
				}
			}
		}

		this.updateProgress(1, 'Analysis complete!');
	}

	private async extractFlashcardsFromCache(cache: CachedMetadata | null, file: TFile): Promise<(Flashcard | InvalidFlashcard)[]> {
		const flashcards: (Flashcard | InvalidFlashcard)[] = [];
		
		// If no cache, skip this file
		if (!cache) {
			return flashcards;
		}
		
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
					// Parse the flashcard with line range information
					const flashcard = BlockFlashcardParser.parseFlashcard(
						blockContent.trim(), 
						file.path, 
						startLine + 1, // 1-indexed for user display
						endLine + 1
					);
					flashcards.push(flashcard);
				}
			}
		}
		
		return flashcards;
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
	
	private compareFlashcardWithAnki(flashcard: Flashcard, ankiNoteData: AnkiNote): boolean {
		try {
			// Compare rendered fields
			const flashcardFields = FlashcardFieldRenderer.renderFlashcardFields(flashcard);
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
			const flashcardTagsText = FlashcardFieldRenderer.renderTagsToText(flashcard.tags);
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
		
		if (this.analysis.unchangedFlashcards > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-unchanged',
				text: `  ✅ Unchanged: ${this.analysis.unchangedFlashcards}`
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
		const totalFlashcards = this.analysis.newFlashcards.length + this.analysis.changedFlashcards.length + 
			this.analysis.unchangedFlashcards + this.analysis.invalidFlashcards.length;
		if (totalFlashcards > 0) {
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
		if (this.analysis.unchangedFlashcards > 0) {
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
			newFlashcards: this.analysis.newFlashcards.length,
			changedFlashcards: this.analysis.changedFlashcards.length,
			unchangedFlashcards: this.analysis.unchangedFlashcards,
			invalidFlashcards: this.analysis.invalidFlashcards.length,
			deletedAnkiNotes: this.analysis.deletedAnkiNotes.length
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
					fields: Object.keys(ankiNote.fields || {}),
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
			
			this.renderFlashcard(item, flashcard);
		}
		
		this.addMoreItemsIndicator(section, this.analysis.newFlashcards.length, 3);
	}

	private createChangedFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'Changed Flashcards');
		
		for (const [ankiNote, flashcard] of this.analysis.changedFlashcards.slice(0, 3)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-changed');
			this.addFileReference(item, flashcard);
			
			this.renderFlashcardDiff(item, flashcard, ankiNote);
		}
		
		this.addMoreItemsIndicator(section, this.analysis.changedFlashcards.length, 3);
	}

	private createUnchangedFlashcardsSection(container: HTMLElement) {
		const section = this.createSection(container, 'Unchanged Flashcards');
		
		// Since unchangedFlashcards is now just a count, show summary info only
		const summary = section.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-unchanged' });
		summary.createEl('div', { 
			cls: 'sync-flashcard-info',
			text: `${this.analysis.unchangedFlashcards} flashcards are unchanged and will not be synced.`
		});
	}

	private createDeletedNotesSection(container: HTMLElement) {
		const section = this.createSection(container, 'Deleted from Anki');
		
		for (const ankiNote of this.analysis.deletedAnkiNotes.slice(0, 5)) {
			const item = this.createFlashcardItem(section, 'sync-flashcard-deleted');
			
			// Show Anki ID instead of file reference
			const idRef = item.createEl('div', { cls: 'sync-flashcard-file-ref' });
			idRef.createEl('span', { 
				cls: 'sync-flashcard-file',
				text: `Anki Note ID: ${ankiNote.noteId}`
			});
			
			// Render the deleted flashcard
			const ankiAsFlashcard = AnkiDataConverter.toFlashcard(ankiNote, ankiNote.modelName);
			this.renderFlashcard(item, ankiAsFlashcard);
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

	private renderFlashcard(container: HTMLElement, flashcard: Flashcard) {
		const flashcardContainer = container.createEl('div');
		const renderer = new FlashcardRenderer(flashcardContainer, flashcard);
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
		
		// Convert Anki note to Flashcard format
		const ankiAsFlashcard = AnkiDataConverter.toFlashcard(ankiNote, obsidian.noteType);
		
		// Render both versions using the existing FlashcardRenderer
		const ankiRenderer = new FlashcardRenderer(ankiContainer, ankiAsFlashcard);
		ankiRenderer.onload();
		
		const obsidianRenderer = new FlashcardRenderer(obsidianContainer, obsidian);
		obsidianRenderer.onload();
	}
}