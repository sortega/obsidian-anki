import { App, Modal, Notice, CachedMetadata, TFile } from 'obsidian';
import { AnkiService, AnkiNote } from './anki-service';
import { FlashcardData, BlockFlashcardParser, FlashcardFieldRenderer } from './flashcard';

export interface FlashcardBlock {
	file: string;
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
			deletedAnkiNotes: []
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
		const ankiNotesData = await this.fetchAnkiNoteData(ankiNoteIds);

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
					const parseResult = BlockFlashcardParser.parseFlashcard(block.content);
					if (parseResult.data) {
						block.data = parseResult.data;
						
						// Categorize based on anki_id and content comparison
						const ankiId = block.data.anki_id;
						if (ankiId) {
							// Flashcard has anki_id - check if it exists in Anki
							const ankiIdNum = parseInt(ankiId);
							if (ankiNoteIds.includes(ankiIdNum)) {
								// Compare with Anki data to determine if changed
								const ankiNoteData = ankiNotesData.get(ankiIdNum);
								if (ankiNoteData && this.compareFlashcardWithAnki(block.data, ankiNoteData)) {
									this.analysis.unchangedFlashcards.push(block);
								} else {
									this.analysis.changedFlashcards.push(block);
								}
								seenAnkiIds.add(ankiIdNum);
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
						file: file.path,
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
			const newSection = detailsContent.createEl('div', { cls: 'sync-section' });
			newSection.createEl('h4', { text: 'New Flashcards' });
			
			for (const flashcard of this.analysis.newFlashcards.slice(0, 5)) {
				const item = newSection.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-new' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `${flashcard.file}:${flashcard.lineStart}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-type',
					text: flashcard.data?.note_type
				});
			}
			
			if (this.analysis.newFlashcards.length > 5) {
				newSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.newFlashcards.length - 5} more`
				});
			}
		}
		
		// Changed flashcards
		if (this.analysis.changedFlashcards.length > 0) {
			const changedSection = detailsContent.createEl('div', { cls: 'sync-section' });
			changedSection.createEl('h4', { text: 'Changed Flashcards' });
			
			for (const flashcard of this.analysis.changedFlashcards.slice(0, 5)) {
				const item = changedSection.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-changed' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `${flashcard.file}:${flashcard.lineStart}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-type',
					text: flashcard.data?.note_type
				});
			}
			
			if (this.analysis.changedFlashcards.length > 5) {
				changedSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.changedFlashcards.length - 5} more`
				});
			}
		}
		
		// Unchanged flashcards
		if (this.analysis.unchangedFlashcards.length > 0) {
			const unchangedSection = detailsContent.createEl('div', { cls: 'sync-section' });
			unchangedSection.createEl('h4', { text: 'Unchanged Flashcards' });
			
			for (const flashcard of this.analysis.unchangedFlashcards.slice(0, 3)) {
				const item = unchangedSection.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-unchanged' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `${flashcard.file}:${flashcard.lineStart}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-type',
					text: flashcard.data?.note_type
				});
			}
			
			if (this.analysis.unchangedFlashcards.length > 3) {
				unchangedSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.unchangedFlashcards.length - 3} more`
				});
			}
		}
		
		// Deleted Anki notes
		if (this.analysis.deletedAnkiNotes.length > 0) {
			const deletedSection = detailsContent.createEl('div', { cls: 'sync-section' });
			deletedSection.createEl('h4', { text: 'Deleted from Anki' });
			
			for (const ankiId of this.analysis.deletedAnkiNotes.slice(0, 5)) {
				const item = deletedSection.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-deleted' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `Anki Note ID: ${ankiId}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-error',
					text: 'Will be deleted from Anki'
				});
			}
			
			if (this.analysis.deletedAnkiNotes.length > 5) {
				deletedSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.deletedAnkiNotes.length - 5} more`
				});
			}
		}
		
		// Invalid flashcards
		if (this.analysis.invalidFlashcards.length > 0) {
			const invalidSection = detailsContent.createEl('div', { cls: 'sync-section' });
			invalidSection.createEl('h4', { text: 'Invalid Flashcards' });
			
			for (const flashcard of this.analysis.invalidFlashcards.slice(0, 3)) { // Show first 3
				const item = invalidSection.createEl('div', { cls: 'sync-flashcard-item sync-flashcard-invalid' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `${flashcard.file}:${flashcard.lineStart}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-error',
					text: flashcard.error || 'Unknown error'
				});
			}
			
			if (this.analysis.invalidFlashcards.length > 3) {
				invalidSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.invalidFlashcards.length - 3} more`
				});
			}
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
				console.log(`${index + 1}. ${flashcard.file}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.note_type,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.anki_id || 'none',
					fields: Object.keys(flashcard.data?.content_fields || {}),
					data: flashcard.data
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.changedFlashcards.length > 0) {
			console.group('📝 Changed Flashcards');
			this.analysis.changedFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.file}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.note_type,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.anki_id,
					fields: Object.keys(flashcard.data?.content_fields || {}),
					data: flashcard.data
				});
			});
			console.groupEnd();
		}
		
		if (this.analysis.unchangedFlashcards.length > 0) {
			console.group('✅ Unchanged Flashcards');
			this.analysis.unchangedFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.file}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.note_type,
					tags: flashcard.data?.tags,
					ankiId: flashcard.data?.anki_id,
					fields: Object.keys(flashcard.data?.content_fields || {}),
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
				console.log(`${index + 1}. ${flashcard.file}:${flashcard.lineStart}`, {
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
}
