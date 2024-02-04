import { EditableFileView, EventRef, Events, Keymap, Notice, PaneType, Platform, Plugin, TFile, loadPdfJs, requireApiVersion, setIcon } from 'obsidian';
import * as pdflib from '@cantoo/pdf-lib';
// import * as pdfAnnotate from 'annotpdf';

import { patchPDF } from 'patchers/pdf';
import { patchBacklink } from 'patchers/backlink';
import { patchWorkspace } from 'patchers/workspace';
import { patchPagePreview } from 'patchers/page-preview';
import { PDFPlusAPI } from 'api';
import { SelectToCopyMode } from 'select-to-copy';
import { ColorPalette } from 'color-palette';
import { DomManager } from 'dom-manager';
import { PDFInternalLinkHoverParent } from 'pdf-internal-links';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from 'settings';
import { subpathToParams, OverloadParameters } from 'utils';
import { DestArray, PDFEmbed, PDFView, PDFViewerChild } from 'typings';


export default class PDFPlus extends Plugin {
	/** This API is not intended to be used by other plugins. */
	api: PDFPlusAPI = new PDFPlusAPI(this);
	/** User's preferences. */
	settings: PDFPlusSettings;
	/** Maps a `div.pdf-viewer` element to the corresponding `PDFViewerChild` object. */
	pdfViwerChildren: Map<HTMLElement, PDFViewerChild> = new Map();
	/** Manages DOMs and event handlers introduced by this plugin. */
	domManager: DomManager;
	/** When loaded, just selecting a range of text in a PDF viewer will run the `copy-link-to-selection` command. */
	selectToCopyMode: SelectToCopyMode;
	events: Events = new Events();
	/** PDF++ relies on monkey-patching several aspects of Obsidian's internals. This property keeps track of the patching status (succeeded or not). */
	patchStatus = {
		workspace: false,
		pagePreview: false,
		pdf: false,
		backlink: false
	};
	/** 
	 * Tracks the markdown file that a link to a PDF text selection or an annotation was pasted into for the last time. 
	 * Used for auto-pasting.
	 */
	lastPasteFile: TFile | null = null;
	/** Tracks the PDFViewerChild instance that an annotation popup was rendered on for the last time. */
	lastAnnotationPopupChild: PDFViewerChild | null = null;
	/** Stores the file and the explicit destination array corresponding to the last link copied with the "Copy link to current page view" command */
	lastCopiedDestInfo: { file: TFile, destArray: DestArray } | { file: TFile, destName: string } | null = null;

	async onload() {
		this.checkVersion();

		await loadPdfJs();

		await this.loadSettings();
		await this.saveSettings();
		this.addSettingTab(new PDFPlusSettingTab(this));

		this.domManager = this.addChild(new DomManager(this));

		this.selectToCopyMode = this.addChild(new SelectToCopyMode(this));
		this.selectToCopyMode.unload(); // disabled by default

		this.patchObsidian();

		this.registerPDFEmbedCreator();

		this.registerHoverLinkSource('pdf-plus', {
			defaultMod: true,
			display: 'PDF++ hover action'
		});

		this.registerCommands();

		this.registerGlobalVariables();

		this.registerGlobalDomEvents();

		this.registerEvents();
	}

	private checkVersion() {
		if (requireApiVersion('1.5.4')) {
			const notice = new Notice(`${this.manifest.name}: This plugin has not been tested on Obsidian v1.5.4 or above. Please report any issue you encounter on `, 0);
			notice.noticeEl.append(createEl('a', { href: 'https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new', text: 'GitHub' }));
			notice.noticeEl.appendText('.');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		/** migration from legacy settings */

		if (this.settings.paneTypeForFirstMDLeaf as PaneType | '' === 'split') {
			this.settings.paneTypeForFirstMDLeaf = 'right';
		}

		for (const cmd of this.settings.copyCommands) {
			// @ts-ignore
			if (cmd.hasOwnProperty('format')) {
				// @ts-ignore
				cmd.template = cmd.format;
				// @ts-ignore
				delete cmd.format;
			}
		}

		if (this.settings.hasOwnProperty('aliasFormat')) {
			this.settings.displayTextFormats.push({
				name: 'Custom',
				// @ts-ignore
				template: this.settings.aliasFormat
			});
			// @ts-ignore
			delete this.settings.aliasFormat;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private patchObsidian() {
		this.app.workspace.onLayoutReady(() => patchWorkspace(this));
		this.tryPatchPeriodicallyUntilSuccess(patchPagePreview, 300);
		this.tryPatchUntilSuccess(patchPDF, () => {
			this.api.workspace.iteratePDFViews(async (view) => {
				// reflect the patch to existing PDF views
				// especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu)
				view.viewer.unload();
				view.viewer.load();
				const file = view.file;
				if (file) {
					view.viewer.loadFile(file);
				}
			});
		}, {
			message: 'Some features for PDF embeds will not be activated until a PDF file is opened in a viewer.',
			duration: 7000
		});
		this.tryPatchUntilSuccess(patchBacklink, () => {
			this.api.workspace.iterateBacklinkViews((view) => {
				// reflect the patch to existing backlink views
				if (view.file?.extension === 'pdf') {
					view.onLoadFile(view.file);
				}
			});
		});
	}

	tryPatchUntilSuccess(patcher: (plugin: PDFPlus) => boolean, onSuccess?: () => any, noticeOnFail?: { message: string, duration?: number }) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (success) onSuccess?.();
			else {
				const notice = noticeOnFail ? new Notice(`${this.manifest.name}: ${noticeOnFail.message}`, noticeOnFail.duration) : null;

				const eventRef = this.app.workspace.on('layout-change', () => {
					const success = patcher(this);
					if (success) {
						this.app.workspace.offref(eventRef);
						notice?.hide();
						onSuccess?.();
					}
				});
				this.registerEvent(eventRef);
			}
		});
	}

	tryPatchPeriodicallyUntilSuccess(patcher: (plugin: PDFPlus) => boolean, periodMs?: number) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (!success) {
				const timer = window.setInterval(() => {
					const success = patcher(this);
					if (success) {
						window.clearInterval(timer);
					}
				}, periodMs);
				this.registerInterval(timer);
			}
		});
	}

	/** 
	 * Registers an HTML element that will be refreshed when a style setting is updated
	 * and will be removed when the plugin gets unloaded. 
	 */
	registerEl<HTMLElementType extends HTMLElement>(el: HTMLElementType) {
		this.register(() => el.remove());
		return el;
	}

	loadStyle() {
		this.domManager.update();
	}

	private registerPDFEmbedCreator() {
		const originalPDFEmbedCreator = this.app.embedRegistry.embedByExtension['pdf'];

		this.register(() => {
			this.app.embedRegistry.unregisterExtension('pdf');
			this.app.embedRegistry.registerExtension('pdf', originalPDFEmbedCreator);
		});

		this.app.embedRegistry.unregisterExtension('pdf');
		this.app.embedRegistry.registerExtension('pdf', (ctx, file, subpath) => {
			const embed = originalPDFEmbedCreator(ctx, file, subpath) as PDFEmbed;
			embed.viewer.then((child) => {
				if (this.settings.noSidebarInEmbed) {
					child.pdfViewer.pdfSidebar.open = function () {
						this.close();
					};
				}
			});
			const params = subpathToParams(subpath);
			if (params.has('color')) {
				embed.containerEl.dataset.highlightColor = params.get('color')!.toLowerCase();
			} else if (this.settings.defaultColor) {
				embed.containerEl.dataset.highlightColor = this.settings.defaultColor.toLowerCase();
			}
			return embed;
		});
	}

	private registerGlobalVariable(name: string, value: any, throwError: boolean = true) {
		if (name in window) {
			if (throwError) throw new Error(`${this.manifest.name}: Global variable "${name}" already exists.`);
			else return;
		}
		// @ts-ignore
		window[name] = value;
		// @ts-ignore
		this.register(() => delete window[name]);
	}

	private registerGlobalVariables() {
		this.registerGlobalVariable('pdfPlus', this, false);
		this.registerGlobalVariable('pdflib', pdflib, false);
		// this.registerGlobalVariable('pdfAnnotate', pdfAnnotate, false);
	}

	registerGlobalDomEvent<K extends keyof DocumentEventMap>(type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
		this.api.registerGlobalDomEvent(this, type, callback, options);
	}

	private registerGlobalDomEvents() {
		this.enhancePDFInternalLinks();

		// Make PDF embeds with a subpath unscrollable
		this.registerGlobalDomEvent('wheel', (evt) => {
			if (this.settings.embedUnscrollable
				&& evt.target instanceof HTMLElement
				&& evt.target.closest('.pdf-embed[src*="#"] .pdf-viewer-container')) {
				evt.preventDefault();
			}
		}, { passive: false });

		// Double-lick PDF embeds to open links
		this.registerGlobalDomEvent('dblclick', (evt) => {
			if (this.settings.dblclickEmbedToOpenLink && evt.target instanceof HTMLElement) {
				// .pdf-container is necessary to avoid opening links when double-clicking on the toolbar
				const linktext = evt.target.closest('.pdf-embed[src] > .pdf-container')?.parentElement!.getAttribute('src');
				if (linktext) {
					const viewerEl = evt.target.closest<HTMLElement>('div.pdf-viewer');
					const sourcePath = viewerEl ? (this.pdfViwerChildren.get(viewerEl)?.file?.path ?? '') : '';
					this.app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt));
					evt.preventDefault();
				}
			}
		});
	}

	private enhancePDFInternalLinks() {
		// record history when clicking an internal link IN a PDF file
		this.registerGlobalDomEvent('click', (evt) => {
			if (this.settings.recordPDFInternalLinkHistory
				&& evt.target instanceof HTMLElement
				&& evt.target.closest('section.linkAnnotation[data-internal-link]')) {
				const targetEl = evt.target;
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(targetEl)) {
						leaf.recordHistory(leaf.getHistoryState());
					}
				});
			}
		});

		// Hover+Mod to show popover preview of PDF internal links
		this.registerGlobalDomEvent('mouseover', (event) => {
			if (this.settings.enableHoverPDFInternalLink
				&& event.target instanceof HTMLElement
				&& event.target.matches('section.linkAnnotation[data-internal-link] > a[href^="#"]')) {
				const targetEl = event.target as HTMLAnchorElement;
				const destId = targetEl.getAttribute('href')!.slice(1);

				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(targetEl)) {
						const view = leaf.view as PDFView;
						if (!view.file) return;

						view.viewer.then(async (child) => {
							const doc = child.pdfViewer.pdfViewer?.pdfDocument;
							if (!doc) return;

							const subpath = await this.api.destIdToSubpath(destId, doc);
							if (subpath === null) return;
							const linktext = view.file!.path + subpath;

							this.app.workspace.trigger('hover-link', {
								event,
								source: 'pdf-plus',
								hoverParent: new PDFInternalLinkHoverParent(this, destId),
								targetEl,
								linktext
							});
						});
					}
				});
			}
		});
	}

	private registerEvents() {
		// keep this.pdfViewerChildren up-to-date
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			for (const viewerEl of this.pdfViwerChildren.keys()) {
				if (!viewerEl?.isShown()) this.pdfViwerChildren.delete(viewerEl);
			}
		}));

		// Sync the external app with Obsidian
		if (Platform.isDesktopApp) {
			this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
				if (this.settings.syncWithDefaultApp && leaf && leaf.view instanceof EditableFileView && leaf.view.file?.extension === 'pdf') {
					const file = leaf.view.file;
					this.app.openWithDefaultApp(file.path);
					if (this.settings.focusObsidianAfterOpenPDFWithDefaultApp) {
						open('obsidian://'); // move focus back to Obsidian
					}
				}
			}));
		}
	}

	registerOneTimeEvent<T extends Events>(events: T, ...[evt, callback, ctx]: OverloadParameters<T['on']>) {
		const eventRef = events.on(evt, (...args: any[]) => {
			callback.call(ctx, ...args);
			events.offref(eventRef);
		}, ctx);
		this.registerEvent(eventRef);
	}

	private registerCommands() {
		this.addCommand({
			id: 'copy-link-to-selection',
			name: 'Copy link to selection or annotation',
			checkCallback: (checking) => this.copyLink(checking, false)
		});

		this.addCommand({
			id: 'copy-auto-paste-link-to-selection',
			name: 'Copy & auto-paste link to selection or annotation',
			checkCallback: (checking) => this.copyLink(checking, true)
		});

		this.addCommand({
			id: 'copy-link-to-page-view',
			name: 'Copy link to current page view',
			checkCallback: (checking) => this.copyLinkToPageView(checking)
		});
	}

	copyLink(checking: boolean, autoPaste: boolean = false) {
		if (!this.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, autoPaste)) {
			if (!this.copyLinkToAnnotation(checking, autoPaste)) {
				return this.copyLinkToSelection(checking, autoPaste);
			}
		}
		return true;
	}

	copyLinkToSelection(checking: boolean, autoPaste: boolean = false) {
		const palette = this.api.getColorPaletteAssociatedWithSelection();
		if (!palette) return false;
		const template = this.settings.copyCommands[palette.actionIndex].template;

		// get the currently selected color name
		const colorName = palette.selectedColorName ?? undefined;

		return this.api.copyLink.copyLinkToSelection(checking, template, colorName, autoPaste);
	}

	copyLinkToAnnotation(checking: boolean, autoPaste: boolean = false) {
		const child = this.lastAnnotationPopupChild;
		if (!child) return false;
		const popupEl = child.activeAnnotationPopupEl;
		if (!popupEl) return false;
		const copyButtonEl = popupEl.querySelector<HTMLElement>('.popupMeta > div.clickable-icon.pdf-plus-copy-annotation-link');
		if (!copyButtonEl) return false;

		const palette = this.api.getColorPaletteAssociatedWithNode(copyButtonEl);
		let template;
		if (palette) {
			template = this.settings.copyCommands[palette.actionIndex].template;
		} else {
			// If this PDF viewer is embedded in a markdown file and the "Show color palette in PDF embeds as well" is set to false,
			// there will be no color palette in the toolbar of this PDF viewer.
			// In this case, use the default color palette action.
			template = this.settings.copyCommands[this.settings.defaultColorPaletteActionIndex].template;
		}
		const annotInfo = this.api.getAnnotationInfoFromPopupEl(popupEl);
		if (!annotInfo) return false;
		const { page, id } = annotInfo;

		const result = this.api.copyLink.copyLinkToAnnotation(child, checking, template, page, id, autoPaste);

		if (!checking && result) setIcon(copyButtonEl, 'lucide-check');

		return result;
	}

	// TODO: A better, more concise function name 😅
	writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, autoPaste: boolean = false) {
		const palette = this.api.getColorPaletteAssociatedWithSelection();
		if (!palette) return false;

		if (!palette.writeFile) return false;

		const template = this.settings.copyCommands[palette.actionIndex].template;

		// get the currently selected color name
		const colorName = palette.selectedColorName ?? undefined;

		return this.api.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, template, colorName, autoPaste);
	}

	copyLinkToPageView(checking: boolean) {
		const view = this.getPDFView(true);
		if (!view || !view.file) return false;

		const state = view.getState();
		if (typeof state.left !== 'number' || typeof state.top !== 'number') return false;

		if (!checking) {
			let subpath = `#page=${state.page}`;
			let destArray: DestArray;
			const scaleValue = view.viewer.child?.pdfViewer.pdfViewer?.currentScaleValue;
			if (scaleValue === 'page-width') { // Destination type = "FitBH"
				subpath += `&offset=,${state.top},`;
				destArray = [state.page - 1, { name: 'FitBH' }, state.top];
			} else { // Destination type = "XYZ"
				subpath += `&offset=${state.left},${state.top},${state.zoom ?? 0}`;
				destArray = [state.page - 1, { name: 'XYZ' }, state.left, state.top, state.zoom ?? 0];
			}
			const display = view.viewer.child?.getPageLinkAlias(state.page);
			const link = this.api.generateMarkdownLink(view.file, '', subpath, display).slice(1);
			navigator.clipboard.writeText(link);
			new Notice(`${this.manifest.name}: Link copied to clipboard`);

			this.lastCopiedDestInfo = { file: view.file, destArray };
		}

		return true;
	}

	on(evt: 'highlight', callback: (data: { type: 'selection' | 'annotation', source: 'obsidian' | 'pdf-plus', pageNumber: number, child: PDFViewerChild }) => any, context?: any): EventRef;
	on(evt: 'color-palette-state-change', callback: (data: { source: ColorPalette }) => any, context?: any): EventRef;

	on(evt: string, callback: (...data: any) => any, context?: any): EventRef {
		return this.events.on(evt, callback, context);
	}

	off(evt: string, callback: (...data: any) => any) {
		this.events.off(evt, callback);
	}

	offref(ref: EventRef) {
		this.events.offref(ref);
	}

	trigger(evt: 'highlight', data: { type: 'selection' | 'annotation', source: 'obsidian' | 'pdf-plus', pageNumber: number, child: PDFViewerChild }): void;
	trigger(evt: 'color-palette-state-change', data: { source: ColorPalette }): void;

	trigger(evt: string, ...args: any[]): void {
		this.events.trigger(evt, ...args);
	}

	// console utilities

	getPDFView(activeOnly: boolean = false): PDFView | undefined {
		const leaf = this.app.workspace.activeLeaf;
		if (leaf?.view.getViewType() === 'pdf') return leaf.view as PDFView;
		if (!activeOnly) return this.app.workspace.getLeavesOfType('pdf')[0]?.view as PDFView | undefined;
	}

	getPDFViewer(activeOnly: boolean = false) {
		return this.getPDFView(activeOnly)?.viewer;
	}

	getPDFViewerChild(activeOnly: boolean = false) {
		return this.getPDFViewer(activeOnly)?.child;
	}

	getObsidianViewer(activeOnly: boolean = false) {
		return this.getPDFViewerChild(activeOnly)?.pdfViewer;
	}

	getRawPDFViewer(activeOnly: boolean = false) {
		return this.getObsidianViewer(activeOnly)?.pdfViewer;
	}

	getToolbar(activeOnly: boolean = false) {
		return this.getPDFViewerChild(activeOnly)?.toolbar;
	}

	getPage(activeOnly: boolean = false) {
		const viewer = this.getRawPDFViewer(activeOnly);
		if (viewer) {
			return viewer.getPageView(viewer.currentPageNumber - 1);
		}
		return null;
	}

	getPDFDocument(activeOnly: boolean = false) {
		return this.getRawPDFViewer(activeOnly)?.pdfDocument;
	}

	async getPdfLibDocument(activeOnly: boolean = false) {
		const doc = this.getPDFDocument(activeOnly);
		if (doc) {
			return await pdflib.PDFDocument.load(await doc.getData());
		}
	}

	async getPdfLibPage(activeOnly: boolean = false) {
		const pdfViewer = this.getRawPDFViewer(activeOnly);
		if (!pdfViewer) return;
		const pageNumber = pdfViewer.currentPageNumber;
		if (pageNumber === undefined) return;
		const doc = await pdflib.PDFDocument.load(await pdfViewer.pdfDocument.getData());
		if (doc) {
			return doc.getPage(pageNumber - 1);
		}
	}
}
