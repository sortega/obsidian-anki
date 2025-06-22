import { App, Modal, Notice } from 'obsidian';
import { YankiConnect } from 'yanki-connect';
import { FlashcardData, BlockFlashcardParser } from './flashcard';

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
	private ankiConnect: YankiConnect;
	private vaultName: string;

	constructor(app: App, ankiConnect: YankiConnect, onComplete: (analysis: SyncAnalysis) => void) {
		super(app);
		this.onComplete = onComplete;
		this.ankiConnect = ankiConnect;
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
			// Search for notes with our plugin tags
			const vaultTag = `obsidian-vault::${this.vaultName}`;
			const searchQuery = `tag:obsidian-synced AND tag:${vaultTag}`;
			
			this.updateProgress(0.1, 'Searching Anki for existing notes...');
			
			const ankiNoteIds = await this.ankiConnect.note.findNotes({ query: searchQuery });
			
			this.updateProgress(0.2, `Found ${ankiNoteIds.length} existing notes in Anki`);
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

		for (let i = 0; i < markdownFiles.length; i++) {
			const file = markdownFiles[i];
			const progressPercent = 0.2 + (0.7 * i / markdownFiles.length); // 20% to 90%
			this.updateProgress(progressPercent, `Processing: ${file.path}`);

			try {
				const content = await this.app.vault.read(file);
				const blocks = this.extractFlashcardBlocks(content, file.path);
				this.analysis.flashcardBlocks.push(...blocks);

				// Process and categorize each block
				for (const block of blocks) {
					const parseResult = BlockFlashcardParser.parseFlashcard(block.content);
					if (parseResult.data) {
						block.data = parseResult.data;
						
						// Categorize immediately
						const ankiId = block.data.anki_id;
						if (ankiId) {
							// Flashcard has anki_id - check if it exists in Anki
							const ankiIdNum = parseInt(ankiId);
							if (ankiNoteIds.includes(ankiIdNum)) {
								// TODO: For now, assume all existing cards are unchanged
								// In the future, we could compare content hashes
								this.analysis.unchangedFlashcards.push(block);
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

			// Small delay to allow UI updates
			if (i % 5 === 0) {
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


	private extractFlashcardBlocks(content: string, filePath: string): FlashcardBlock[] {
		const blocks: FlashcardBlock[] = [];
		const lines = content.split('\n');
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			
			// Look for flashcard code block start
			if (line.trim() === '```flashcard') {
				const startLine = i;
				let endLine = -1;
				let blockContent = '';
				
				// Find the end of the code block
				for (let j = i + 1; j < lines.length; j++) {
					if (lines[j].trim() === '```') {
						endLine = j;
						break;
					}
					blockContent += lines[j] + '\n';
				}
				
				if (endLine !== -1) {
					blocks.push({
						file: filePath,
						lineStart: startLine + 1, // 1-indexed for user display
						lineEnd: endLine + 1,
						content: blockContent.trim()
					});
					i = endLine; // Skip to end of block
				}
			}
		}
		
		return blocks;
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
					text: flashcard.data?.note_type || 'Basic'
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
					text: flashcard.data?.note_type || 'Basic'
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
					text: flashcard.data?.note_type || 'Basic'
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
					fields: Object.keys(flashcard.data || {}).filter(key => 
						!['note_type', 'anki_id', 'tags'].includes(key)
					),
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
					fields: Object.keys(flashcard.data || {}).filter(key => 
						!['note_type', 'anki_id', 'tags'].includes(key)
					),
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
					fields: Object.keys(flashcard.data || {}).filter(key => 
						!['note_type', 'anki_id', 'tags'].includes(key)
					),
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
