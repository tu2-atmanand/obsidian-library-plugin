import { App, Menu, Platform } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusAPI } from 'api';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'annotation-modals';
import { toSingleLine } from 'utils';
import { PDFViewerChild } from 'typings';


export class PDFPlusContextMenu extends Menu {
    app: App
    plugin: PDFPlus
    api: PDFPlusAPI;
    child: PDFViewerChild

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super();
        this.app = plugin.app;
        this.plugin = plugin;
        this.api = plugin.api;
        this.child = child;
    }

    static async fromMouseEvent(plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent) {
        const menu = new PDFPlusContextMenu(plugin, child);
        menu.addSections(['action', 'selection', 'write-file', 'annotation', 'modify-annotation', 'link']);
        await menu.addItems(evt);
        return menu;
    }

    // TODO: divide into smaller methods
    async addItems(evt: MouseEvent) {
        const { child, plugin, api, app } = this;

        const selection = toSingleLine(evt.win.getSelection()?.toString() ?? '');

        // Get page number
        const pageNumber = api.getPageNumberFromEvent(evt);
        if (pageNumber === null) return;

        // If macOS, add "look up selection" action
        if (Platform.isMacOS && Platform.isDesktopApp && evt.win.electron && selection) {
            this.addItem((item) => {
                return item
                    .setSection("action")
                    .setTitle(`Look up "${selection.length <= 25 ? selection : selection.slice(0, 24).trim() + '…'}"`)
                    .setIcon("lucide-library")
                    .onClick(() => {
                        // @ts-ignore
                        evt.win.electron!.remote.getCurrentWebContents().showDefinitionForSelection();
                    });
            });
        }

        //// Add items ////

        const formats = plugin.settings.copyCommands;

        // copy selected text only //
        if (selection) {
            this.addItem((item) => {
                return item
                    .setSection('selection')
                    .setTitle('Copy text')
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        // How does the electron version differ?
                        navigator.clipboard.writeText(selection);
                    });
            });

            // copy with custom formats //

            // get the currently selected color name
            const palette = api.getColorPaletteFromChild(child);
            const colorName = palette?.selectedColorName ?? undefined;
            // check whether to write highlight to file or not
            // const writeFile = palette?.writeFile;


            // if (!writeFile) {
            for (const { name, template } of formats) {
                this.addItem((item) => {
                    return item
                        .setSection('selection')
                        .setTitle(`Copy link to selection with format "${name}"`)
                        .setIcon('lucide-copy')
                        .onClick(() => {
                            api.copyLink.copyLinkToSelection(false, template, colorName);
                        });
                });
            }
            // } else {
            if (plugin.settings.enalbeWriteHighlightToFile) {
                for (const { name, template } of formats) {
                    this.addItem((item) => {
                        return item
                            .setSection('write-file')
                            .setTitle(`Write highlight to PDF & copy link with format "${name}"`)
                            .setIcon('lucide-save')
                            .onClick(() => {
                                api.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(false, template, colorName);
                            });
                    });
                }
            }
            // }
        }

        // Get annotation & annotated text
        const pageView = child.getPage(pageNumber);
        const annot = child.getAnnotationFromEvt(pageView, evt);

        await (async () => {
            if (annot) {
                const { id } = api.getAnnotationInfoFromAnnotationElement(annot);
                const annotatedText = await child.getAnnotatedText(pageView, id);

                if (annot.data.subtype === 'Link') {
                    const doc = child.pdfViewer.pdfViewer?.pdfDocument;
                    if ('dest' in annot.data && typeof annot.data.dest === 'string' && doc && child.file) {
                        const destId = annot.data.dest;
                        const file = child.file;
                        // copy PDF internal link as Obsidian wikilink (or markdown link) //
                        this.addItem((item) => {
                            return item
                                .setSection('link')
                                .setTitle('Copy PDF link as Obsidian link')
                                .setIcon('lucide-copy')
                                .onClick(async () => {
                                    const subpath = await api.destIdToSubpath(destId, doc);
                                    if (typeof subpath === 'string') {
                                        let display = annotatedText;
                                        if (!display && annot.data.rect) {
                                            display = child.getTextByRect(pageView, annot.data.rect);
                                        }
                                        const link = api.generateMarkdownLink(file, '', subpath, display).slice(1);
                                        // How does the electron version differ?
                                        navigator.clipboard.writeText(link);
                                        plugin.lastCopiedDestInfo = { file, destName: destId };
                                    }
                                });
                        })
                    }
                }

                // copy annotated text only //
                if (annotatedText) {
                    this.addItem((item) => {
                        return item
                            .setSection('annotation')
                            .setTitle('Copy annotated text')
                            .setIcon('lucide-copy')
                            .onClick(() => {
                                // How does the electron version differ?
                                navigator.clipboard.writeText(annotatedText);
                            });
                    })
                }

                // copy link to annotation with custom formats //
                for (const { name, template } of formats) {
                    this.addItem((item) => {
                        return item
                            .setSection('annotation')
                            .setTitle(`Copy link to annotation with format "${name}"`)
                            .setIcon('lucide-copy')
                            .onClick(() => {
                                api.copyLink.copyLinkToAnnotation(child, false, template, pageNumber, id, false, true);
                            });
                    });
                }

                // edit & delete annotation //
                if (plugin.settings.enalbeWriteHighlightToFile) {
                    if (plugin.settings.enableAnnotationContentEdit && PDFAnnotationEditModal.isSubtypeSupported(annot.data.subtype)) {
                        const subtype = annot.data.subtype;
                        this.addItem((item) => {
                            return item
                                .setSection('modify-annotation')
                                .setTitle('Edit annotation')
                                .setIcon('lucide-pencil')
                                .onClick(() => {
                                    if (child.file) {
                                        PDFAnnotationEditModal
                                            .forSubtype(subtype, plugin, child.file, pageNumber, id)
                                            .open();
                                    }
                                });
                        });
                    }

                    if (plugin.settings.enableAnnotationDeletion) {
                        this.addItem((item) => {
                            return item
                                .setSection('modify-annotation')
                                .setTitle('Delete annotation')
                                .setIcon('lucide-trash')
                                .onClick(() => {
                                    if (child.file) {
                                        new PDFAnnotationDeleteModal(plugin, child.file, pageNumber, id)
                                            .openIfNeccessary();
                                    }
                                });
                        });
                    }
                }
            }
        })();

        // Add a PDF internal link to selection
        if (selection
            && plugin.settings.enalbeWriteHighlightToFile
            && plugin.lastCopiedDestInfo
            && plugin.lastCopiedDestInfo.file === child.file) {
            if ('destArray' in plugin.lastCopiedDestInfo) {
                const destArray = plugin.lastCopiedDestInfo.destArray;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied link to selection')
                        .setIcon('lucide-paste')
                        .onClick(() => {
                            api.highlight.writeFile.addLinkAnnotationToSelection(destArray);
                        });
                });
            } else if ('destName' in plugin.lastCopiedDestInfo) {
                const destName = plugin.lastCopiedDestInfo.destName;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied link to selection')
                        .setIcon('lucide-paste')
                        .onClick(() => {
                            api.highlight.writeFile.addLinkAnnotationToSelection(destName);
                        });
                });
            }
        }

        app.workspace.trigger('pdf-menu', this, {
            pageNumber,
            selection,
            annot
        });
    }
}
