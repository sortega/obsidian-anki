import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext } from 'obsidian';
import { AnkiService, YankiConnectAnkiService, AnkiNoteType } from './anki-service';
import { FlashcardInsertModal, FlashcardInsertModalProps } from './flashcard-insert-modal';
import { FlashcardCodeBlockProcessor } from './flashcard-renderer';
import { SyncProgressModal, SyncConfirmationModal, SyncAnalysis } from './sync-analysis';
import { DEFAULT_NOTE_TYPE, DEFAULT_DECK } from './constants';

// Remember to rename these classes and interfaces!

interface PluginSettings {
	lastUsedNoteType: string;
	availableNoteTypes: AnkiNoteType[];
	defaultDeck: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	lastUsedNoteType: DEFAULT_NOTE_TYPE,
	availableNoteTypes: [],
	defaultDeck: DEFAULT_DECK
}

export default class ObsidianAnkiPlugin extends Plugin {
	settings: PluginSettings;
	private ankiService: AnkiService;
	private ankiStatusBar: HTMLElement;
	availableDecks: string[] = []; // Made public for settings tab access
	private insertFlashcardButton: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Initialize Anki Service
		this.ankiService = new YankiConnectAnkiService();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('star', 'Sync to Anki', async (evt: MouseEvent) => {
			await this.connectToAnki('Sync operation');
			if (this.availableDecks.length === 0) {
				new Notice("Cannot connect to Anki");
				return;
			}
			await this.startSyncProcess();
		});
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// Add ribbon icon for inserting flashcards
		this.insertFlashcardButton = this.addRibbonIcon('file-plus', 'Insert Flashcard', (evt: MouseEvent) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
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

		// This adds a status bar item to the bottom of the app
		this.ankiStatusBar = this.addStatusBarItem();
		
		// Connect to Anki on startup
		await this.connectToAnki('Plugin startup');

		// Connect to Anki every 10 seconds
		this.registerInterval(window.setInterval(() => {
			this.connectToAnki('Periodic check');
		}, 10 * 1000));

		// Update button state when active view changes
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateInsertFlashcardButtonState();
		}));
		
		// Update button state initially
		this.updateInsertFlashcardButtonState();

		// Register flashcard code block processor
		this.registerMarkdownCodeBlockProcessor('flashcard', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			FlashcardCodeBlockProcessor.render(source, el, ctx);
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianAnkiSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async connectToAnki(context: string) {
		try {
			const [noteTypes, deckNames] = await Promise.all([
				this.ankiService.getNoteTypes(),
				this.ankiService.getDeckNames()
			]);
			
			this.availableDecks = deckNames;

			// Check if current default deck is still valid, if not reset to DEFAULT_DECK
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
			// Note: availableNoteTypes remain in settings from last successful connection
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
				reason = 'No Anki note types available';
			}
			this.insertFlashcardButton.setAttribute('aria-label', `Insert Flashcard (${reason})`);
		}
	}

	private async startSyncProcess() {
		try {
			// Show progress modal and start scanning
			const progressModal = new SyncProgressModal(this.app, this.ankiService, this.settings.availableNoteTypes, (analysis: SyncAnalysis) => {
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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ObsidianAnkiSettingTab extends PluginSettingTab {
	plugin: ObsidianAnkiPlugin;

	constructor(app: App, plugin: ObsidianAnkiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Default Deck setting
		const deckSetting = new Setting(containerEl)
			.setName('Default Deck')
			.setDesc('The deck where new flashcards will be created in Anki');

		if (this.plugin.availableDecks && this.plugin.availableDecks.length > 0) {
			// Use dropdown when deck information is available
			deckSetting.addDropdown(dropdown => dropdown
				.addOptions(this.plugin.availableDecks.reduce((options, deck) => {
					options[deck] = deck;
					return options;
				}, {} as Record<string, string>))
				.setValue(this.plugin.settings.defaultDeck)
				.onChange(async (value) => {
					this.plugin.settings.defaultDeck = value;
					await this.plugin.saveSettings();
				}));
		} else {
			// Fallback to text input when no deck information is available
			deckSetting.addText(text => text
				.setPlaceholder(DEFAULT_DECK)
				.setValue(this.plugin.settings.defaultDeck)
				.onChange(async (value) => {
					this.plugin.settings.defaultDeck = value || DEFAULT_DECK;
					await this.plugin.saveSettings();
				}));
		}

		// Available Note Types section
		const hasNoteTypes = this.plugin.settings.availableNoteTypes.length > 0;
		
		new Setting(containerEl)
			.setName('Anki Note Types')
			.setDesc(hasNoteTypes 
				? 'Note types saved from the last successful connection to Anki' 
				: 'No note types cached yet')
			.addButton(button => button
				.setButtonText('Reset Cache')
				.setDisabled(!hasNoteTypes)
				.onClick(async () => {
					this.plugin.settings.availableNoteTypes = [];
					await this.plugin.saveSettings();
					this.plugin['updateInsertFlashcardButtonState']();
					this.display();
				}));

		if (hasNoteTypes) {
			const noteTypesList = containerEl.createEl('div', { cls: 'cached-note-types-list' });
			noteTypesList.style.marginLeft = '20px';
			noteTypesList.style.marginTop = '10px';
			
			for (const noteType of this.plugin.settings.availableNoteTypes) {
				const noteTypeItem = noteTypesList.createEl('div', { cls: 'note-type-item' });
				noteTypeItem.style.marginBottom = '8px';
				
				const noteTypeName = noteTypeItem.createEl('strong', { text: noteType.name });
				noteTypeName.style.display = 'block';
				
				const fieldsText = noteTypeItem.createEl('small', { 
					text: `Fields: ${noteType.fields.join(', ')}`,
					cls: 'note-type-fields'
				});
				fieldsText.style.color = 'var(--text-muted)';
			}
		}
	}
}
