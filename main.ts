import {MarkdownPostProcessorContext, MarkdownView, Notice, Platform, Plugin} from 'obsidian';
import {AnkiService, YankiConnectAnkiService} from './anki-service';
import {NoteType} from './flashcard';
import {FlashcardInsertModal, FlashcardInsertModalProps} from './flashcard-insert-modal';
import {FlashcardCodeBlockProcessor} from './flashcard-renderer';
import {SyncAnalysis, SyncConfirmationModal, SyncProgressModal} from './sync-analysis';
import {DEFAULT_DECK, DEFAULT_IGNORED_TAGS, DEFAULT_NOTE_TYPE} from './constants';
import {ObsidianAnkiSettingTab} from './setting-tab';

interface PluginSettings {
	lastUsedNoteType: string;
	availableNoteTypes: NoteType[];
	defaultDeck: string;
	ignoredTags: string[];
}

const DEFAULT_SETTINGS: PluginSettings = {
	lastUsedNoteType: DEFAULT_NOTE_TYPE,
	availableNoteTypes: [],
	defaultDeck: DEFAULT_DECK,
	ignoredTags: DEFAULT_IGNORED_TAGS
}

export default class ObsidianAnkiPlugin extends Plugin {
	settings: PluginSettings;
	private ankiService: AnkiService;
	private ankiStatusBar: HTMLElement;
	availableDecks: string[] = []; // Made public for settings tab access
	private insertFlashcardButton: HTMLElement;
	private flashcardProcessor: FlashcardCodeBlockProcessor;

	async onload() {
		await this.loadSettings();

		// Initialize Anki Service (only on desktop)
		if (!this.isMobile()) {
			this.ankiService = new YankiConnectAnkiService(this.settings.ignoredTags);
		}

		// Initialize Flashcard Processor
		this.flashcardProcessor = new FlashcardCodeBlockProcessor(this.app);

		// Desktop-only: Sync to Anki ribbon button
		if (!this.isMobile()) {
			const ribbonIconEl = this.addRibbonIcon('star', 'Sync to Anki', async (_evt: MouseEvent) => {
				await this.connectToAnki('Sync operation');
				if (this.availableDecks.length === 0) {
					new Notice("Cannot connect to Anki");
					return;
				}
				await this.startSyncProcess();
			});
			ribbonIconEl.addClass('my-plugin-ribbon-class');
		}

		// Add ribbon icon for inserting flashcards
		this.insertFlashcardButton = this.addRibbonIcon('file-plus', 'Insert Flashcard', (_evt: MouseEvent) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				// Check for mobile-specific requirements
				if (this.isMobile() && this.settings.availableNoteTypes.length === 0) {
					new Notice('No cached note types available. Please sync from desktop first to enable flashcard creation on mobile.', 5000);
					return;
				}

				const modalProps: FlashcardInsertModalProps = {
					availableNoteTypes: this.settings.availableNoteTypes,
					lastUsedNoteType: this.settings.lastUsedNoteType,
					onNoteTypeSelected: async (noteType: string) => {
						this.settings.lastUsedNoteType = noteType;
						await this.saveSettings();
					}
				};
				new FlashcardInsertModal(this.app, modalProps).open();
			}
		});
		this.insertFlashcardButton.addClass('insert-flashcard-ribbon-class');

		// Desktop-only: Status bar and Anki connection
		if (!this.isMobile()) {
			// This adds a status bar item to the bottom of the app
			this.ankiStatusBar = this.addStatusBarItem();
			
			// Connect to Anki on startup
			await this.connectToAnki('Plugin startup');

			// Connect to Anki every minute
			this.registerInterval(window.setInterval(() => {
				this.connectToAnki('Periodic check');
			}, 60 * 1000));
		}

		// Update button state when active view changes
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateInsertFlashcardButtonState();
		}));
		
		// Update button state initially
		this.updateInsertFlashcardButtonState();

		// Register flashcard code block processor
		this.registerMarkdownCodeBlockProcessor('flashcard', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			this.flashcardProcessor.render(source, el, ctx, this.settings.defaultDeck, this.settings.availableNoteTypes);
		});

		// Desktop-only: Register sync command for command palette
		if (!this.isMobile()) {
			this.addCommand({
				id: 'sync-to-anki',
				name: 'Sync to Anki',
				hotkeys: [{ modifiers: ['Mod', 'Ctrl'], key: 'a' }],
				callback: async () => {
					await this.connectToAnki('Sync command');
					if (this.availableDecks.length === 0) {
						new Notice("Cannot connect to Anki");
						return;
					}
					await this.startSyncProcess();
				}
			});
		}

		this.addCommand({
			id: 'insert-flashcard',
			name: 'Insert flashcard',
			hotkeys: [{ modifiers: ['Mod', 'Ctrl'], key: 'f' }],
			editorCallback: (_editor, _view) => {
				// Check for mobile-specific requirements
				if (this.isMobile() && this.settings.availableNoteTypes.length === 0) {
					new Notice('No cached note types available. Please sync from desktop first to enable flashcard creation on mobile.', 5000);
					return;
				}

				const modalProps: FlashcardInsertModalProps = {
					availableNoteTypes: this.settings.availableNoteTypes,
					lastUsedNoteType: this.settings.lastUsedNoteType,
					onNoteTypeSelected: async (noteType: string) => {
						this.settings.lastUsedNoteType = noteType;
						await this.saveSettings();
					}
				};
				new FlashcardInsertModal(this.app, modalProps).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianAnkiSettingTab(this.app, this));
	}

	onunload() {

	}

	private isMobile(): boolean {
		return Platform.isMobileApp;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async connectToAnki(context: string) {
		// Skip Anki connection on mobile
		if (this.isMobile()) {
			console.log(`[${context}] Skipping Anki connection on mobile platform`);
			return;
		}

		try {
			const [noteTypes, deckNames] = await Promise.all([
				this.ankiService.getNoteTypes(),
				this.ankiService.getDeckNames()
			]);
			
			this.availableDecks = deckNames;

			// Check if the current default deck is still valid, if not reset to DEFAULT_DECK
			if (deckNames.length > 0 && !deckNames.includes(this.settings.defaultDeck)) {
				console.warn(`Default deck '${this.settings.defaultDeck}' not found in Anki. Resetting to '${DEFAULT_DECK}'.`);
				this.settings.defaultDeck = deckNames.includes(DEFAULT_DECK) ? DEFAULT_DECK : deckNames[0];
			}

			// Save note types and deck validation to settings
			this.settings.availableNoteTypes = noteTypes;
			await this.saveSettings();

			console.log(`[${context}] Anki connection successful. Note types with fields:`, this.settings.availableNoteTypes, 'Decks:', this.availableDecks);
			this.ankiStatusBar.setText(`🟢 Anki: ${deckNames.length} decks`);
			
			// Update button state since note types might have changed
			this.updateInsertFlashcardButtonState();
		} catch (error) {
			this.availableDecks = [];
			// Note: availableNoteTypes remain in settings from the last successful connection
			console.log(`[${context}] Anki connection failed:`, error);
			this.ankiStatusBar.setText('🔴 Anki disconnected');
			
			// Update button state since note types are now from cache
			this.updateInsertFlashcardButtonState();
		}
	}

	private updateInsertFlashcardButtonState() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const hasNoteTypes = this.settings.availableNoteTypes.length > 0;
		const isEnabled = activeView !== null && hasNoteTypes;
		
		if (isEnabled) {
			this.insertFlashcardButton.removeClass('is-disabled');
			this.insertFlashcardButton.setAttribute('aria-label', 'Insert Flashcard');
		} else {
			this.insertFlashcardButton.addClass('is-disabled');
			let reason = '';
			if (!activeView) {
				reason = 'No markdown editor active';
			} else if (!hasNoteTypes) {
				reason = this.isMobile() ? 'No cached note types available (sync from desktop first)' : 'No Anki note types available';
			}
			this.insertFlashcardButton.setAttribute('aria-label', `Insert Flashcard (${reason})`);
		}
	}

	private async startSyncProcess() {
		try {
			// Show progress modal and start scanning
			const progressModal = new SyncProgressModal(this.app, this.ankiService, this.settings.availableNoteTypes, { defaultDeck: this.settings.defaultDeck }, (analysis: SyncAnalysis) => {
				// When scanning is complete, show confirmation modal
				new SyncConfirmationModal(this.app, analysis, this.ankiService, this.settings).open();
			});
			progressModal.open();
		} catch (error) {
			console.error('Failed to start sync process:', error);
			new Notice('Failed to start sync process');
		}
	}
}
