import { App, Modal, Notice } from 'obsidian';
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
	validFlashcards: FlashcardBlock[];
	invalidFlashcards: FlashcardBlock[];
}

export class SyncProgressModal extends Modal {
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;
	private analysis: SyncAnalysis;
	private onComplete: (analysis: SyncAnalysis) => void;

	constructor(app: App, onComplete: (analysis: SyncAnalysis) => void) {
		super(app);
		this.onComplete = onComplete;
		this.analysis = {
			totalFiles: 0,
			scannedFiles: 0,
			flashcardBlocks: [],
			validFlashcards: [],
			invalidFlashcards: []
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
			await this.scanVaultForFlashcards();
			this.onComplete(this.analysis);
			this.close();
		} catch (error) {
			console.error('Vault scanning failed:', error);
			new Notice('Failed to scan vault for flashcards');
			this.close();
		}
	}

	private async scanVaultForFlashcards() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		this.analysis.totalFiles = markdownFiles.length;

		this.updateProgress(0, `Found ${markdownFiles.length} markdown files`);

		for (let i = 0; i < markdownFiles.length; i++) {
			const file = markdownFiles[i];
			this.updateProgress(i / markdownFiles.length, `Scanning: ${file.path}`);

			try {
				const content = await this.app.vault.read(file);
				const blocks = this.extractFlashcardBlocks(content, file.path);
				this.analysis.flashcardBlocks.push(...blocks);

				// Process each block
				for (const block of blocks) {
					const parseResult = BlockFlashcardParser.parseFlashcard(block.content);
					if (parseResult.data) {
						block.data = parseResult.data;
						this.analysis.validFlashcards.push(block);
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
			if (i % 10 === 0) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
		}

		this.updateProgress(1, 'Scan complete!');
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
		
		statsContainer.createEl('div', { 
			cls: 'sync-stat-item',
			text: `📇 Total flashcard blocks: ${this.analysis.flashcardBlocks.length}`
		});
		
		statsContainer.createEl('div', { 
			cls: 'sync-stat-item sync-stat-valid',
			text: `✅ Valid flashcards: ${this.analysis.validFlashcards.length}`
		});
		
		if (this.analysis.invalidFlashcards.length > 0) {
			statsContainer.createEl('div', { 
				cls: 'sync-stat-item sync-stat-invalid',
				text: `❌ Invalid flashcards: ${this.analysis.invalidFlashcards.length}`
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
		
		// Valid flashcards
		if (this.analysis.validFlashcards.length > 0) {
			const validSection = detailsContent.createEl('div', { cls: 'sync-section' });
			validSection.createEl('h4', { text: 'Valid Flashcards' });
			
			for (const flashcard of this.analysis.validFlashcards.slice(0, 5)) { // Show first 5
				const item = validSection.createEl('div', { cls: 'sync-flashcard-item' });
				item.createEl('span', { 
					cls: 'sync-flashcard-file',
					text: `${flashcard.file}:${flashcard.lineStart}`
				});
				item.createEl('span', { 
					cls: 'sync-flashcard-type',
					text: flashcard.data?.note_type || 'Basic'
				});
			}
			
			if (this.analysis.validFlashcards.length > 5) {
				validSection.createEl('div', { 
					cls: 'sync-more-items',
					text: `... and ${this.analysis.validFlashcards.length - 5} more`
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
			validFlashcards: this.analysis.validFlashcards.length,
			invalidFlashcards: this.analysis.invalidFlashcards.length
		});

		if (this.analysis.validFlashcards.length > 0) {
			console.group('✅ Valid Flashcards');
			this.analysis.validFlashcards.forEach((flashcard, index) => {
				console.log(`${index + 1}. ${flashcard.file}:${flashcard.lineStart}`, {
					noteType: flashcard.data?.note_type,
					tags: flashcard.data?.tags,
					fields: Object.keys(flashcard.data || {}).filter(key => 
						!['note_type', 'anki_id', 'tags'].includes(key)
					),
					data: flashcard.data
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